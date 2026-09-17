import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteDb, putEntity } from "@/lib/offline/db";
import {
  computeReplicatedEffectiveNutrition,
  computeReplicatedVersionEffectiveNutrition,
} from "@/lib/dishes/offline-nutrition";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type {
  ReplicatedVersion,
  ReplicatedVersionSection,
} from "@/lib/dishes/version-history-snapshot";

/**
 * Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md §54.5):
 * the offline editor's live nested-Part preview and the offline Version
 * History/compare surfaces must calculate the same result as online, from
 * data already sitting in the local IndexedDB replica — exercised here
 * against a real (fake) IndexedDB, reusing the exact same
 * `src/lib/nutrition/calculate.ts` engine `calculate.test.ts` already
 * proves correct in isolation.
 */

function ingredient(
  overrides: Partial<ReplicatedVersionSection["ingredients"][number]> = {},
): ReplicatedVersionSection["ingredients"][number] {
  return {
    id: "ing-1",
    lineageId: "ing-1",
    name: "Ingredient",
    quantity: null,
    quantityEnd: null,
    isApproximate: false,
    unit: null,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substituteForIngredientId: null,
    substitute: null,
    nutrition: null,
    ...overrides,
  };
}

function section(
  overrides: Partial<ReplicatedVersionSection> = {},
): ReplicatedVersionSection {
  return {
    id: "section-1",
    lineageId: "section-1",
    position: 0,
    name: null,
    guidanceNote: null,
    ingredients: [],
    instructions: [],
    partLinks: [],
    nutritionOverride: null,
    ...overrides,
  };
}

function version(
  overrides: Partial<ReplicatedVersion> = {},
): ReplicatedVersion {
  return {
    id: "v1",
    majorVersion: 1,
    minorVersion: 0,
    title: "Test",
    versionNote: null,
    sourceVersionId: null,
    createdAt: new Date().toISOString(),
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    nutritionOverride: null,
    nutritionBasis: null,
    nutritionBasisQuantity: null,
    nutritionBasisUnit: null,
    nutritionSourceProvider: null,
    nutritionSourceName: null,
    sections: [],
    topLevelPartLinks: [],
    ...overrides,
  };
}

async function seedDish(dishId: string, versions: ReplicatedVersion[]) {
  const doc: Partial<DishSnapshotDoc> = {
    id: dishId,
    kind: "RECIPE",
    versions,
  };
  await putEntity({
    entityType: "dish",
    id: dishId,
    doc: doc as DishSnapshotDoc,
    serverRevision: null,
    localUpdatedAt: new Date().toISOString(),
    dirty: false,
    conflict: null,
  });
}

describe("computeReplicatedEffectiveNutrition", () => {
  afterEach(async () => {
    await deleteDb();
  });

  it("returns null when the Dish isn't replicated at all", async () => {
    const result = await computeReplicatedEffectiveNutrition(
      "missing-dish",
      "missing-version",
    );
    expect(result).toBeNull();
  });

  it("returns null when the Dish is replicated but the specific Version isn't", async () => {
    await seedDish("dish-1", [version({ id: "v1" })]);
    const result = await computeReplicatedEffectiveNutrition(
      "dish-1",
      "v-missing",
    );
    expect(result).toBeNull();
  });

  it("calculates ingredient -> Section -> Dish from replicated raw data", async () => {
    await seedDish("dish-1", [
      version({
        id: "v1",
        sections: [
          section({
            ingredients: [
              ingredient({
                id: "a",
                lineageId: "a",
                nutrition: {
                  calories: 100,
                  protein: 10,
                  carbs: 0,
                  fat: 0,
                  moreNutrients: null,
                },
              }),
              ingredient({
                id: "b",
                lineageId: "b",
                nutrition: {
                  calories: 50,
                  protein: 5,
                  carbs: 0,
                  fat: 0,
                  moreNutrients: null,
                },
              }),
            ],
          }),
        ],
      }),
    ]);

    const result = await computeReplicatedEffectiveNutrition("dish-1", "v1");
    expect(result).not.toBeNull();
    expect(result!.state).toBe("COMPLETE");
    expect(result!.totals.calories).toBe(150);
    expect(result!.totals.protein).toBe(15);
  });

  it("resolves a nested Part's contribution from the replica, scaled by multiplier", async () => {
    await seedDish("part-1", [
      version({
        id: "part-v1",
        sections: [
          section({
            ingredients: [
              ingredient({
                nutrition: {
                  calories: 40,
                  protein: 2,
                  carbs: 0,
                  fat: 0,
                  moreNutrients: null,
                },
              }),
            ],
          }),
        ],
      }),
    ]);
    await seedDish("recipe-1", [
      version({
        id: "recipe-v1",
        sections: [
          section({
            ingredients: [
              ingredient({
                nutrition: {
                  calories: 100,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                  moreNutrients: null,
                },
              }),
            ],
            partLinks: [
              {
                id: "link-1",
                lineageId: "link-1",
                position: 0,
                targetDishId: "part-1",
                targetDishVersionId: "part-v1",
                multiplier: 2,
              },
            ],
          }),
        ],
      }),
    ]);

    const result = await computeReplicatedEffectiveNutrition(
      "recipe-1",
      "recipe-v1",
    );
    // 100 (local) + 2x (40 from the Part) = 180
    expect(result!.totals.calories).toBe(180);
  });

  it("treats an unreplicated nested Part as no contribution rather than failing", async () => {
    await seedDish("recipe-1", [
      version({
        id: "recipe-v1",
        sections: [
          section({
            ingredients: [
              ingredient({
                nutrition: {
                  calories: 100,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                  moreNutrients: null,
                },
              }),
            ],
            partLinks: [
              {
                id: "link-1",
                lineageId: "link-1",
                position: 0,
                targetDishId: "not-replicated",
                targetDishVersionId: "not-replicated-v1",
                multiplier: 1,
              },
            ],
          }),
        ],
      }),
    ]);

    const result = await computeReplicatedEffectiveNutrition(
      "recipe-1",
      "recipe-v1",
    );
    expect(result!.totals.calories).toBe(100);
    expect(result!.state).toBe("COMPLETE");
  });

  it("a whole-Dish override replaces the calculated sum", async () => {
    await seedDish("dish-1", [
      version({
        id: "v1",
        nutritionOverride: {
          calories: 999,
          protein: null,
          carbs: null,
          fat: null,
          moreNutrients: null,
        },
        sections: [
          section({
            ingredients: [
              ingredient({
                nutrition: {
                  calories: 100,
                  protein: 0,
                  carbs: 0,
                  fat: 0,
                  moreNutrients: null,
                },
              }),
            ],
          }),
        ],
      }),
    ]);

    const result = await computeReplicatedEffectiveNutrition("dish-1", "v1");
    expect(result!.state).toBe("OVERRIDE");
    expect(result!.totals.calories).toBe(999);
  });
});

describe("computeReplicatedVersionEffectiveNutrition", () => {
  afterEach(async () => {
    await deleteDb();
  });

  it("computes directly from an already-known ReplicatedVersion object", async () => {
    const v = version({
      sections: [
        section({
          ingredients: [
            ingredient({
              nutrition: {
                calories: 60,
                protein: 0,
                carbs: 0,
                fat: 0,
                moreNutrients: null,
              },
            }),
          ],
        }),
      ],
    });
    const result = await computeReplicatedVersionEffectiveNutrition(v);
    expect(result.totals.calories).toBe(60);
    expect(result.state).toBe("COMPLETE");
  });
});
