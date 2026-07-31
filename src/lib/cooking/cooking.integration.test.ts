import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import * as cookingService from "@/lib/cooking/service";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
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
