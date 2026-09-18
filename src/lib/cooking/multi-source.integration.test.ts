import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as dishService from "@/lib/dishes/service";
import * as cookingService from "@/lib/cooking/service";
import * as reviewService from "@/lib/reviews/service";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
import { ActiveSessionConflictError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Multi-source Cooking Sessions (owner spec, 2026-09-17) — covers the
 * riskiest new behavior at the service/schema layer: two Recipes producing
 * one session with two exact source Versions, shared-Part consolidation
 * persisting one unit with two contributions, atomic conflict rollback
 * (a conflict on one selected source must not partially create the
 * session), and the backward-compat fix that makes the *old* single-source
 * `startCookingSession`/`endCookingSession` path also participate correctly
 * in the new per-source active-session guard.
 */

function bowlContent(
  title: string,
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
  return {
    title,
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
  quantity = 2,
  overrides: Partial<DishContentInput> = {},
): DishContentInput {
  return {
    title,
    stage: "IDEA",
    cuisineIds: [],
    description: null,
    yieldQuantity: quantity,
    yieldUnit: "cups",
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: "Roast",
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Carrots",
            quantity,
            quantityEnd: null,
            isApproximate: false,
            unit: "cups",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [{ text: "Roast carrots." }],
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

async function unitsFor(ownerId: string, dishId: string) {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  const { version } = await getOwnedDishVersionOrThrow(
    ownerId,
    dishId,
    dish.currentVersionId!,
  );
  return buildCookableUnits(ownerId, dish, version);
}

/** Two Recipes ("Chicken Bowl", "Beef Bowl") that both link the same
 * standalone "Roasted Carrots" Part at the same exact Version — the core
 * shared-Part consolidation scenario. */
async function setUpTwoBowlsSharingAPart(userId: string) {
  const carrotsId = await dishService.createDish(
    userId,
    "PART",
    partContent("Roasted Carrots", 2),
  );
  const carrotsVersionId = await currentVersionId(carrotsId);

  const chickenBowlId = await dishService.createDish(
    userId,
    "RECIPE",
    bowlContent("Chicken Bowl", {
      partLinks: [
        {
          targetDishId: carrotsId,
          targetDishVersionId: carrotsVersionId,
          position: 1,
          multiplier: 1,
        },
      ],
    }),
  );
  const beefBowlId = await dishService.createDish(
    userId,
    "RECIPE",
    bowlContent("Beef Bowl", {
      partLinks: [
        {
          targetDishId: carrotsId,
          targetDishVersionId: carrotsVersionId,
          position: 1,
          multiplier: 0.5,
        },
      ],
    }),
  );

  return {
    carrotsId,
    carrotsVersionId,
    chickenBowlId,
    chickenBowlVersionId: await currentVersionId(chickenBowlId),
    beefBowlId,
    beefBowlVersionId: await currentVersionId(beefBowlId),
  };
}

describe("multi-source cooking session service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("two Recipes create one Cooking Session with two exact source Versions, each with its own scale", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);

    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          {
            dishId: chickenBowlId,
            dishVersionId: chickenBowlVersionId,
            scaleFactor: 2,
          },
          {
            dishId: beefBowlId,
            dishVersionId: beefBowlVersionId,
            scaleFactor: 3,
          },
        ],
        units: [
          ...chickenUnits.map((u) => ({
            mergeKey:
              u.kind === "PART"
                ? `part:${u.targetDishId}:${u.targetDishVersionId}`
                : `unique:0:${u.unitKey}`,
          })),
          ...beefUnits
            .filter((u) => u.kind !== "PART")
            .map((u) => ({ mergeKey: `unique:1:${u.unitKey}` })),
        ],
      },
    );

    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });
    expect(sources).toHaveLength(2);
    expect(sources[0].dishId).toBe(chickenBowlId);
    expect(sources[0].scaleFactor?.toNumber()).toBe(2);
    expect(sources[1].dishId).toBe(beefBowlId);
    expect(sources[1].scaleFactor?.toNumber()).toBe(3);
  });

  it("consolidates the exact same Part + exact same Version into one cookable unit with aggregate quantity equal to the sum of source contributions", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);

    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);
    const chickenCarrots = chickenUnits.find((u) => u.kind === "PART")!;
    const beefCarrots = beefUnits.find((u) => u.kind === "PART")!;
    const mergeKey = `part:${chickenCarrots.targetDishId}:${chickenCarrots.targetDishVersionId}`;
    expect(
      `part:${beefCarrots.targetDishId}:${beefCarrots.targetDishVersionId}`,
    ).toBe(mergeKey);

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          {
            dishId: chickenBowlId,
            dishVersionId: chickenBowlVersionId,
            scaleFactor: 1,
          },
          {
            dishId: beefBowlId,
            dishVersionId: beefBowlVersionId,
            scaleFactor: 1,
          },
        ],
        units: [{ mergeKey }],
      },
    );

    const units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: session.id },
      include: { checklistItems: true, contributions: true, partUsages: true },
    });
    expect(units).toHaveLength(1); // one cookable unit, not two
    const [unit] = units;
    expect(unit.contributions).toHaveLength(2); // per-source allocation retained
    // Chicken Bowl's link multiplier is 1 (2 cups), Beef Bowl's is 0.5 (1 cup) — 3 cups total.
    const carrotsItem = unit.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(carrotsItem.baseQuantity?.toNumber()).toBe(3);
    // One CookingSessionPartUsage row per contributing source, not per unit.
    expect(unit.partUsages).toHaveLength(2);
  });

  it("a conflict on one selected source rolls back the whole session — no partial creation", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);

    // Beef Bowl already has an active session of its own.
    const beefUnits = await unitsFor(userId, beefBowlId);
    await cookingService.startCookingSession(userId, {
      dishId: beefBowlId,
      dishVersionId: beefBowlVersionId,
      units: beefUnits.map((u) => ({ unitKey: u.unitKey })),
    });

    const chickenUnits = await unitsFor(userId, chickenBowlId);
    await expect(
      cookingService.startMultiSourceCookingSession(userId, {
        sources: [
          { dishId: chickenBowlId, dishVersionId: chickenBowlVersionId },
          { dishId: beefBowlId, dishVersionId: beefBowlVersionId },
        ],
        units: chickenUnits
          .filter((u) => u.kind !== "PART")
          .map((u) => ({ mergeKey: `unique:0:${u.unitKey}` })),
      }),
    ).rejects.toBeInstanceOf(ActiveSessionConflictError);

    // Chicken Bowl's own session was never created — not even partially.
    const chickenSessions = await prisma.cookingSession.count({
      where: { dishId: chickenBowlId },
    });
    expect(chickenSessions).toBe(0);
    // Still exactly one CookingSessionSource row for Beef Bowl (its own
    // original single-source session), not two.
    const beefSources = await prisma.cookingSessionSource.count({
      where: { dishId: beefBowlId },
    });
    expect(beefSources).toBe(1);
  });

  it("backward compatibility: the old single-source startCookingSession still creates a CookingSessionSource row the new conflict guard can see", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { chickenBowlId, chickenBowlVersionId } =
      await setUpTwoBowlsSharingAPart(userId);
    const units = await unitsFor(userId, chickenBowlId);

    await cookingService.startCookingSession(userId, {
      dishId: chickenBowlId,
      dishVersionId: chickenBowlVersionId,
      units: units.map((u) => ({ unitKey: u.unitKey })),
    });

    const source = await prisma.cookingSessionSource.findFirst({
      where: { dishId: chickenBowlId },
    });
    expect(source).not.toBeNull();
    expect(source?.isActive).toBe(true);
  });

  it("backward compatibility: the old single-source startCookingSession gives every unit a CookingSessionUnitContribution row too, so addSessionUnits can recognize it as already included", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { chickenBowlId, chickenBowlVersionId } =
      await setUpTwoBowlsSharingAPart(userId);
    const units = await unitsFor(userId, chickenBowlId);
    const section = units.find((u) => u.kind === "SECTION")!;
    const part = units.find((u) => u.kind === "PART")!;

    const created = await cookingService.startCookingSession(userId, {
      dishId: chickenBowlId,
      dishVersionId: chickenBowlVersionId,
      units: [{ unitKey: section.unitKey }],
    });

    const sectionRow = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: { sessionId: created.id },
      include: { contributions: true },
    });
    expect(sectionRow.contributions).toHaveLength(1);
    expect(sectionRow.contributions[0].sourceUnitKey).toBe(section.unitKey);

    // Adding the Part unit afterward must not re-add the Section (already
    // recognized as included via its own contribution row).
    await cookingService.addSessionUnits(userId, created.id, [part.unitKey]);
    const allUnits = await prisma.cookingSessionUnit.count({
      where: { sessionId: created.id },
    });
    expect(allUnits).toBe(2);
  });

  it("ending a session (either lifecycle path) releases its source dishes so a new session can start on them", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { chickenBowlId, chickenBowlVersionId } =
      await setUpTwoBowlsSharingAPart(userId);
    const units = await unitsFor(userId, chickenBowlId);

    const session = await cookingService.startCookingSession(userId, {
      dishId: chickenBowlId,
      dishVersionId: chickenBowlVersionId,
      units: units.map((u) => ({ unitKey: u.unitKey })),
    });
    await cookingService.endCookingSession(userId, session.id, "ENDED_EARLY");

    const source = await prisma.cookingSessionSource.findFirst({
      where: { dishId: chickenBowlId },
    });
    expect(source?.isActive).toBe(false);

    // A brand-new session on the same dish must not be rejected as a
    // conflict now that the prior one has ended.
    const secondSession = await cookingService.startCookingSession(userId, {
      dishId: chickenBowlId,
      dishVersionId: chickenBowlVersionId,
      units: units.map((u) => ({ unitKey: u.unitKey })),
    });
    expect(secondSession.id).not.toBe(session.id);
  });
});

