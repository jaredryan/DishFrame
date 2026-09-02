import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as dishService from "@/lib/dishes/service";
import * as listService from "@/lib/grocery/list-service";
import * as groceryService from "@/lib/grocery/service";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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

    it("fully combines every eligible ingredient when the exact same Recipe/Version is included twice (grocery combine QA finding)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const recipe = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Fried Rice",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Soy Sauce", quantity: 2, unit: "tbsp" }),
                ingredient({ name: "Rice", quantity: 2, unit: "cup" }),
                ingredient({ name: "Egg", quantity: 2, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      // Cooking it twice during the plan: the same Recipe added as two
      // separate sources rather than a single doubled scale factor — the
      // literal QA repro (two sources sharing one dish/version, folded in
      // one at a time via `addGroceryListSource`'s incremental combine
      // path, not `generateGroceryList`'s single batched pass).
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: recipe, scaleFactor: 1 }],
      });
      await listService.addGroceryListSource(
        userId,
        listId,
        recipe,
        undefined,
        1,
      );

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
        include: { items: { include: { contributions: true } } },
      });
      expect(list.items).toHaveLength(3);
      for (const item of list.items) {
        expect(item.contributions).toHaveLength(2);
      }
      const soySauce = list.items.find((i) => i.name === "Soy Sauce")!;
      expect(soySauce.quantityDecimal?.toNumber()).toBeCloseTo(4, 3);
      const rice = list.items.find((i) => i.name === "Rice")!;
      expect(rice.quantityDecimal?.toNumber()).toBeCloseTo(4, 3);
      const egg = list.items.find((i) => i.name === "Egg")!;
      expect(egg.quantityDecimal?.toNumber()).toBeCloseTo(4, 3);
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
          plannedDate: new Date(),
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
          plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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
        plannedDate: new Date(),
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

  describe("updateGroceryListDetails", () => {
    it("updates name, date, and active status together", async () => {
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
        plannedDate: new Date("2026-01-01"),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      const newDate = new Date("2026-02-14");
      await listService.updateGroceryListDetails(userId, listId, {
        title: "Valentine's dinner",
        plannedDate: newDate,
        isActive: false,
      });

      const updated = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
      });
      expect(updated.title).toBe("Valentine's dinner");
      expect(updated.plannedDate.toISOString().slice(0, 10)).toBe("2026-02-14");
      expect(updated.completedAt).not.toBeNull();

      // Setting isActive back to true reopens it.
      await listService.updateGroceryListDetails(userId, listId, {
        title: "Valentine's dinner",
        plannedDate: newDate,
        isActive: true,
      });
      const reactivated = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
      });
      expect(reactivated.completedAt).toBeNull();
    });

    it("rejects a blank title", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      await expect(
        listService.updateGroceryListDetails(userId, listId, {
          title: "   ",
          plannedDate: new Date(),
          isActive: true,
        }),
      ).rejects.toThrow(ValidationError);
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
        plannedDate: new Date(),
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

  describe("selectGroceryItemVariant (reversible substitute selection, Slice 12 correction 2)", () => {
    it("persists a scaled substitute snapshot at generation, independent of a later source edit", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 3 }],
      });
      const contribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItem: { groceryListId: listId } },
        });
      expect(contribution.substituteName).toBe("Margarine");
      expect(contribution.substituteQuantityDecimal?.toNumber()).toBe(6); // 2 * scaleFactor 3
      expect(contribution.substituteUnit).toBe("cup");

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
                ingredient({
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    name: "Ghee",
                    quantity: 5,
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
        "MINOR",
      );

      const afterEdit = await prisma.groceryItemContribution.findUniqueOrThrow({
        where: { id: contribution.id },
      });
      expect(afterEdit.substituteName).toBe("Margarine");
      expect(afterEdit.substituteQuantityDecimal?.toNumber()).toBe(6);
    });

    async function createButterMargarineList(
      ownerId: string,
    ): Promise<{ recipeId: string; listId: string; itemId: string }> {
      const recipeId = await dishService.createDish(
        ownerId,
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
      const listId = await listService.generateGroceryList(ownerId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      return { recipeId, listId, itemId: item.id };
    }

    it("selects PRIMARY -> SUBSTITUTE -> PRIMARY, recomputing the item's display each time (reversible in both directions)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      const { listId, itemId } = await createButterMargarineList(userId);

      const original = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(original.name).toBe("Butter");
      expect(original.quantityDecimal?.toNumber()).toBe(1);

      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "SUBSTITUTE",
      );
      const substituted = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(substituted.name).toBe("Margarine");
      expect(substituted.quantityDecimal?.toNumber()).toBe(2);

      // Reversible — switching back restores the frozen primary snapshot
      // exactly, since it was never overwritten (Slice 12 correction 2).
      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "PRIMARY",
      );
      const restored = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(restored.name).toBe("Butter");
      expect(restored.quantityDecimal?.toNumber()).toBe(1);

      // Repeated switching remains valid indefinitely.
      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "SUBSTITUTE",
      );
      const substitutedAgain = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(substitutedAgain.name).toBe("Margarine");
    });

    it("selects using the stored snapshot, not current source content", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      const { recipeId, listId, itemId } =
        await createButterMargarineList(userId);

      // Change the live substitute — selection must still use the frozen
      // generation-time snapshot, not this new value.
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
                ingredient({
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    name: "Ghee",
                    quantity: 9,
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
        "MINOR",
      );

      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "SUBSTITUTE",
      );

      const updated = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(updated.name).toBe("Margarine");
      expect(updated.quantityDecimal?.toNumber()).toBe(2);
    });

    it("keeps working in both directions after the source Recipe is permanently deleted (§60.6)", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      const { recipeId, listId, itemId } =
        await createButterMargarineList(userId);

      await dishService.deleteDish(userId, recipeId, "RECIPE");

      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "SUBSTITUTE",
      );
      const substituted = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(substituted.name).toBe("Margarine");

      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "PRIMARY",
      );
      const restored = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: itemId },
      });
      expect(restored.name).toBe("Butter");
      expect(restored.quantityDecimal?.toNumber()).toBe(1);
    });

    it("persists the selected variant through duplication", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      const { listId, itemId } = await createButterMargarineList(userId);

      await listService.selectGroceryItemVariant(
        userId,
        listId,
        itemId,
        "SUBSTITUTE",
      );

      const copyId = await listService.duplicateGroceryList(userId, listId);
      const copiedItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: copyId },
      });
      expect(copiedItem.name).toBe("Margarine");

      const copiedContribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItemId: copiedItem.id },
        });
      expect(copiedContribution.selectedVariant).toBe("SUBSTITUTE");
    });

    it("rejects selecting SUBSTITUTE on a contribution with no saved substitute", async () => {
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
                ingredient({ name: "Salt", quantity: 1, unit: "tsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await expect(
        listService.selectGroceryItemVariant(
          userId,
          listId,
          item.id,
          "SUBSTITUTE",
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects selecting a variant on a manual item", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const manual = await listService.addManualGroceryItem(userId, listId, {
        name: "Paper towels",
      });

      await expect(
        listService.selectGroceryItemVariant(
          userId,
          listId,
          manual.id,
          "SUBSTITUTE",
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects selecting a variant on a combined (multi-contribution) item", async () => {
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
        plannedDate: new Date(),
        sources: [
          { dishId: recipeA, scaleFactor: 1 },
          { dishId: recipeB, scaleFactor: 1 },
        ],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await expect(
        listService.selectGroceryItemVariant(
          userId,
          listId,
          item.id,
          "SUBSTITUTE",
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects selecting a variant on a completed list", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      const { listId, itemId } = await createButterMargarineList(userId);
      await listService.completeGroceryList(userId, listId);

      await expect(
        listService.selectGroceryItemVariant(
          userId,
          listId,
          itemId,
          "SUBSTITUTE",
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects a non-owner attempting to select a variant", async () => {
      const owner = await createTestUser();
      const intruder = await createTestUser();
      userId = owner.id;
      await initializeNewUser(owner.id);
      const { listId, itemId } = await createButterMargarineList(owner.id);

      await expect(
        listService.selectGroceryItemVariant(
          intruder.id,
          listId,
          itemId,
          "SUBSTITUTE",
        ),
      ).rejects.toThrow(NotFoundError);

      await deleteTestUser(intruder.id);
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
        plannedDate: new Date(),
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

    it("adds a newly-available substitute snapshot on refresh", async () => {
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
                ingredient({ name: "Butter", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const beforeContribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItem: { groceryListId: listId } },
        });
      expect(beforeContribution.substituteName).toBeNull();

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const butterLineageId =
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
                  lineageId: butterLineageId,
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
        "MINOR",
      );

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const afterContribution =
        await prisma.groceryItemContribution.findUniqueOrThrow({
          where: { id: beforeContribution.id },
        });
      expect(afterContribution.substituteName).toBe("Margarine");
      expect(afterContribution.substituteQuantityDecimal?.toNumber()).toBe(2);
    });

    it("replaces a changed substitute snapshot on refresh", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const beforeContribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItem: { groceryListId: listId } },
        });
      expect(beforeContribution.substituteName).toBe("Margarine");

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const butterLineageId =
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
                  lineageId: butterLineageId,
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    name: "Ghee",
                    quantity: 5,
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
        "MINOR",
      );

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const afterContribution =
        await prisma.groceryItemContribution.findUniqueOrThrow({
          where: { id: beforeContribution.id },
        });
      expect(afterContribution.substituteName).toBe("Ghee");
      expect(afterContribution.substituteQuantityDecimal?.toNumber()).toBe(5);
    });

    it("removes a substitute snapshot no longer present in the refreshed Version", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const beforeContribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItem: { groceryListId: listId } },
        });
      expect(beforeContribution.substituteName).toBe("Margarine");

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const butterLineageId =
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
                  lineageId: butterLineageId,
                  name: "Butter",
                  quantity: 1,
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
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const afterContribution =
        await prisma.groceryItemContribution.findUniqueOrThrow({
          where: { id: beforeContribution.id },
        });
      expect(afterContribution.substituteName).toBeNull();
      expect(afterContribution.substituteQuantityDecimal).toBeNull();
    });

    it("preserves a currently-SUBSTITUTE selection across refresh, showing the refreshed substitute values (Slice 12 correction 2)", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.selectGroceryItemVariant(
        userId,
        listId,
        item.id,
        "SUBSTITUTE",
      );

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const butterLineageId =
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
                  lineageId: butterLineageId,
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    name: "Ghee",
                    quantity: 5,
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
        "MINOR",
      );

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const contribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItemId: item.id },
        });
      expect(contribution.selectedVariant).toBe("SUBSTITUTE");
      expect(contribution.substituteName).toBe("Ghee");

      const refreshedItem = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(refreshedItem.name).toBe("Ghee");
      expect(refreshedItem.quantityDecimal?.toNumber()).toBe(5);
    });

    it("reverts a SUBSTITUTE selection to PRIMARY when the refreshed Version no longer has a substitute", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.selectGroceryItemVariant(
        userId,
        listId,
        item.id,
        "SUBSTITUTE",
      );

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const butterLineageId =
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
                  lineageId: butterLineageId,
                  name: "Butter",
                  quantity: 1,
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
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const contribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItemId: item.id },
        });
      expect(contribution.selectedVariant).toBe("PRIMARY");

      const refreshedItem = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(refreshedItem.name).toBe("Butter");
      expect(refreshedItem.quantityDecimal?.toNumber()).toBe(1);
    });

    it("adds a newly-available substitute on refresh while preserving an unchanged PRIMARY selection", async () => {
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
                ingredient({ name: "Butter", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const butterLineageId =
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
                  lineageId: butterLineageId,
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
        "MINOR",
      );

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
      );

      const contribution =
        await prisma.groceryItemContribution.findFirstOrThrow({
          where: { groceryListItemId: item.id },
        });
      expect(contribution.selectedVariant).toBe("PRIMARY");
      expect(contribution.substituteName).toBe("Margarine");

      const refreshedItem = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(refreshedItem.name).toBe("Butter");
    });

    it("leaves unrelated sources, manual items, checkoffs, and categories unchanged by a refresh", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);

      const untouchedRecipe = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Untouched",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Rice", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const refreshedRecipe = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Refreshed",
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
        plannedDate: new Date(),
        sources: [
          { dishId: untouchedRecipe, scaleFactor: 1 },
          { dishId: refreshedRecipe, scaleFactor: 1 },
        ],
      });

      const riceCategory = await prisma.groceryCategory.create({
        data: {
          ownerId: userId,
          normalizedName: "grains",
          displayName: "Grains",
          position: 50,
        },
      });
      const riceItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Rice" },
      });
      await listService.recategorizeGroceryItem(
        userId,
        listId,
        riceItem.id,
        riceCategory.id,
      );
      await listService.toggleGroceryItem(userId, listId, riceItem.id);

      const manual = await listService.addManualGroceryItem(userId, listId, {
        name: "Paper towels",
      });
      await listService.toggleGroceryItem(userId, listId, manual.id);

      const dish = await prisma.dish.findUniqueOrThrow({
        where: { id: refreshedRecipe },
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
        refreshedRecipe,
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
                  quantity: 4,
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

      const refreshedSource = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId, dishId: refreshedRecipe },
      });
      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        refreshedSource.id,
      );

      const riceAfter = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: riceItem.id },
      });
      expect(riceAfter.categoryId).toBe(riceCategory.id);
      expect(riceAfter.checkedAt).not.toBeNull();
      expect(riceAfter.quantityDecimal?.toNumber()).toBe(1);

      const manualAfter = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: manual.id },
      });
      expect(manualAfter.checkedAt).not.toBeNull();

      const flourAfter = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
      });
      expect(flourAfter.quantityDecimal?.toNumber()).toBe(4);
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
        plannedDate: new Date(),
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

    it("applies a refresh cleanly even when a concurrent mutation already removed one of the source's contributions (intermittent Sync failure QA finding)", async () => {
      // Regression for a real race: `applyGroceryListSourceRefresh` used to
      // read this source's existing contributions with a plain (pre-
      // transaction) query, then delete/update them by id inside the
      // transaction that followed. A concurrent mutation landing in that
      // gap (another tab, a second rapid Sync click) could delete a row
      // this transaction still held a now-stale id for, throwing a Prisma
      // "record not found" error — intermittent, and gone on retry once
      // the stale read was no longer in play. The fix reads existing
      // contributions from inside the transaction instead; this simulates
      // the race by deleting a contribution/item out from under the
      // refresh (standing in for a concurrent actor) immediately before
      // calling it, and asserts the refresh still completes without
      // throwing, correctly recreating the vanished ingredient.
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
                ingredient({ name: "Sugar", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });

      const flourItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
      });
      // Stand-in for a concurrent mutation that removed this ingredient's
      // sole contribution (and, with it, the item) between an old
      // implementation's pre-transaction read and its transactional
      // deletes.
      await prisma.groceryItemContribution.deleteMany({
        where: { groceryListItemId: flourItem.id },
      });
      await prisma.groceryListItem.delete({ where: { id: flourItem.id } });

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await expect(
        listService.applyGroceryListSourceRefresh(userId, listId, source.id),
      ).resolves.not.toThrow();

      const flourAfter = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
      });
      expect(flourAfter.quantityDecimal?.toNumber()).toBe(2);
      const sugarAfter = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Sugar" },
      });
      expect(sugarAfter.quantityDecimal?.toNumber()).toBe(1);
    });
  });

  describe("Grocery List detail page meal management", () => {
    it("addGroceryListSource folds a new source's ingredients into existing combinable items and creates new ones", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeA, scaleFactor: 1 }],
      });

      const recipeB = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Second Recipe",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Flour", quantity: 3, unit: "cup" }),
                ingredient({ name: "Sugar", quantity: 1, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );

      await listService.addGroceryListSource(
        userId,
        listId,
        recipeB,
        undefined,
        1,
      );

      const sources = await prisma.groceryListSource.findMany({
        where: { groceryListId: listId },
      });
      expect(sources).toHaveLength(2);

      const flourItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
        include: { contributions: true },
      });
      expect(flourItem.quantityDecimal?.toNumber()).toBe(5);
      expect(flourItem.contributions).toHaveLength(2);

      const sugarItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Sugar" },
      });
      expect(sugarItem.quantityDecimal?.toNumber()).toBe(1);
    });

    it("addGroceryListSource honors an explicitly chosen historical Version instead of defaulting to current", async () => {
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
      const dishBefore = await prisma.dish.findUniqueOrThrow({
        where: { id: recipeId },
        include: {
          currentVersion: {
            include: { sections: { include: { ingredients: true } } },
          },
        },
      });
      const historicalVersionId = dishBefore.currentVersionId!;
      const sectionLineageId = dishBefore.currentVersion!.sections[0].lineageId;
      const flourLineageId =
        dishBefore.currentVersion!.sections[0].ingredients[0].lineageId;

      // Bump to a new current Version (Flour 2 -> 5) — the historical
      // Version chosen below must snapshot its own ingredients (2), never
      // the dish's now-current ones (5).
      await dishService.editDish(
        userId,
        recipeId,
        historicalVersionId,
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

      const placeholderRecipeId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          title: "Placeholder",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Salt", quantity: 1, unit: "tsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const listId = await listService.generateGroceryList(userId, {
        title: "This week",
        plannedDate: new Date(),
        sources: [{ dishId: placeholderRecipeId, scaleFactor: 1 }],
      });

      await listService.addGroceryListSource(
        userId,
        listId,
        recipeId,
        historicalVersionId,
        1,
      );

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId, dishId: recipeId },
      });
      expect(source.dishVersionId).toBe(historicalVersionId);

      const flourItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
      });
      expect(flourItem.quantityDecimal?.toNumber()).toBe(2);
    });

    it("removeGroceryListSource deletes that source's exclusive items but preserves manual items and other sources", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const manual = await listService.addManualGroceryItem(userId, listId, {
        name: "Paper towels",
      });

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await listService.removeGroceryListSource(userId, listId, source.id);

      const remainingSources = await prisma.groceryListSource.count({
        where: { groceryListId: listId },
      });
      expect(remainingSources).toBe(0);

      const flourItem = await prisma.groceryListItem.findFirst({
        where: { groceryListId: listId, name: "Flour" },
      });
      expect(flourItem).toBeNull();

      const manualAfter = await prisma.groceryListItem.findUnique({
        where: { id: manual.id },
      });
      expect(manualAfter).not.toBeNull();
    });

    it("applyGroceryListSourceRefresh with a scale override rescales the item and persists the source's new scale", async () => {
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
        plannedDate: new Date(),
        sources: [{ dishId: recipeId, scaleFactor: 1 }],
      });
      const dishVersionId = await currentVersionId(recipeId);

      const source = await prisma.groceryListSource.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      await listService.applyGroceryListSourceRefresh(
        userId,
        listId,
        source.id,
        dishVersionId,
        2,
      );

      const flourItem = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId, name: "Flour" },
      });
      expect(flourItem.quantityDecimal?.toNumber()).toBe(4);

      const sourceAfter = await prisma.groceryListSource.findUniqueOrThrow({
        where: { id: source.id },
      });
      expect(decimalToNumber(sourceAfter.scaleFactor)).toBe(2);
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
