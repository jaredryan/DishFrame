import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as dishService from "@/lib/dishes/service";
import * as cookingService from "@/lib/cooking/service";
import * as tasterService from "@/lib/tasters/service";
import * as reviewService from "@/lib/reviews/service";
import {
  getRatingSummary,
  computeRatingSummary,
  computePrincipalRating,
  listReviewTasterOptions,
  getSessionEvidenceForEditor,
} from "@/lib/reviews/queries";
import { getLastCookedAt } from "@/lib/cooking/queries";
import { getStageSuggestion } from "@/lib/dishes/stage-suggestions";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { SaveSessionReviewInput } from "@/lib/reviews/schema";

/**
 * Slice 9 — Session Review, Cooking notes, Tasters/ratings, and the
 * learning loop. Covers the meaningful-content gate, Review/rating
 * editing and deletion evidence-preservation, one-rating-per-Taster,
 * aggregate/provisional rating selection, Last-cooked rules, and
 * authorization.
 */

function recipeContent(
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
  return {
    title: "Test Bowl",
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: "Prep",
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Rice",
            quantity: 2,
            quantityEnd: null,
            isApproximate: false,
            unit: "cups",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ text: "Cook rice." }],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

function partContent(
  title: string,
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
  return {
    title,
    stage: "IDEA",
    cuisine: null,
    description: null,
    yieldQuantity: 2,
    yieldUnit: "cups",
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: "Mix",
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Soy sauce",
            quantity: 1,
            quantityEnd: null,
            isApproximate: false,
            unit: "tbsp",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

/** Starts and immediately ends a standalone session for `dishId`, returning
 * the ended session id. */
async function endedSession(
  userId: string,
  dishId: string,
  outcome: "COMPLETED" | "ENDED_EARLY" = "COMPLETED",
) {
  const versionId = await currentVersionId(dishId);
  const version = await prisma.dishVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: { sections: true },
  });
  const sectionLineageId = version.sections[0]!.lineageId;
  const created = await cookingService.startCookingSession(userId, {
    dishId,
    dishVersionId: versionId,
    units: [{ unitKey: `section:${sectionLineageId}` }],
  });
  return cookingService.endCookingSession(userId, created.id, outcome);
}