/**
 * Completion pass (owner spec, 2026-09-18) — live per-source rescaling,
 * multi-source `addSessionUnits` (including shared-Part consolidation for a
 * unit added *after* the session starts), and source-specific reviews.
 */
describe("live per-source rescale (updateSourceScale)", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("rescaling one source updates only its own ordinary units, leaving the other source's scale and quantities untouched", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);
    const chickenSection = chickenUnits.find((u) => u.kind === "SECTION")!;
    const beefSection = beefUnits.find((u) => u.kind === "SECTION")!;

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          {
            dishId: chickenBowlId,
            dishVersionId: chickenBowlVersionId,
            scaleFactor: 2,
          },
          {
            dishId: beefBowlId,
            dishVersionId: beefBowlVersionId,
            scaleFactor: 1,
          },
        ],
        units: [
          { mergeKey: `unique:0:${chickenSection.unitKey}` },
          { mergeKey: `unique:1:${beefSection.unitKey}` },
        ],
      },
    );
    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });
    const chickenSourceRow = sources.find((s) => s.dishId === chickenBowlId)!;

    await cookingService.updateSourceScale(
      userId,
      session.id,
      chickenSourceRow.id,
      4,
    );

    const updatedSources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
    });
    expect(
      updatedSources
        .find((s) => s.dishId === chickenBowlId)!
        .scaleFactor?.toNumber(),
    ).toBe(4);
    expect(
      updatedSources
        .find((s) => s.dishId === beefBowlId)!
        .scaleFactor?.toNumber(),
    ).toBe(1);

    const units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: session.id },
      include: { checklistItems: true },
    });
    const chickenRice = units.find(
      (u) => u.sourceDishTitle === "Chicken Bowl",
    )!;
    const beefRice = units.find((u) => u.sourceDishTitle === "Beef Bowl")!;
    const chickenRiceItem = chickenRice.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    const beefRiceItem = beefRice.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    // baseQuantity never source-scaled (ordinary unit) — only displayQuantity
    // reflects the new 4x source scale.
    expect(chickenRiceItem.baseQuantity?.toNumber()).toBe(2);
    expect(chickenRiceItem.displayQuantity).toBe("8");
    // Beef Bowl's own row is completely unaffected.
    expect(beefRiceItem.baseQuantity?.toNumber()).toBe(2);
    expect(beefRiceItem.displayQuantity).toBe("2");
  });

  it("rescaling one source recomputes only its own contribution to a consolidated Part, retaining the other source's contribution — the aggregate always equals the current sum", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const carrots = chickenUnits.find((u) => u.kind === "PART")!;
    const mergeKey = `part:${carrots.targetDishId}:${carrots.targetDishVersionId}`;

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          {
            dishId: chickenBowlId,
            dishVersionId: chickenBowlVersionId,
            scaleFactor: 1,
          },
          {
            dishId: beefBowlId,
            dishVersionId: beefBowlVersionId,
            scaleFactor: 1,
          },
        ],
        units: [{ mergeKey }],
      },
    );
    // Chicken link multiplier 1, Beef link multiplier 0.5, both source scale
    // 1x: (2*1*1) + (2*0.5*1) = 3.
    const before = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unit: { sessionId: session.id } },
    });
    expect(before.baseQuantity?.toNumber()).toBe(3);

    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
    });
    const chickenSourceRow = sources.find((s) => s.dishId === chickenBowlId)!;
    await cookingService.updateSourceScale(
      userId,
      session.id,
      chickenSourceRow.id,
      2,
    );

    // Chicken's own contribution becomes (2*1*2)=4, Beef's stays (2*0.5*1)=1 — 5 total.
    const unit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: { sessionId: session.id },
      include: { checklistItems: true, contributions: true },
    });
    const carrotsItem = unit.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(carrotsItem.baseQuantity?.toNumber()).toBe(5);

    const chickenContribution = unit.contributions.find(
      (c) => c.sourceId === chickenSourceRow.id,
    )!;
    const beefContribution = unit.contributions.find(
      (c) => c.sourceId !== chickenSourceRow.id,
    )!;
    expect(chickenContribution.contributionQuantity?.toNumber()).toBe(4);
    expect(beefContribution.contributionQuantity?.toNumber()).toBe(1); // untouched
    expect(
      chickenContribution.contributionQuantity!.toNumber() +
        beefContribution.contributionQuantity!.toNumber(),
    ).toBe(5); // always the current sum of all contributions
  });

  it("rescaling a consolidated Part never resets its checklist checkoffs or timers", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const carrots = chickenUnits.find((u) => u.kind === "PART")!;
    const mergeKey = `part:${carrots.targetDishId}:${carrots.targetDishVersionId}`;

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          { dishId: chickenBowlId, dishVersionId: chickenBowlVersionId },
          { dishId: beefBowlId, dishVersionId: beefBowlVersionId },
        ],
        units: [{ mergeKey }],
      },
    );
    const unit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: { sessionId: session.id },
      include: { checklistItems: true },
    });
    const item = unit.checklistItems.find((i) => i.kind === "INGREDIENT")!;
    await cookingService.toggleChecklistItem(userId, session.id, item.id, true);
    const timer = await cookingService.createTimer(
      userId,
      session.id,
      unit.id,
      "Roast",
      600,
    );

    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
    });
    await cookingService.updateSourceScale(
      userId,
      session.id,
      sources[0].id,
      3,
    );

    const itemAfter =
      await prisma.cookingSessionChecklistItem.findUniqueOrThrow({
        where: { id: item.id },
      });
    expect(itemAfter.checkedAt).not.toBeNull(); // still checked, not reset
    const timerAfter = await prisma.timer.findUniqueOrThrow({
      where: { id: timer.id },
    });
    expect(timerAfter.id).toBe(timer.id);
    expect(timerAfter.state).toBe("RUNNING"); // untouched
  });
});

