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
import { getLastCookedAt, getPartCookingHistory } from "@/lib/cooking/queries";
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
    cuisineIds: [],
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
    cuisineIds: [],
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

/**
 * SLICE_9.md refinement pass (2026-07-31) — Recipe → Sauce Part → Garlic
 * Paste Part, two levels of Part-in-Part nesting. Since the refinement pass,
 * Garlic Paste is its own independently selectable Cooking Setup unit
 * (`nestedGarlicLink.lineageId`, resolved inside Sauce's own Version) rather
 * than usage implied merely by selecting Sauce — every test below selects it
 * explicitly wherever it's expected to count.
 */
async function createNestedPartFixture(userId: string) {
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
    include: { partLinks: true },
  });
  const sauceLink = recipeVersion.partLinks.find(
    (l) => l.targetDishId === sauceId,
  )!;
  const nestedGarlicLink = await prisma.partLink.findFirstOrThrow({
    where: { containerVersionId: sauceVersionId, targetDishId: garlicPasteId },
  });

  return {
    recipeId,
    sauceId,
    garlicPasteId,
    recipeVersion,
    sauceLink,
    nestedGarlicLink,
  };
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
      includedUnitIds: [],
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

  it("both Sauce and its independently selected nested Garlic Paste count as cooked when both are included through their own active session units (PRODUCT_SPEC.md §23.4/§41.3/§41.4)", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      recipeId,
      sauceId,
      garlicPasteId,
      recipeVersion,
      sauceLink,
      nestedGarlicLink,
    } = await createNestedPartFixture(userId);

    expect(await getLastCookedAt(userId, sauceId, "PART")).toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();

    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `part:${sauceLink.lineageId}` },
        { unitKey: `part:${nestedGarlicLink.lineageId}` },
      ],
    });
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    expect(await getLastCookedAt(userId, sauceId, "PART")).not.toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).not.toBeNull();
    expect(
      await prisma.cookingSession.count({ where: { dishId: sauceId } }),
    ).toBe(0);
    expect(
      await prisma.cookingSession.count({ where: { dishId: garlicPasteId } }),
    ).toBe(0);

    // The durable usage log itself: one DIRECT row for Sauce, one NESTED row
    // for Garlic Paste, with exact identity/snapshots and a readable path —
    // never inferred from titles at read time.
    const usageRows = await prisma.cookingSessionPartUsage.findMany({
      where: { sessionId: session.id },
    });
    const sauceUsage = usageRows.find((r) => r.partDishId === sauceId)!;
    const garlicUsage = usageRows.find((r) => r.partDishId === garlicPasteId)!;
    expect(usageRows).toHaveLength(2);
    expect(sauceUsage.relation).toBe("DIRECT");
    expect(sauceUsage.viaPartTitleSnapshot).toBeNull();
    expect(sauceUsage.pathSnapshot).toBe("Test Bowl → Sauce");
    expect(sauceUsage.partVersionLabelSnapshot).toBe("V1.0");
    expect(garlicUsage.relation).toBe("NESTED");
    expect(garlicUsage.viaPartTitleSnapshot).toBe("Sauce");
    expect(garlicUsage.pathSnapshot).toBe("Test Bowl → Sauce → Garlic Paste");

    const sauceHistory = await getPartCookingHistory(userId, sauceId);
    const garlicHistory = await getPartCookingHistory(userId, garlicPasteId);
    const sauceEvent = sauceHistory.find((e) => e.sessionId === session.id)!;
    const garlicEvent = garlicHistory.find((e) => e.sessionId === session.id)!;
    expect(sauceEvent.isStandalone).toBe(false);
    expect(sauceEvent.dishTitle).toBe("Test Bowl");
    expect(sauceEvent.occurrences).toHaveLength(1);
    expect(garlicEvent.occurrences).toHaveLength(1);
    expect(garlicEvent.occurrences[0]!.pathSnapshot).toBe(
      "Test Bowl → Sauce → Garlic Paste",
    );
  });

  it("Garlic Paste excluded from Setup while Sauce stays included: only Sauce counts as cooked", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const { recipeId, sauceId, garlicPasteId, recipeVersion, sauceLink } =
      await createNestedPartFixture(userId);

    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${sauceLink.lineageId}` }],
    });
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    expect(await getLastCookedAt(userId, sauceId, "PART")).not.toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();
    const usageRows = await prisma.cookingSessionPartUsage.findMany({
      where: { sessionId: session.id },
    });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]!.partDishId).toBe(sauceId);
  });

  it("Garlic Paste included then removed before completion does not count; ending early never counts either", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      recipeId,
      garlicPasteId,
      sauceId,
      recipeVersion,
      sauceLink,
      nestedGarlicLink,
    } = await createNestedPartFixture(userId);

    const removed = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `part:${sauceLink.lineageId}` },
        { unitKey: `part:${nestedGarlicLink.lineageId}` },
      ],
    });
    const garlicUnit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: {
        sessionId: removed.id,
        sourcePartLinkLineageId: nestedGarlicLink.lineageId,
      },
    });
    await cookingService.removeSessionUnit(userId, removed.id, garlicUnit.id);
    await cookingService.endCookingSession(userId, removed.id, "COMPLETED");
    expect(await getLastCookedAt(userId, sauceId, "PART")).not.toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();

    // Ended-early never counts, even with the nested unit still active.
    const endedEarly = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${nestedGarlicLink.lineageId}` }],
    });
    await cookingService.endCookingSession(
      userId,
      endedEarly.id,
      "ENDED_EARLY",
    );
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();
  });

  it("restoring a removed nested Garlic Paste unit before completion makes it count again", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      recipeId,
      garlicPasteId,
      recipeVersion,
      sauceLink,
      nestedGarlicLink,
    } = await createNestedPartFixture(userId);

    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `part:${sauceLink.lineageId}` },
        { unitKey: `part:${nestedGarlicLink.lineageId}` },
      ],
    });
    const garlicUnit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: {
        sessionId: session.id,
        sourcePartLinkLineageId: nestedGarlicLink.lineageId,
      },
    });
    await cookingService.removeSessionUnit(userId, session.id, garlicUnit.id);
    await cookingService.restoreSessionUnit(userId, session.id, garlicUnit.id);
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).not.toBeNull();
  });

  it("Sauce removed while an independently selected Garlic Paste unit remains active: only Garlic Paste counts", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      recipeId,
      sauceId,
      garlicPasteId,
      recipeVersion,
      sauceLink,
      nestedGarlicLink,
    } = await createNestedPartFixture(userId);

    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `part:${sauceLink.lineageId}` },
        { unitKey: `part:${nestedGarlicLink.lineageId}` },
      ],
    });
    const sauceUnit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: {
        sessionId: session.id,
        sourcePartLinkLineageId: sauceLink.lineageId,
      },
    });
    await cookingService.removeSessionUnit(userId, session.id, sauceUnit.id);
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    expect(await getLastCookedAt(userId, sauceId, "PART")).toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).not.toBeNull();
  });

  it("collapses a Part used both directly and nested in the same session into one history event, and keeps a Section-nested Part's usage DIRECT", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);

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

    // Garlic Paste is used BOTH directly at the top level AND nested inside
    // Sauce (also linked directly) — two distinct occurrences of the same
    // Part in one session. The Sauce link also lives inside the Recipe's
    // own Section (Section-nesting), which must still resolve as a DIRECT
    // occurrence (only nesting through another Part counts as NESTED).
    const recipeId = await dishService.createDish(
      userId,
      "RECIPE",
      recipeContent({
        sections: [
          {
            name: "Prep",
            guidanceNote: null,
            position: 0,
            ingredients: [],
            instructions: [],
            partLinks: [
              {
                targetDishId: sauceId,
                targetDishVersionId: sauceVersionId,
                position: 0,
                multiplier: 1,
              },
            ],
          },
        ],
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
    const recipeVersion = await prisma.dishVersion.findUniqueOrThrow({
      where: { id: await currentVersionId(recipeId) },
      include: { partLinks: true },
    });
    const directGarlicLink = recipeVersion.partLinks.find(
      (l) => l.targetDishId === garlicPasteId,
    )!;
    const sauceLink = recipeVersion.partLinks.find(
      (l) => l.targetDishId === sauceId,
    )!;
    // Garlic Paste's own nested unit, reached only through Sauce, must be
    // selected independently for its NESTED occurrence to exist at all
    // (SLICE_9.md refinement pass — nested Parts are no longer implied by
    // selecting their container).
    const nestedGarlicLink = await prisma.partLink.findFirstOrThrow({
      where: {
        containerVersionId: sauceVersionId,
        targetDishId: garlicPasteId,
      },
    });

    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `part:${directGarlicLink.lineageId}` },
        { unitKey: `part:${sauceLink.lineageId}` },
        { unitKey: `part:${nestedGarlicLink.lineageId}` },
      ],
    });
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    const garlicUsageRows = await prisma.cookingSessionPartUsage.findMany({
      where: { sessionId: session.id, partDishId: garlicPasteId },
    });
    expect(garlicUsageRows).toHaveLength(2);
    expect(garlicUsageRows.map((r) => r.relation).sort()).toEqual([
      "DIRECT",
      "NESTED",
    ]);
    const sauceUsageRow = await prisma.cookingSessionPartUsage.findFirstOrThrow(
      { where: { sessionId: session.id, partDishId: sauceId } },
    );
    expect(sauceUsageRow.relation).toBe("DIRECT");

    // One history event per Part per session, even with two occurrences.
    const garlicHistory = await getPartCookingHistory(userId, garlicPasteId);
    const eventsForSession = garlicHistory.filter(
      (e) => e.sessionId === session.id,
    );
    expect(eventsForSession).toHaveLength(1);
    expect(eventsForSession[0]!.occurrences).toHaveLength(2);
  });

  it("keeps a surviving nested Part's Recipe-session history and Last cooked after the intermediate Part is permanently deleted", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      recipeId,
      sauceId,
      garlicPasteId,
      recipeVersion,
      sauceLink,
      nestedGarlicLink,
    } = await createNestedPartFixture(userId);

    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [
        { unitKey: `part:${sauceLink.lineageId}` },
        { unitKey: `part:${nestedGarlicLink.lineageId}` },
      ],
    });
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).not.toBeNull();
    const historyBefore = await getPartCookingHistory(userId, garlicPasteId);
    expect(historyBefore.some((e) => e.sessionId === session.id)).toBe(true);

    // Permanently delete the intermediate Part (Sauce) through the normal
    // two-phase deletion flow: it still has a current usage (the Recipe's
    // only Version links it), so resolve that first, exactly like
    // dishes.integration.test.ts's "deletePart (Phase 2)" tests do.
    await expect(dishService.deleteDish(userId, sauceId)).rejects.toThrow();
    await dishService.resolvePartUsageOccurrence(
      userId,
      sauceId,
      recipeId,
      sauceLink.lineageId,
      "DETACH",
      "MINOR",
    );
    await dishService.deleteDish(userId, sauceId);

    expect(await prisma.dish.findUnique({ where: { id: sauceId } })).toBeNull();
    expect(
      await prisma.dish.findUnique({ where: { id: garlicPasteId } }),
    ).not.toBeNull();

    // Garlic Paste's own usage row is untouched (never referenced Sauce via
    // a live relation, only a snapshot) — its history/Last cooked survive.
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).not.toBeNull();
    const historyAfter = await getPartCookingHistory(userId, garlicPasteId);
    const eventAfter = historyAfter.find((e) => e.sessionId === session.id)!;
    expect(eventAfter).toBeDefined();
    expect(eventAfter.occurrences[0]!.pathSnapshot).toBe(
      "Test Bowl → Sauce → Garlic Paste",
    );

    // The deleted Part's own DIRECT usage row survives too (frozen snapshot,
    // relation to the live Dish/Version nulled by the DB itself).
    const sauceUsageRow = await prisma.cookingSessionPartUsage.findFirstOrThrow(
      { where: { sessionId: session.id, partTitleSnapshot: "Sauce" } },
    );
    expect(sauceUsageRow.partDishId).toBeNull();
    expect(sauceUsageRow.partVersionId).toBeNull();
  });

  it("backfills CookingSessionPartUsage rows for pre-existing sessions, idempotently and only where the source PartLink still resolves", async () => {
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
    const recipeVersion = await prisma.dishVersion.findUniqueOrThrow({
      where: { id: await currentVersionId(recipeId) },
      include: { partLinks: true },
    });
    const partLink = recipeVersion.partLinks.find(
      (l) => l.targetDishId === partId,
    )!;
    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${partLink.lineageId}` }],
    });
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    // Simulate a pre-Slice-9-correction session by deleting the rows the
    // (now current) creation-time code just wrote.
    await prisma.cookingSessionPartUsage.deleteMany({
      where: { sessionId: session.id },
    });
    expect(await getLastCookedAt(userId, partId, "PART")).toBeNull();

    const first = await cookingService.backfillCookingSessionPartUsage();
    expect(first.created).toBeGreaterThan(0);
    expect(await getLastCookedAt(userId, partId, "PART")).not.toBeNull();
    const rowsAfterFirst = await prisma.cookingSessionPartUsage.count({
      where: { sessionId: session.id },
    });

    // Idempotent: a second run finds nothing left to backfill for this unit.
    const second = await cookingService.backfillCookingSessionPartUsage();
    const rowsAfterSecond = await prisma.cookingSessionPartUsage.count({
      where: { sessionId: session.id },
    });
    expect(rowsAfterSecond).toBe(rowsAfterFirst);
    expect(second.created).toBe(0);
  });

  it("backfill respects the saved session plan: reconstructs the selected Part's own row without fabricating usage for a nested Part that was never its own selected unit", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const { recipeId, sauceId, garlicPasteId, recipeVersion, sauceLink } =
      await createNestedPartFixture(userId);

    // Mimics a pre-refinement-pass session: only Sauce's own unit was ever
    // selected/persisted — Garlic Paste never had a `CookingSessionUnit` of
    // its own in this session, so there is nothing for the backfill to
    // reconstruct usage from for it.
    const session = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersion.id,
      units: [{ unitKey: `part:${sauceLink.lineageId}` }],
    });
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");
    await prisma.cookingSessionPartUsage.deleteMany({
      where: { sessionId: session.id },
    });

    const result = await cookingService.backfillCookingSessionPartUsage();
    expect(result.created).toBeGreaterThan(0);

    const usageRows = await prisma.cookingSessionPartUsage.findMany({
      where: { sessionId: session.id },
    });
    expect(usageRows).toHaveLength(1);
    expect(usageRows[0]!.partDishId).toBe(sauceId);
    expect(usageRows[0]!.relation).toBe("DIRECT");
    expect(await getLastCookedAt(userId, sauceId, "PART")).not.toBeNull();
    expect(await getLastCookedAt(userId, garlicPasteId, "PART")).toBeNull();
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
