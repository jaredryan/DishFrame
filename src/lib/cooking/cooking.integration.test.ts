import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import * as cookingService from "@/lib/cooking/service";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
  computeChecklistItemConflict,
} from "@/lib/cooking/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  NotFoundError,
  ValidationError,
  ActiveSessionConflictError,
  FinalUnitGuardError,
} from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Slice 7 — Cooking Setup/Session lifecycle (Gate 4). Covers the
 * high-value behaviors the gate called out: the genuine concurrent
 * start race, zero-residue Setup, source-snapshot survival, nested-Part
 * independent selection, plan editing (add/remove/restore/reorder),
 * removed-after-progress evidence, the final-unit guard, Finish vs End
 * early, and authorization.
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

function partContent(title: string): DishContentInput {
  return {
    title,
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

/** Recipe with a local "Prep" Section and a top-level linked "Sauce" Part —
 * two cookable units, one of each kind. */
async function setUpRecipeWithPart(userId: string) {
  const sauceId = await dishService.createDish(
    userId,
    "PART",
    partContent("Sauce"),
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
  const recipeVersionId = await currentVersionId(recipeId);
  const units = await unitsFor(userId, recipeId);
  const sectionUnit = units.find((u) => u.kind === "SECTION")!;
  const partUnit = units.find((u) => u.kind === "PART")!;

  return {
    sauceId,
    sauceVersionId,
    recipeId,
    recipeVersionId,
    sectionUnit,
    partUnit,
  };
}

describe("cooking session service", () => {
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

  it("buildCookableUnits produces one unit per local Section and one per linked Part, without creating any rows", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { sectionUnit, partUnit, recipeId } =
      await setUpRecipeWithPart(userId);

    expect(sectionUnit.label).toBe("Prep");
    expect(sectionUnit.checklist.map((c) => c.kind).sort()).toEqual([
      "INGREDIENT",
      "INSTRUCTION",
    ]);
    expect(partUnit.label).toBe("Sauce");
    expect(partUnit.checklist).toHaveLength(1);
    expect(partUnit.checklist[0]).toMatchObject({
      kind: "INGREDIENT",
      name: "Soy sauce",
    });

    // §21.3: opening/reviewing Setup creates no persistent Cooking Session.
    const count = await prisma.cookingSession.count({
      where: { dishId: recipeId },
    });
    expect(count).toBe(0);
  });

  it("startCookingSession snapshots exact source labels and checklist content", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit, partUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }, { unitKey: partUnit.unitKey }],
    });

    const persisted = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
      orderBy: { position: "asc" },
      include: { checklistItems: true },
    });
    expect(persisted).toHaveLength(2);
    expect(persisted[0].sourceDishTitle).toBe("Test Bowl");
    expect(persisted[0].sourceSectionLineageId).not.toBeNull();
    expect(persisted[1].sourceDishTitle).toBe("Sauce");
    expect(persisted[1].sourcePartLinkLineageId).not.toBeNull();

    const riceItem = persisted[0].checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    );
    expect(riceItem?.displayText).toBe("Rice");
    expect(riceItem?.displayQuantity).toBe("2");
    expect(riceItem?.displayUnit).toBe("cups");
  });

  it("preserves the session's snapshot after the source Recipe and nested Part are later edited", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sauceId, sectionUnit, partUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }, { unitKey: partUnit.unitKey }],
    });

    // Edit the Recipe's own Section content and the nested Part's content —
    // neither should ever rewrite the already-created session (§22.4).
    await dishService.editDish(
      userId,
      recipeId,
      recipeVersionId,
      recipeContent({
        sections: [
          {
            name: "Prep",
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: "Rice",
                quantity: 99,
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
      }),
      "MINOR",
      "RECIPE",
    );
    const sauceVersionId = await currentVersionId(sauceId);
    await dishService.editDish(
      userId,
      sauceId,
      sauceVersionId,
      partContent("Sauce (renamed content)"),
      "MINOR",
      "PART",
    );

    const persisted = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
      orderBy: { position: "asc" },
      include: { checklistItems: true },
    });
    const riceItem = persisted[0].checklistItems.find(
      (i) => i.kind === "INGREDIENT",
    );
    expect(riceItem?.displayQuantity).toBe("2"); // still the original, not 99
    expect(persisted[1].sourceDishTitle).toBe("Sauce"); // still the original title
  });

  it("rejects a genuine concurrent race for the same stable Recipe with a friendly conflict, not a raw error", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);
    const input = {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    };

    const [first, second] = await Promise.allSettled([
      cookingService.startCookingSession(userId, input),
      cookingService.startCookingSession(userId, input),
    ]);

    const fulfilled = [first, second].filter((r) => r.status === "fulfilled");
    const rejected = [first, second].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ActiveSessionConflictError);
    expect(reason.existingSessionId).toBe(
      (fulfilled[0] as PromiseFulfilledResult<{ id: string }>).value.id,
    );
  });

  it("supports add/remove/restore/reorder on the active plan", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit, partUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });

    await cookingService.addSessionUnits(userId, created.id, [
      partUnit.unitKey,
    ]);
    let units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
      orderBy: { position: "asc" },
    });
    expect(units).toHaveLength(2);
    const [sectionRow, partRow] = units;

    await cookingService.reorderSessionUnits(userId, created.id, [
      partRow.id,
      sectionRow.id,
    ]);
    units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
      orderBy: { position: "asc" },
    });
    expect(units.map((u) => u.id)).toEqual([partRow.id, sectionRow.id]);

    await cookingService.removeSessionUnit(userId, created.id, sectionRow.id);
    const removed = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: sectionRow.id },
    });
    expect(removed.removedAt).not.toBeNull();
    expect(removed.removedAfterProgress).toBe(false);

    await cookingService.restoreSessionUnit(userId, created.id, sectionRow.id);
    const restored = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: sectionRow.id },
    });
    expect(restored.removedAt).toBeNull();
  });

  it("preserves evidence when a unit with progress is removed", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit, partUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }, { unitKey: partUnit.unitKey }],
    });
    const [sectionRow] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
      orderBy: { position: "asc" },
    });

    // Simulate Slice 8 checkoff progress directly (no toggle UI exists yet).
    const checklistItem =
      await prisma.cookingSessionChecklistItem.findFirstOrThrow({
        where: { unitId: sectionRow.id },
      });
    await prisma.cookingSessionChecklistItem.update({
      where: { id: checklistItem.id },
      data: { checkedAt: new Date() },
    });

    await cookingService.removeSessionUnit(userId, created.id, sectionRow.id);

    const removed = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: sectionRow.id },
      include: { checklistItems: true },
    });
    expect(removed.removedAt).not.toBeNull();
    expect(removed.removedAfterProgress).toBe(true);
    // Evidence itself survives, still queryable.
    expect(
      removed.checklistItems.find((i) => i.id === checklistItem.id)?.checkedAt,
    ).not.toBeNull();
  });

  it("refuses to remove the final active unit and never empties the session silently", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const [onlyUnit] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });

    await expect(
      cookingService.removeSessionUnit(userId, created.id, onlyUnit.id),
    ).rejects.toThrow(FinalUnitGuardError);

    const stillActive = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: onlyUnit.id },
    });
    expect(stillActive.removedAt).toBeNull();
  });

  it("Finish and End early set distinct terminal states and never silently reopen", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const finished = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const completed = await cookingService.endCookingSession(
      userId,
      finished.id,
      "COMPLETED",
    );
    expect(completed.state).toBe("COMPLETED");
    expect(completed.endedAt).not.toBeNull();
    expect(completed.rawElapsedSeconds).not.toBeNull();

    await expect(
      cookingService.endCookingSession(userId, finished.id, "ENDED_EARLY"),
    ).rejects.toThrow(ValidationError);

    await cookingService
      .endCookingSession(userId, finished.id, "COMPLETED")
      .catch(() => {});
    const stillCompleted = await prisma.cookingSession.findUniqueOrThrow({
      where: { id: finished.id },
    });
    expect(stillCompleted.state).toBe("COMPLETED");
  });

  it("rejects a non-owner for every session mutation", async () => {
    const user = await createTestUser();
    userId = user.id;
    const intruder = await createTestUser();
    otherUserId = intruder.id;

    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);
    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });

    await expect(
      cookingService.endCookingSession(intruder.id, created.id, "COMPLETED"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.removeSessionUnit(intruder.id, created.id, "nonexistent"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.startCookingSession(intruder.id, {
        dishId: recipeId,
        dishVersionId: recipeVersionId,
        units: [{ unitKey: sectionUnit.unitKey }],
      }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("cooking mode — Slice 8", () => {
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

  it("allows exactly one winner when both active units are removed at nearly the same time", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit, partUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }, { unitKey: partUnit.unitKey }],
    });
    const units = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });
    expect(units).toHaveLength(2);

    const results = await Promise.allSettled(
      units.map((u) =>
        cookingService.removeSessionUnit(userId!, created.id, u.id),
      ),
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      FinalUnitGuardError,
    );

    const remaining = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id, removedAt: null },
    });
    expect(remaining).toHaveLength(1);
  });

  it("persists checkoff state, including clearing checkedQuantity on uncheck", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const item = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unit: { sessionId: created.id }, kind: "INGREDIENT" },
    });

    await cookingService.toggleChecklistItem(userId, created.id, item.id, true);
    let updated = await prisma.cookingSessionChecklistItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(updated.checkedAt).not.toBeNull();
    expect(decimalToNumber(updated.checkedQuantity)).toBe(2);

    await cookingService.toggleChecklistItem(
      userId,
      created.id,
      item.id,
      false,
    );
    updated = await prisma.cookingSessionChecklistItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    expect(updated.checkedAt).toBeNull();
    expect(updated.checkedQuantity).toBeNull();
  });

  it("completes a unit without requiring every item checked, and reversal only clears completion", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const [unit] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });

    await cookingService.setUnitCompletion(userId, created.id, unit.id, true);
    const completedUnit = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: unit.id },
      include: { checklistItems: true },
    });
    expect(completedUnit.completedAt).not.toBeNull();
    expect(completedUnit.checklistItems.every((i) => i.checkedAt != null)).toBe(
      true,
    );

    await cookingService.setUnitCompletion(userId, created.id, unit.id, false);
    const reopened = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: unit.id },
      include: { checklistItems: true },
    });
    expect(reopened.completedAt).toBeNull();
    // Reopening is reversible for the completion flag only — it does not
    // silently uncheck items §28.3 never asked it to touch.
    expect(reopened.checklistItems.every((i) => i.checkedAt != null)).toBe(
      true,
    );
  });

  it("rejects every Slice 8 mutation once a session has ended", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const [unit] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });
    const item = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unitId: unit.id },
    });
    await cookingService.endCookingSession(userId, created.id, "ENDED_EARLY");

    await expect(
      cookingService.toggleChecklistItem(userId, created.id, item.id, true),
    ).rejects.toThrow(ValidationError);
    await expect(
      cookingService.setUnitCompletion(userId, created.id, unit.id, true),
    ).rejects.toThrow(ValidationError);
    await expect(
      cookingService.updateSessionScale(userId, created.id, 2),
    ).rejects.toThrow(ValidationError);
    await expect(
      cookingService.updateUnitScale(userId, created.id, unit.id, 2),
    ).rejects.toThrow(ValidationError);
    await expect(
      cookingService.createTimer(userId, created.id, unit.id, "Rice", 60),
    ).rejects.toThrow(ValidationError);
  });

  it("scales whole-session and per-unit remaining quantities from the structured base, preserving original vs. current scale", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      scaleFactor: 2,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    let session = await prisma.cookingSession.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(decimalToNumber(session.originalScaleFactor)).toBe(2);
    expect(decimalToNumber(session.scaleFactor)).toBe(2);

    const [unit] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });
    let riceItem = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unitId: unit.id, kind: "INGREDIENT" },
    });
    expect(decimalToNumber(riceItem.baseQuantity)).toBe(2); // unscaled authored value
    expect(riceItem.displayQuantity).toBe("4"); // 2 * session scale 2

    // Whole-session scale change: original is untouched, current mutates,
    // and remaining quantities recalculate from the persisted base — not by
    // re-parsing the old "4" string.
    await cookingService.updateSessionScale(userId, created.id, 3);
    session = await prisma.cookingSession.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(decimalToNumber(session.originalScaleFactor)).toBe(2);
    expect(decimalToNumber(session.scaleFactor)).toBe(3);
    riceItem = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unitId: unit.id, kind: "INGREDIENT" },
    });
    expect(riceItem.displayQuantity).toBe("6"); // 2 * session scale 3

    // Per-unit override composes with the (already-updated) session scale.
    await cookingService.updateUnitScale(userId, created.id, unit.id, 2);
    const updatedUnit = await prisma.cookingSessionUnit.findUniqueOrThrow({
      where: { id: unit.id },
    });
    expect(decimalToNumber(updatedUnit.originalScaleFactor)).toBeNull(); // never set at creation
    expect(decimalToNumber(updatedUnit.scaleFactor)).toBe(2);
    riceItem = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unitId: unit.id, kind: "INGREDIENT" },
    });
    expect(riceItem.displayQuantity).toBe("12"); // 2 * (session 3 * unit 2)
  });

  it("flags an upward scale as needing more and a downward scale as exceeding, without implying removal", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const item = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unit: { sessionId: created.id }, kind: "INGREDIENT" },
    });

    await cookingService.toggleChecklistItem(userId, created.id, item.id, true);
    const checked = await prisma.cookingSessionChecklistItem.findUniqueOrThrow({
      where: { id: item.id },
    });
    const baseQuantity = decimalToNumber(checked.baseQuantity);
    const checkedQuantity = decimalToNumber(checked.checkedQuantity);
    expect(checkedQuantity).toBe(2);

    // Scaling up: the checked 2 cups is now short of the new target.
    expect(
      computeChecklistItemConflict(baseQuantity, checkedQuantity, 2),
    ).toEqual({ type: "needs-more", amount: 2 });
    // Scaling down: the checked 2 cups now exceeds the new target, never
    // implying it can be un-added.
    expect(
      computeChecklistItemConflict(baseQuantity, checkedQuantity, 0.5),
    ).toEqual({ type: "exceeds", amount: 1 });
    // No conflict once the scale matches what was actually checked.
    expect(
      computeChecklistItemConflict(baseQuantity, checkedQuantity, 1),
    ).toBeNull();
  });

  it("supports the full Timer lifecycle and multiple simultaneous timers across units", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit, partUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }, { unitKey: partUnit.unitKey }],
    });
    const [unitA, unitB] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
      orderBy: { position: "asc" },
    });

    const timerA = await cookingService.createTimer(
      userId,
      created.id,
      unitA.id,
      "Rice",
      600,
    );
    const timerB = await cookingService.createTimer(
      userId,
      created.id,
      unitB.id,
      "Sauce",
      300,
    );
    expect(timerA.state).toBe("RUNNING");
    expect(timerB.state).toBe("RUNNING");
    expect(timerA.targetEndAt).not.toBeNull();
    expect(timerB.targetEndAt).not.toBeNull();
    // Both persisted target-end times survive independently — this is what
    // a page reload reads back (no per-second DB writes).
    expect(
      timerA.targetEndAt!.getTime() - timerA.durationSeconds * 1000,
    ).toBeGreaterThan(Date.now() - 5000);

    await cookingService.pauseTimer(userId, created.id, timerA.id);
    let pausedA = await prisma.timer.findUniqueOrThrow({
      where: { id: timerA.id },
    });
    expect(pausedA.state).toBe("PAUSED");
    expect(pausedA.targetEndAt).toBeNull();
    expect(pausedA.remainingSeconds).toBeGreaterThan(0);

    await cookingService.startTimer(userId, created.id, timerA.id);
    const resumedA = await prisma.timer.findUniqueOrThrow({
      where: { id: timerA.id },
    });
    expect(resumedA.state).toBe("RUNNING");
    expect(resumedA.targetEndAt).not.toBeNull();
    expect(resumedA.remainingSeconds).toBeNull();

    await cookingService.adjustTimer(userId, created.id, timerA.id, 60);
    const adjustedA = await prisma.timer.findUniqueOrThrow({
      where: { id: timerA.id },
    });
    expect(adjustedA.durationSeconds).toBe(660);

    await cookingService.resetTimer(userId, created.id, timerA.id);
    const resetA = await prisma.timer.findUniqueOrThrow({
      where: { id: timerA.id },
    });
    expect(resetA.state).toBe("PAUSED");
    expect(resetA.remainingSeconds).toBe(660); // the adjusted nominal duration, not the original 600

    await cookingService.dismissTimer(userId, created.id, timerA.id);
    const dismissedA = await prisma.timer.findUniqueOrThrow({
      where: { id: timerA.id },
    });
    expect(dismissedA.state).toBe("DISMISSED");

    // Timer B was never touched by any of Timer A's actions.
    pausedA = await prisma.timer.findUniqueOrThrow({
      where: { id: timerB.id },
    });
    expect(pausedA.state).toBe("RUNNING");
  });

  it("freezes running timers into a paused snapshot when the session ends", async () => {
    const user = await createTestUser();
    userId = user.id;
    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);

    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const [unit] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });
    const timer = await cookingService.createTimer(
      userId,
      created.id,
      unit.id,
      "Rice",
      600,
    );

    await cookingService.endCookingSession(userId, created.id, "COMPLETED");

    const stopped = await prisma.timer.findUniqueOrThrow({
      where: { id: timer.id },
    });
    expect(stopped.state).toBe("PAUSED");
    expect(stopped.targetEndAt).toBeNull();
    expect(stopped.remainingSeconds).toBeGreaterThan(0);
    expect(stopped.remainingSeconds).toBeLessThanOrEqual(600);
  });

  it("rejects a non-owner for every Slice 8 mutation", async () => {
    const user = await createTestUser();
    userId = user.id;
    const intruder = await createTestUser();
    otherUserId = intruder.id;

    const { recipeId, recipeVersionId, sectionUnit } =
      await setUpRecipeWithPart(userId);
    const created = await cookingService.startCookingSession(userId, {
      dishId: recipeId,
      dishVersionId: recipeVersionId,
      units: [{ unitKey: sectionUnit.unitKey }],
    });
    const [unit] = await prisma.cookingSessionUnit.findMany({
      where: { sessionId: created.id },
    });
    const item = await prisma.cookingSessionChecklistItem.findFirstOrThrow({
      where: { unitId: unit.id },
    });
    const timer = await cookingService.createTimer(
      userId,
      created.id,
      unit.id,
      "Rice",
      600,
    );

    await expect(
      cookingService.toggleChecklistItem(
        intruder.id,
        created.id,
        item.id,
        true,
      ),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.setUnitCompletion(intruder.id, created.id, unit.id, true),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.updateSessionScale(intruder.id, created.id, 2),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.updateUnitScale(intruder.id, created.id, unit.id, 2),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.createTimer(intruder.id, created.id, unit.id, "x", 60),
    ).rejects.toThrow(NotFoundError);
    await expect(
      cookingService.pauseTimer(intruder.id, created.id, timer.id),
    ).rejects.toThrow(NotFoundError);
  });
});