describe("unit-level rescale of a consolidated Part (updateUnitScale)", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("composes source scale × Part-link multiplier × live per-unit scale correctly, and a subsequent source rescale preserves the unit-level override while recomputing the aggregate/contributions — checkoffs and timers stay intact throughout", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const carrots = chickenUnits.find((u) => u.kind === "PART")!;
    const mergeKey = `part:${carrots.targetDishId}:${carrots.targetDishVersionId}`;

    // Chicken link multiplier 1, Beef link multiplier 0.5. Chicken source
    // scale 2x, Beef source scale 1x: (2*1*2) + (2*0.5*1) = 4 + 1 = 5.
    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          {
            dishId: chickenBowlId,
            dishVersionId: chickenBowlVersionId,
            scaleFactor: 2,
          },
          {
            dishId: beefBowlId,
            dishVersionId: beefBowlVersionId,
            scaleFactor: 1,
          },
        ],
        units: [{ mergeKey }],
      },
    );
    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
    });
    const chickenSourceRow = sources.find((s) => s.dishId === chickenBowlId)!;
    const beefSourceRow = sources.find((s) => s.dishId === beefBowlId)!;

    const unit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: { sessionId: session.id },
      include: { checklistItems: true },
    });
    const item = unit.checklistItems.find((i) => i.kind === "INGREDIENT")!;
    expect(item.baseQuantity?.toNumber()).toBe(5);

    // Progress/timers established before either rescale below.
    await cookingService.toggleChecklistItem(userId, session.id, item.id, true);
    const timer = await cookingService.createTimer(
      userId,
      session.id,
      unit.id,
      "Roast",
      600,
    );

    // A live per-unit scale (3x) composes on top of the already
    // source-scaled aggregate at display time only — `updateUnitScale`
    // never touches `baseQuantity`/contribution rows (the unit's own
    // `scaleFactor` is a display overlay on top of the sum of its
    // contributions, per CookingSessionUnit.originalScaleFactor's own
    // schema comment), so those stay exactly as-computed while
    // `displayQuantity` reflects the full composition: 5 (aggregate) × 3
    // (unit scale) = 15.
    await cookingService.updateUnitScale(userId, session.id, unit.id, 3);

    const afterUnitScale = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: unit.id },
      include: { checklistItems: true, contributions: true },
    });
    expect(afterUnitScale.scaleFactor?.toNumber()).toBe(3);
    const itemAfterUnitScale = afterUnitScale.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(itemAfterUnitScale.baseQuantity?.toNumber()).toBe(5); // aggregate itself unchanged
    expect(itemAfterUnitScale.displayQuantity).toBe("15"); // 5 * 3
    expect(afterUnitScale.contributions).toHaveLength(2);
    expect(
      afterUnitScale.contributions
        .find((c) => c.sourceId === chickenSourceRow.id)!
        .contributionQuantity!.toNumber(),
    ).toBe(4); // untouched
    expect(
      afterUnitScale.contributions
        .find((c) => c.sourceId === beefSourceRow.id)!
        .contributionQuantity!.toNumber(),
    ).toBe(1); // untouched

    // Rescaling Beef Bowl's own source (the non-primary, index-1 source)
    // next must recompute the aggregate/contributions from the new source
    // scale while preserving the unit-level 3x override just set above —
    // new aggregate: chicken stays 4, beef becomes (2*0.5*3)=3 → 7 total;
    // displayQuantity recomposes as 7 * 3 = 21.
    await cookingService.updateSourceScale(
      userId,
      session.id,
      beefSourceRow.id,
      3,
    );

    const afterSourceScale = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: unit.id },
      include: { checklistItems: true, contributions: true },
    });
    expect(afterSourceScale.scaleFactor?.toNumber()).toBe(3); // unit-level override preserved
    const itemAfterSourceScale = afterSourceScale.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(itemAfterSourceScale.baseQuantity?.toNumber()).toBe(7);
    expect(itemAfterSourceScale.displayQuantity).toBe("21");
    expect(
      afterSourceScale.contributions
        .find((c) => c.sourceId === chickenSourceRow.id)!
        .contributionQuantity!.toNumber(),
    ).toBe(4); // untouched — only Beef's own source rescaled
    expect(
      afterSourceScale.contributions
        .find((c) => c.sourceId === beefSourceRow.id)!
        .contributionQuantity!.toNumber(),
    ).toBe(3);

    // Checkoff and timer survived both rescales.
    const itemFinal =
      await prisma.cookingSessionChecklistItem.findUniqueOrThrow({
        where: { id: item.id },
      });
    expect(itemFinal.checkedAt).not.toBeNull();
    const timerFinal = await prisma.timer.findUniqueOrThrow({
      where: { id: timer.id },
    });
    expect(timerFinal.state).toBe("RUNNING");
  });
});