describe("reviews and ratings", () => {
  let userId: string | undefined;
  let otherUserId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
    if (otherUserId) {
      await deleteTestUser(otherUserId);
      otherUserId = undefined;
    }
  });

  function reviewInput(
    sessionId: string,
    overrides: Partial<SaveSessionReviewInput> = {},
  ): SaveSessionReviewInput {
    return {
      sessionId,
      whatWentWell: null,
      whatDidNotGoWell: null,
      anythingElse: null,
      actualAmountQuantity: null,
      actualAmountUnit: null,
      reviewAdjustedDurationSeconds: null,
      ratings: [],
      ...overrides,
    };
  }

  it("persists a Review from text alone, rating alone, amount alone, or duration alone, but never from nothing", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );

    const textSession = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(textSession.id, { whatWentWell: "Turned out great." }),
    );
    expect(
      await prisma.sessionReview.findUnique({
        where: { sessionId: textSession.id },
      }),
    ).not.toBeNull();

    const ratingSession = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(ratingSession.id, {
        ratings: [{ tasterId: owner.id, value: 4 }],
      }),
    );
    expect(
      await prisma.sessionReview.findUnique({
        where: { sessionId: ratingSession.id },
      }),
    ).not.toBeNull();
    expect(
      await prisma.rating.count({ where: { sessionId: ratingSession.id } }),
    ).toBe(1);

    const amountSession = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(amountSession.id, {
        actualAmountQuantity: 5,
        actualAmountUnit: "servings",
      }),
    );
    expect(
      await prisma.sessionReview.findUnique({
        where: { sessionId: amountSession.id },
      }),
    ).not.toBeNull();

    const durationSession = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(durationSession.id, { reviewAdjustedDurationSeconds: 600 }),
    );
    expect(
      await prisma.sessionReview.findUnique({
        where: { sessionId: durationSession.id },
      }),
    ).not.toBeNull();

    const emptySession = await endedSession(userId, recipeId);
    const result = await reviewService.saveSessionReview(
      userId,
      reviewInput(emptySession.id),
    );
    expect(result.deleted).toBe(true);
    expect(
      await prisma.sessionReview.findUnique({
        where: { sessionId: emptySession.id },
      }),
    ).toBeNull();
  });

  it("rejects saving a Review while the session is still in progress", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const versionId = await currentVersionId(recipeId);
    const version = await prisma.dishVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { sections: true },
    });
    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: versionId,
      units: [{ unitKey: `section:${version.sections[0]!.lineageId}` }],
    });

    await expect(
      reviewService.saveSessionReview(
        userId,
        reviewInput(created.id, { whatWentWell: "Too soon." }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("edits a Review's text and rating set, and deletion removes ratings while preserving session/checklist/timer/Cooking-note evidence", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const mom = await tasterService.createTaster(userId, "Mom");
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);

    await reviewService.updateCookingNotes(
      userId,
      session.id,
      "Used bigger pot.",
    );

    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, {
        whatWentWell: "Great",
        ratings: [
          { tasterId: owner.id, value: 3 },
          { tasterId: mom.id, value: 5 },
        ],
      }),
    );
    expect(
      await prisma.rating.count({ where: { sessionId: session.id } }),
    ).toBe(2);

    // Edit: change text, drop Mom's rating, change owner's rating.
    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, {
        whatWentWell: "Even better on reflection",
        ratings: [{ tasterId: owner.id, value: 4 }],
      }),
    );
    const afterEdit = await prisma.rating.findMany({
      where: { sessionId: session.id },
    });
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0]!.value).toBe(4);
    expect(
      (
        await prisma.sessionReview.findUniqueOrThrow({
          where: { sessionId: session.id },
        })
      ).whatWentWell,
    ).toBe("Even better on reflection");

    await reviewService.deleteSessionReview(userId, session.id);

    expect(
      await prisma.sessionReview.findUnique({
        where: { sessionId: session.id },
      }),
    ).toBeNull();
    expect(
      await prisma.rating.count({ where: { sessionId: session.id } }),
    ).toBe(0);

    const survivingSession = await prisma.cookingSession.findUniqueOrThrow({
      where: { id: session.id },
      include: { units: { include: { checklistItems: true, timers: true } } },
    });
    expect(survivingSession.state).toBe("COMPLETED");
    expect(survivingSession.cookingNotes).toBe("Used bigger pot.");
    expect(survivingSession.units.length).toBeGreaterThan(0);
  });

  it("clearing a Taster's rating leaves no saved Rating and no separate attendance record (PRODUCT_SPEC.md §35.3)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const mom = await tasterService.createTaster(userId, "Mom");
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);

    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, {
        ratings: [
          { tasterId: owner.id, value: 4 },
          { tasterId: mom.id, value: 5 },
        ],
      }),
    );

    // Clearing Mom's stars (the UI's "click the same value again") means
    // resubmitting without her in the ratings array — no separate
    // present-but-unrated record is ever written for her.
    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, { ratings: [{ tasterId: owner.id, value: 4 }] }),
    );

    expect(
      await prisma.rating.findFirst({
        where: { sessionId: session.id, tasterId: mom.id },
      }),
    ).toBeNull();
    expect(
      await prisma.rating.count({ where: { sessionId: session.id } }),
    ).toBe(1);
    // Mom herself is untouched — clearing a rating never archives or
    // otherwise mutates the Taster record.
    const momAfter = await prisma.taster.findUniqueOrThrow({
      where: { id: mom.id },
    });
    expect(momAfter.archivedAt).toBeNull();
  });

  it("enforces one rating per Taster per save and rejects a Taster the caller does not own", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);

    await expect(
      reviewService.saveSessionReview(
        userId,
        reviewInput(session.id, {
          ratings: [
            { tasterId: owner.id, value: 3 },
            { tasterId: owner.id, value: 5 },
          ],
        }),
      ),
    ).rejects.toThrow(ValidationError);

    const other = await createTestUser();
    otherUserId = other.id;
    await initializeNewUser(otherUserId);
    const foreignTaster = await prisma.taster.findFirstOrThrow({
      where: { ownerId: otherUserId, isOwner: true },
    });

    await expect(
      reviewService.saveSessionReview(
        userId,
        reviewInput(session.id, {
          ratings: [{ tasterId: foreignTaster.id, value: 3 }],
        }),
      ),
    ).rejects.toThrow(ValidationError);
  });

  it("counts a deliberate Ended-early rating and recalculates the summary immediately after deletion", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId, "ENDED_EARLY");

    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, { ratings: [{ tasterId: owner.id, value: 5 }] }),
    );

    const summary = await getRatingSummary(
      recipeId,
      await currentVersionId(recipeId),
    );
    expect(summary.ratingCount).toBe(1);
    expect(summary.allTimeAverage).toBe(5);

    await reviewService.deleteSessionReview(userId, session.id);
    const afterDelete = await getRatingSummary(
      recipeId,
      await currentVersionId(recipeId),
    );
    expect(afterDelete.ratingCount).toBe(0);
    expect(afterDelete.allTimeAverage).toBeNull();
  });

  it("permanently deleting a Taster removes their ratings and recalculates summaries", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const mom = await tasterService.createTaster(userId, "Mom");
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, {
        ratings: [
          { tasterId: owner.id, value: 4 },
          { tasterId: mom.id, value: 2 },
        ],
      }),
    );

    const before = await getRatingSummary(
      recipeId,
      await currentVersionId(recipeId),
    );
    expect(before.ratingCount).toBe(2);
    expect(before.allTimeAverage).toBe(3);

    await tasterService.deleteTaster(userId, mom.id);

    const after = await getRatingSummary(
      recipeId,
      await currentVersionId(recipeId),
    );
    expect(after.ratingCount).toBe(1);
    expect(after.allTimeAverage).toBe(4);
  });

  it("keeps an archived Taster's existing rating visible/editable while hiding it from new selection", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const dad = await tasterService.createTaster(userId, "Dad");
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, { ratings: [{ tasterId: dad.id, value: 3 }] }),
    );
    await tasterService.archiveTaster(userId, dad.id);

    const optionsForThisSession = await listReviewTasterOptions(
      userId,
      session.id,
    );
    expect(optionsForThisSession.map((t) => t.id)).toContain(dad.id);

    const otherSession = await endedSession(userId, recipeId);
    const optionsForFreshSession = await listReviewTasterOptions(
      userId,
      otherSession.id,
    );
    expect(optionsForFreshSession.map((t) => t.id)).not.toContain(dad.id);
  });

  it("selects the most relevant previous rated Version, then a duplicate's source snapshot, as the provisional principal rating", async () => {
    // Pure case: previous-Version evidence exists.
    const rows = [
      {
        id: "r1",
        value: 4,
        sessionId: "s1",
        dishVersionId: "v-old",
        tasterId: "t1",
        createdAt: new Date(),
        taster: { id: "t1", name: "You", isOwner: true },
        dishVersion: { id: "v-old", majorVersion: 1, minorVersion: 0 },
        session: {
          endedAt: new Date(),
          startedAt: new Date(),
          state: "COMPLETED",
        },
      },
    ];
    const summary = computeRatingSummary(rows, "v-current");
    const withHistory = computePrincipalRating(
      summary,
      "v-current",
      "GROUP_AVERAGE",
      {
        sourceKind: "NONE",
        sourceAggregateRating: null,
        sourceRatingCount: null,
        sourceTitle: null,
        sourceDishVersionLabel: null,
      },
    );
    expect(withHistory).toMatchObject({ kind: "provisional", value: 4 });
    expect(withHistory.kind === "provisional" && withHistory.source.type).toBe(
      "previous-version",
    );

    // Duplicate-source case: no rating history at all.
    const emptySummary = computeRatingSummary([], "v-current");
    const fromDuplicate = computePrincipalRating(
      emptySummary,
      "v-current",
      "GROUP_AVERAGE",
      {
        sourceKind: "DUPLICATE",
        sourceAggregateRating: 4.6,
        sourceRatingCount: 5,
        sourceTitle: "Cuban Mojo Bowl",
        sourceDishVersionLabel: "V4.0",
      },
    );
    expect(fromDuplicate).toMatchObject({ kind: "provisional", value: 4.6 });
    expect(
      fromDuplicate.kind === "provisional" && fromDuplicate.source.type,
    ).toBe("duplicate-source");

    // A genuine current-Version rating always wins over both.
    const genuineRows = [
      ...rows,
      {
        ...rows[0]!,
        id: "r2",
        dishVersionId: "v-current",
        dishVersion: { id: "v-current", majorVersion: 2, minorVersion: 0 },
      },
    ];
    const genuineSummary = computeRatingSummary(genuineRows, "v-current");
    const actual = computePrincipalRating(
      genuineSummary,
      "v-current",
      "GROUP_AVERAGE",
      {
        sourceKind: "NONE",
        sourceAggregateRating: null,
        sourceRatingCount: null,
        sourceTitle: null,
        sourceDishVersionLabel: null,
      },
    );
    expect(actual.kind).toBe("actual");
  });

  it("captures the duplicate's source rating snapshot at duplication time and never lets it drift", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, { ratings: [{ tasterId: owner.id, value: 4 }] }),
    );

    const duplicateId = await dishService.duplicateDish(
      userId,
      recipeId,
      undefined,
      "RECIPE",
    );
    const duplicate = await prisma.dish.findUniqueOrThrow({
      where: { id: duplicateId },
    });
    expect(duplicate.sourceAggregateRating?.toNumber()).toBe(4);
    expect(duplicate.sourceRatingCount).toBe(1);

    // A later rating on the source must not retroactively change the
    // already-captured snapshot (PRODUCT_SPEC.md §19.2).
    const secondSession = await endedSession(userId, recipeId);
    await reviewService.saveSessionReview(
      userId,
      reviewInput(secondSession.id, {
        ratings: [{ tasterId: owner.id, value: 1 }],
      }),
    );
    const stillFrozen = await prisma.dish.findUniqueOrThrow({
      where: { id: duplicateId },
    });
    expect(stillFrozen.sourceAggregateRating?.toNumber()).toBe(4);
  });

  it("updates Recipe Last cooked only for Completed sessions, and Part Last cooked from standalone use or Recipe use without a duplicate session", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    const partId = await dishService.createDish(
      userId,
      "PART",
      partContent("Sauce"),
    );
    const partVersionId = await currentVersionId(partId);
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent({
        partLinks: [
          {
            targetDishId: partId,
            targetDishVersionId: partVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
    );

    expect(await getLastCookedAt(userId, recipeId, "RECIPE")).toBeNull();
    expect(await getLastCookedAt(userId, partId, "PART")).toBeNull();

    // Ended-early does not update Recipe Last cooked.
    await endedSession(userId, recipeId, "ENDED_EARLY");
    expect(await getLastCookedAt(userId, recipeId, "RECIPE")).toBeNull();

    // A Completed Recipe session using the Part updates both, without a
    // standalone Part session ever being created.
    const recipeVersion = await prisma.dishVersion.findUniqueOrThrow({
      where: { id: await currentVersionId(recipeId) },
      include: { partLinks: true },
    });
    const partLink = recipeVersion.partLinks.find(
      (l) => l.targetDishId === partId,
    )!;
    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${partLink.lineageId}` }],
    });
    await cookingService.endCookingSession(userId, created.id, "COMPLETED");

    expect(await getLastCookedAt(userId, recipeId, "RECIPE")).not.toBeNull();
    expect(await getLastCookedAt(userId, partId, "PART")).not.toBeNull();
    expect(
      await prisma.cookingSession.count({ where: { dishId: partId } }),
    ).toBe(0);
  });

  it("resolves nested-Part Last cooked/history recursively through the exact Part-Version graph, only for Parts actually included in a Completed session (PRODUCT_SPEC.md §23.4/§41.3/§41.4)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

    // Recipe -> Sauce Part -> Garlic Paste Part (two levels of nesting).
    const garlicPasteId = await dishService.createDish(
      userId,
      "PART",
      partContent("Garlic Paste"),
    );
    const garlicPasteVersionId = await currentVersionId(garlicPasteId);

    const sauceId = await dishService.createDish(
      userId,
      "PART",
      partContent("Sauce", {
        partLinks: [
          {
            targetDishId: garlicPasteId,
            targetDishVersionId: garlicPasteVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
    );
    const sauceVersionId = await currentVersionId(sauceId);

    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent({
        partLinks: [
          {
            targetDishId: sauceId,
            targetDishVersionId: sauceVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
    );
    const recipeVersion = await prisma.dishVersion.findUniqueOrThrow({
      where: { id: await currentVersionId(recipeId) },
      include: { partLinks: true, sections: true },
    });
    const sauceLink = recipeVersion.partLinks.find(
      (l) => l.targetDishId === sauceId,
    )!;
    const sectionLineageId = recipeVersion.sections[0]!.lineageId;

    expect(await getLastCookedAt(userId, sauceId, "PART")).toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();

    // Excluded from the cooked plan (removed from an active session before
    // it ends) must not count as cooked, at any nesting depth.
    const excludedSession = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `section:${sectionLineageId}` },
        { unitKey: `part:${sauceLink.lineageId}` },
      ],
    });
    const sauceUnit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: {
        sessionId: excludedSession.id,
        sourcePartLinkLineageId: sauceLink.lineageId,
      },
    });
    await cookingService.removeSessionUnit(
      userId,
      excludedSession.id,
      sauceUnit.id,
    );
    await cookingService.endCookingSession(
      userId,
      excludedSession.id,
      "COMPLETED",
    );
    expect(await getLastCookedAt(userId, sauceId, "PART")).toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();

    // Ended-early nested use must not update Last cooked either.
    const endedEarly = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${sauceLink.lineageId}` }],
    });
    await cookingService.endCookingSession(
      userId,
      endedEarly.id,
      "ENDED_EARLY",
    );
    expect(await getLastCookedAt(userId, sauceId, "PART")).toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();

    // Completed and included: updates the directly-linked Part and the
    // Part nested two levels deep inside it, without creating a duplicate
    // standalone session for either.
    const completed = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${sauceLink.lineageId}` }],
    });
    await cookingService.endCookingSession(userId, completed.id, "COMPLETED");

    expect(await getLastCookedAt(userId, sauceId, "PART")).not.toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).not.toBeNull();
    expect(
      await prisma.cookingSession.count({ where: { dishId: sauceId } }),
    ).toBe(0);
    expect(
      await prisma.cookingSession.count({ where: { dishId: garlicPasteId } }),
    ).toBe(0);
  });

  it("never mutates Recipe/Part content or Stage when saving a Review or rating", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const before = await prisma.dish.findUniqueOrThrow({
      where: { id: recipeId },
    });
    const session = await endedSession(userId, recipeId);

    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, {
        whatWentWell: "Loved it",
        ratings: [{ tasterId: owner.id, value: 5 }],
      }),
    );

    const after = await prisma.dish.findUniqueOrThrow({
      where: { id: recipeId },
    });
    expect(after.stage).toBe(before.stage);
    expect(after.currentVersionId).toBe(before.currentVersionId);
  });

  it("scopes every Review/Cooking-note mutation to its owner", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );
    const session = await endedSession(userId, recipeId);

    const intruder = await createTestUser();
    otherUserId = intruder.id;

    await expect(
      reviewService.saveSessionReview(
        intruder.id,
        reviewInput(session.id, { whatWentWell: "Not mine to review." }),
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      reviewService.deleteSessionReview(intruder.id, session.id),
    ).rejects.toThrow(NotFoundError);
    await expect(
      reviewService.updateCookingNotes(intruder.id, session.id, "hijacked"),
    ).rejects.toThrow(NotFoundError);
  });

  it("builds the editor's session-evidence bundle for an ended session, and scopes it to the owner (PRODUCT_SPEC.md §39.4)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent(),
    );

    // In-progress: no Review is available yet (§33.1) — no evidence bundle.
    const versionId = await currentVersionId(recipeId);
    const version = await prisma.dishVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: { sections: true },
    });
    const inProgress = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: versionId,
      units: [{ unitKey: `section:${version.sections[0]!.lineageId}` }],
    });
    expect(await getSessionEvidenceForEditor(userId, inProgress.id)).toBeNull();

    const session = await cookingService.endCookingSession(
      userId,
      inProgress.id,
      "COMPLETED",
    );
    await reviewService.updateCookingNotes(userId, session.id, "Doubled it.");
    await reviewService.saveSessionReview(
      userId,
      reviewInput(session.id, {
        whatWentWell: "Great",
        ratings: [{ tasterId: owner.id, value: 5 }],
      }),
    );

    const evidence = await getSessionEvidenceForEditor(userId, session.id);
    expect(evidence).not.toBeNull();
    expect(evidence!.dishId).toBe(recipeId);
    expect(evidence!.outcome).toBe("COMPLETED");
    expect(evidence!.cookingNotes).toBe("Doubled it.");
    expect(evidence!.review?.whatWentWell).toBe("Great");
    expect(evidence!.ratings).toEqual([
      { tasterName: owner.name, isOwner: true, value: 5 },
    ]);

    // Another owner's session is invisible.
    const intruder = await createTestUser();
    otherUserId = intruder.id;
    await initializeNewUser(otherUserId);
    expect(
      await getSessionEvidenceForEditor(otherUserId, session.id),
    ).toBeNull();
  });
});

describe("Stage suggestions", () => {
  it("suggests the next Stage only after at least one finished session, and never past Active", () => {
    expect(getStageSuggestion("IDEA", 0)).toBeNull();
    expect(getStageSuggestion("IDEA", 1)?.targetStage).toBe("EXPERIMENTAL");
    expect(getStageSuggestion("EXPERIMENTAL", 1)?.targetStage).toBe("PROVEN");
    expect(getStageSuggestion("PROVEN", 1)?.targetStage).toBe("ACTIVE");
    expect(getStageSuggestion("ACTIVE", 10)).toBeNull();
    expect(getStageSuggestion("ARCHIVED", 10)).toBeNull();
  });
});
