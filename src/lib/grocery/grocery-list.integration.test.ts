import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as dishService from "@/lib/dishes/service";
import * as listService from "@/lib/grocery/list-service";
import * as groceryService from "@/lib/grocery/service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { DishContentInput, IngredientInput } from "@/lib/dishes/schema";

vi.mock("@vercel/blob", () => ({ del: vi.fn(async () => {}) }));

function ingredient(overrides: Partial<IngredientInput> = {}): IngredientInput {
  return {
    name: "Salt",
    quantity: null,
    quantityEnd: null,
    isApproximate: false,
    unit: null,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
    ...overrides,
  };
}

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
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
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [ingredient()],
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

describe("grocery list service", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  describe("generateGroceryList", () => {
    it("combines a safely-equivalent shared ingredient across two Recipes, with source breakdown preserved", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Recipe A",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Soy Sauce", quantity: 2, unit: "tbsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Recipe B",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Soy Sauce", quantity: 0.25, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
        include: { items: { include: { contributions: true } } },
      });
      expect(list.items).toHaveLength(1);
      const item = list.items[0];
      expect(item.name).toBe("Soy Sauce");
      expect(item.unit).toBe("tbsp");
      expect(item.quantityDecimal?.toNumber()).toBeCloseTo(6, 3); // 2 tbsp + 4 tbsp
      expect(item.contributions).toHaveLength(2);
    });

    it("does not combine materially ambiguous items (§61.2 examples)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Chili",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Tomatoes", quantity: 1, unit: "can" }),
                ingredient({ name: "Onion", quantity: 2, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Sauce",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Tomatoes", quantity: 400, unit: "g" }),
                ingredient({ name: "Onion", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      // Tomatoes: 2 separate lines; Onion: 2 separate lines — nothing combined.
      expect(items).toHaveLength(4);
    });

    it("auto-combines two optional occurrences of the same equivalent ingredient (Slice 12 correction)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Recipe A",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Cilantro",
                  quantity: 1,
                  unit: "cup",
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Recipe B",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Cilantro",
                  quantity: 1,
                  unit: "cup",
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
        include: { contributions: true },
      });
      expect(items).toHaveLength(1);
      expect(items[0].isOptional).toBe(true);
      expect(items[0].contributions).toHaveLength(2);
    });

    it("never auto-combines a required and an otherwise-identical optional occurrence (Slice 12 correction)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Recipe A",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Cilantro", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Recipe B",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Cilantro",
                  quantity: 1,
                  unit: "cup",
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
        include: { contributions: true },
      });
      expect(items).toHaveLength(2);
      expect(items.every((i) => i.contributions.length === 1)).toBe(true);
      expect(items.map((i) => i.isOptional).sort()).toEqual([false, true]);
    });

    it("includes an optional ingredient by default, marked optional", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Cilantro",
                  quantity: 1,
                  unit: "cup",
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(item.isOptional).toBe(true);
      expect(item.name).toBe("Cilantro");
    });

    it("uses the primary ingredient by default, never the substitute", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    name: "Margarine",
                    quantity: 1,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: "cup",
                    displayText: null,
                    preparationNote: null,
                  },
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe("Butter");
    });

    it("scales a nested Part's ingredients by the cumulative PartLink-multiplier chain", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const partC = await dishService.createDish(
        userId,
        "PART",
        content({
          title: "Spice Mix",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Cumin", quantity: 1, unit: "tsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const partCVersionId = await currentVersionId(partC);

      const partB = await dishService.createDish(
        userId,
        "PART",
        content({
          title: "Curry Base",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [],
              instructions: [],
              partLinks: [],
            },
          ],
          partLinks: [
            {
              targetDishId: partC,
              targetDishVersionId: partCVersionId,
              position: 0,
              multiplier: 3,
            },
          ],
        }),
      );
      const partBVersionId = await currentVersionId(partB);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Curry",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [],
              instructions: [],
              partLinks: [],
            },
          ],
          partLinks: [
            {
              targetDishId: partB,
              targetDishVersionId: partBVersionId,
              position: 0,
              multiplier: 1.5,
            },
          ],
        }),
      );

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeA, scaleFactor: 1 }],
      });

      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(item.name).toBe("Cumin");
      // 1 tsp * 3 (B->C) * 1.5 (A->B) = 4.5 tsp
      expect(item.quantityDecimal?.toNumber()).toBeCloseTo(4.5, 3);
    });

    it("a generated list's items do not change when the source Recipe is later edited (§60.3)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Flour", quantity: 2, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      const before = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(before.quantityDecimal?.toNumber()).toBe(2);

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
      });
      await dishService.editDish(
        userId,
        recipeId,
        dish.currentVersionId!,
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Flour", quantity: 10, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );

      const after = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(after.quantityDecimal?.toNumber()).toBe(2);
    });

    it("retains a source's ingredient snapshot after the source Recipe is permanently deleted (§60.6)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Basil", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      await dishService.deleteDish(userId, recipeId, "RECIPE");

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
        include: { sources: true, items: true },
      });
      expect(list.sources[0].dishId).toBeNull();
      expect(list.sources[0].sourceDishTitleSnapshot).toBe("Ginger Soy Bowl");
      expect(list.items[0].name).toBe("Basil");
      expect(list.items[0].quantityDecimal?.toNumber()).toBe(1);
    });

    it("assigns a category from IngredientCategoryMemory when one exists, else the fallback category", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const spices = await prisma.groceryCategory.create({
        data: {
          ownerId: userId,
          normalizedName: "spices",
          displayName: "Spices",
          position: 10,
        },
      });
      await prisma.ingredientCategoryMemory.create({
        data: {
          ownerId: userId,
          normalizedIngredientName: "cumin",
          groceryCategoryId: spices.id,
        },
      });

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Cumin", quantity: 1, unit: "tsp" }),
                ingredient({ name: "Mystery Root", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
        include: { category: true },
      });
      const cumin = items.find((i) => i.name === "Cumin")!;
      const mystery = items.find((i) => i.name === "Mystery Root")!;
      expect(cumin.category!.id).toBe(spices.id);
      expect(mystery.category!.isFallback).toBe(true);
    });

    it("rejects an empty source list", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      await expect(
        listService.generateGroceryList(userId, {
          title: "Empty",
          sources: [],
        }),
      ).rejects.toThrow(ValidationError);
    });

    it("scopes source Recipes/Parts to their owner", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;
      await initializeNewUser(owner.id);

      const recipeId = await dishService.createDish(
        owner.id,
        "RECIPE",
        content(),
      );

      await expect(
        listService.generateGroceryList(intruder.id, {
          title: "Steal",
          sources: [{ dishId: recipeId, scaleFactor: 1 }],
        }),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
    });
  });

  describe("uncombineGroceryItem", () => {
    it("re-partitions contributions without losing any", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Soy Sauce", quantity: 2, unit: "tbsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Soy Sauce", quantity: 1, unit: "tbsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });

      const combined = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.uncombineGroceryItem(userId, listId, combined.id);

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
        include: { contributions: true },
      });
      expect(items).toHaveLength(2);
      const totalContributions = items.reduce(
        (sum, i) => sum + i.contributions.length,
        0,
      );
      expect(totalContributions).toBe(2);
      expect(items.every((i) => i.contributions.length === 1)).toBe(true);
    });

    it("throws when there is nothing to uncombine", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content(),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await expect(
        listService.uncombineGroceryItem(userId, listId, item.id),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("recategorizeGroceryItem", () => {
    it("updates the item's category and IngredientCategoryMemory without creating a new DishVersion", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content(),
      );
      const versionCountBefore = await prisma.dishVersion.count({
        where: { dishId: recipeId },
      });

      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      const category = await prisma.groceryCategory.create({
        data: {
          ownerId: userId,
          normalizedName: "pantry2",
          displayName: "Pantry 2",
          position: 99,
        },
      });

      await listService.recategorizeGroceryItem(
        userId,
        listId,
        item.id,
        category.id,
      );

      const updated = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(updated.categoryId).toBe(category.id);

      const memory = await prisma.ingredientCategoryMemory.findUniqueOrThrow({
        where: {
          ownerId_normalizedIngredientName: {
            ownerId: userId,
            normalizedIngredientName: "salt",
          },
        },
      });
      expect(memory.groceryCategoryId).toBe(category.id);

      const versionCountAfter = await prisma.dishVersion.count({
        where: { dishId: recipeId },
      });
      expect(versionCountAfter).toBe(versionCountBefore);
    });
  });

  describe("list completion (§64 — frozen historical records)", () => {
    it("rejects mutations on a completed list, and reopening restores them", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content(),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await listService.completeGroceryList(userId, listId);

      await expect(
        listService.toggleGroceryItem(userId, listId, item.id),
      ).rejects.toThrow(ValidationError);

      await listService.reopenGroceryList(userId, listId);
      await expect(
        listService.toggleGroceryItem(userId, listId, item.id),
      ).resolves.toBeDefined();
    });
  });

  describe("duplicateGroceryList", () => {
    it("creates an independent, unchecked copy", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content(),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.toggleGroceryItem(userId, listId, item.id);

      const copyId = await listService.duplicateGroceryList(userId, listId);
      expect(copyId).not.toBe(listId);

      const copy = await prisma.groceryList.findUniqueOrThrow({
        where: { id: copyId },
        include: { items: true },
      });
      expect(copy.completedAt).toBeNull();
      expect(copy.items).toHaveLength(1);
      expect(copy.items[0].checkedAt).toBeNull();
    });
  });

  describe("combineGroceryItems (manual merge, §61.5)", () => {
    it("merges the deliberately-not-auto-combined 'can' vs 'g' pairing into one item, preserving both contributions", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Tomatoes", quantity: 1, unit: "can" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Tomatoes", quantity: 400, unit: "g" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });
      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items).toHaveLength(2);

      await listService.combineGroceryItems(userId, listId, [
        items[0].id,
        items[1].id,
      ]);

      const merged = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
        include: { contributions: true },
      });
      expect(merged).toHaveLength(1);
      expect(merged[0].contributions).toHaveLength(2);
      // Not honestly summable across "can"/"g" — falls back to a
      // concatenated display rather than fabricating one quantity.
      expect(merged[0].quantityDecimal).toBeNull();
    });
  });

  describe("switchGroceryItemToSubstitute", () => {
    it("switches a single-contribution item's values to its saved substitute", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    name: "Margarine",
                    quantity: 2,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: "cup",
                    displayText: null,
                    preparationNote: null,
                  },
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(item.name).toBe("Butter");

      await listService.switchGroceryItemToSubstitute(userId, listId, item.id);

      const updated = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(updated.name).toBe("Margarine");
      expect(updated.quantityDecimal?.toNumber()).toBe(2);
    });

    it("rejects switching a combined (multi-contribution) item", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeA = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Egg", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Egg", quantity: 2, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await expect(
        listService.switchGroceryItemToSubstitute(userId, listId, item.id),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("source refresh (§60.4/§60.5)", () => {
    it("previews and applies an ingredient quantity change from a same-major minor bump, preserving other items' checkoffs", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Flour", quantity: 2, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      // A second, unrelated manual item — must survive the refresh untouched.
      const manual = await listService.addManualGroceryItem(userId, listId, {
        name: "Paper towels",
      });
      await listService.toggleGroceryItem(userId, listId, manual.id);

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const flourLineageId =
        dish.currentVersion!.sections[0].ingredients[0].lineageId;
      const sectionLineageId = dish.currentVersion!.sections[0].lineageId;
      await dishService.editDish(
        userId,
        recipeId,
        dish.currentVersionId!,
        content({
          sections: [
            {
              lineageId: sectionLineageId,
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: flourLineageId,
                  name: "Flour",
                  quantity: 5,
                  unit: "cup",
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      const preview = await listService.previewGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );
      expect(preview.changed).toHaveLength(1);
      expect(preview.changed[0].name).toBe("Flour");

      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const flourItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
      });
      expect(flourItem.quantityDecimal?.toNumber()).toBe(5);

      const manualAfter = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: manual.id },
      });
      expect(manualAfter.checkedAt).not.toBeNull();
    });

    it("rejects refreshing a source whose Recipe was permanently deleted", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content(),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      await dishService.deleteDish(userId, recipeId, "RECIPE");

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await expect(
        listService.previewGroceryListSourceRefresh(userId, listId, source.id),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("legacy grocery category service re-export", () => {
    it("createGroceryCategory still works via service.ts", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      const category = await groceryService.createGroceryCategory(
        userId,
        "Test Cat",
      );
      expect(category.displayName).toBe("Test Cat");
    });
  });
});