describe("addSessionUnits — multi-source", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("adds a unit belonging to a non-primary source, scaled by that source's own scale, not the primary source's", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);
    const chickenSection = chickenUnits.find((u) => u.kind === "SECTION")!;
    const beefSection = beefUnits.find((u) => u.kind === "SECTION")!;

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          {
            dishId: chickenBowlId,
            dishVersionId: chickenBowlVersionId,
            scaleFactor: 10,
          },
          {
            dishId: beefBowlId,
            dishVersionId: beefBowlVersionId,
            scaleFactor: 3,
          },
        ],
        units: [{ mergeKey: `unique:0:${chickenSection.unitKey}` }],
      },
    );

    await cookingService.addSessionUnits(userId, session.id, [
      beefSection.unitKey,
    ]);

    const addedUnit = await prisma.cookingSessionUnit.findFirstOrThrow({
      where: { sessionId: session.id, sourceDishTitle: "Beef Bowl" },
      include: { checklistItems: true, contributions: true },
    });
    expect(addedUnit.contributions).toHaveLength(1);
    // Scaled by Beef Bowl's own 3x, never Chicken Bowl's 10x.
    const addedItem = addedUnit.checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(addedItem.displayQuantity).toBe("6");
  });

  it("adding the same exact Part + Version from a second source consolidates into the already-included unit, recomputing its aggregate — never a duplicate CookingSessionUnit", async () => {
    const user = await createTestUser();
    userId = user.id;
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);
    const chickenCarrots = chickenUnits.find((u) => u.kind === "PART")!;
    const beefCarrots = beefUnits.find((u) => u.kind === "PART")!;

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          { dishId: chickenBowlId, dishVersionId: chickenBowlVersionId },
          { dishId: beefBowlId, dishVersionId: beefBowlVersionId },
        ],
        units: [
          {
            mergeKey: `part:${chickenCarrots.targetDishId}:${chickenCarrots.targetDishVersionId}`,
          },
        ],
      },
    );
    const beforeUnits = await prisma.cookingSessionUnit.count({
      where: { sessionId: session.id },
    });
    expect(beforeUnits).toBe(1); // only Chicken Bowl's own contribution so far

    await cookingService.addSessionUnits(userId, session.id, [
      beefCarrots.unitKey,
    ]);

    const units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: session.id },
      include: { checklistItems: true, contributions: true },
    });
    expect(units).toHaveLength(1); // still exactly one — consolidated, not duplicated
    expect(units[0].contributions).toHaveLength(2);
    // Chicken (multiplier 1) + Beef (multiplier 0.5), both at 1x source scale: 2 + 1 = 3.
    const carrotsItem = units[0].checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    )!;
    expect(carrotsItem.baseQuantity?.toNumber()).toBe(3);
  });
});

describe("source-specific post-cook reviews", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("one Cooking Session holds separate source reviews — ratings and actual yield are never combined across Recipes", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          { dishId: chickenBowlId, dishVersionId: chickenBowlVersionId },
          { dishId: beefBowlId, dishVersionId: beefBowlVersionId },
        ],
        units: chickenUnits
          .filter((u) => u.kind === "SECTION")
          .map((u) => ({ mergeKey: `unique:0:${u.unitKey}` }))
          .concat(
            beefUnits
              .filter((u) => u.kind === "SECTION")
              .map((u) => ({ mergeKey: `unique:1:${u.unitKey}` })),
          ),
      },
    );
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");

    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
      orderBy: { position: "asc" },
    });
    const chickenSourceRow = sources.find((s) => s.dishId === chickenBowlId)!;
    const beefSourceRow = sources.find((s) => s.dishId === beefBowlId)!;

    await reviewService.saveSessionSourceReview(userId, {
      sessionId: session.id,
      sourceId: chickenSourceRow.id,
      whatWentWell: "Crispy skin",
      whatDidNotGoWell: null,
      anythingElse: null,
      actualAmountQuantity: 4,
      actualAmountUnit: "servings",
      reviewAdjustedDurationSeconds: null,
      ratings: [{ tasterId: owner.id, value: 5 }],
      includedUnitIds: [],
    });
    await reviewService.saveSessionSourceReview(userId, {
      sessionId: session.id,
      sourceId: beefSourceRow.id,
      whatWentWell: "Tender",
      whatDidNotGoWell: "Too salty",
      anythingElse: null,
      actualAmountQuantity: 2,
      actualAmountUnit: "servings",
      reviewAdjustedDurationSeconds: null,
      ratings: [{ tasterId: owner.id, value: 3 }],
      includedUnitIds: [],
    });

    const chickenReview =
      await prisma.cookingSessionSourceReview.findUniqueOrThrow({
        where: { sourceId: chickenSourceRow.id },
      });
    const beefReview =
      await prisma.cookingSessionSourceReview.findUniqueOrThrow({
        where: { sourceId: beefSourceRow.id },
      });
    expect(chickenReview.whatWentWell).toBe("Crispy skin");
    expect(chickenReview.actualAmountQuantity?.toNumber()).toBe(4);
    expect(beefReview.whatWentWell).toBe("Tender");
    expect(beefReview.actualAmountQuantity?.toNumber()).toBe(2); // never combined with Chicken's 4

    const ratings = await prisma.rating.findMany({
      where: { sessionId: session.id },
    });
    expect(ratings).toHaveLength(2); // one per source dish, not merged into one
    expect(ratings.find((r) => r.dishId === chickenBowlId)!.value).toBe(5);
    expect(ratings.find((r) => r.dishId === beefBowlId)!.value).toBe(3);
  });

  it("deleting one source's review leaves the other source's review and ratings intact", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const {
      chickenBowlId,
      chickenBowlVersionId,
      beefBowlId,
      beefBowlVersionId,
    } = await setUpTwoBowlsSharingAPart(userId);
    const chickenUnits = await unitsFor(userId, chickenBowlId);
    const beefUnits = await unitsFor(userId, beefBowlId);
    const owner = await prisma.taster.findFirstOrThrow({
      where: { ownerId: userId, isOwner: true },
    });

    const session = await cookingService.startMultiSourceCookingSession(
      userId,
      {
        sources: [
          { dishId: chickenBowlId, dishVersionId: chickenBowlVersionId },
          { dishId: beefBowlId, dishVersionId: beefBowlVersionId },
        ],
        units: chickenUnits
          .filter((u) => u.kind === "SECTION")
          .map((u) => ({ mergeKey: `unique:0:${u.unitKey}` }))
          .concat(
            beefUnits
              .filter((u) => u.kind === "SECTION")
              .map((u) => ({ mergeKey: `unique:1:${u.unitKey}` })),
          ),
      },
    );
    await cookingService.endCookingSession(userId, session.id, "COMPLETED");
    const sources = await prisma.cookingSessionSource.findMany({
      where: { sessionId: session.id },
    });
    const chickenSourceRow = sources.find((s) => s.dishId === chickenBowlId)!;
    const beefSourceRow = sources.find((s) => s.dishId === beefBowlId)!;

    for (const [sourceRow] of [[chickenSourceRow], [beefSourceRow]] as const) {
      await reviewService.saveSessionSourceReview(userId, {
        sessionId: session.id,
        sourceId: sourceRow.id,
        whatWentWell: "Good",
        whatDidNotGoWell: null,
        anythingElse: null,
        actualAmountQuantity: null,
        actualAmountUnit: null,
        reviewAdjustedDurationSeconds: null,
        ratings: [{ tasterId: owner.id, value: 4 }],
        includedUnitIds: [],
      });
    }

    await reviewService.deleteSessionSourceReview(
      userId,
      session.id,
      chickenSourceRow.id,
    );

    const chickenReview = await prisma.cookingSessionSourceReview.findUnique({
      where: { sourceId: chickenSourceRow.id },
    });
    const beefReview =
      await prisma.cookingSessionSourceReview.findUniqueOrThrow({
        where: { sourceId: beefSourceRow.id },
      });
    expect(chickenReview).toBeNull();
    expect(beefReview.whatWentWell).toBe("Good"); // untouched by the other source's deletion

    const remainingRatings = await prisma.rating.findMany({
      where: { sessionId: session.id },
    });
    expect(remainingRatings).toHaveLength(1);
    expect(remainingRatings[0].dishId).toBe(beefBowlId);
  });
});
