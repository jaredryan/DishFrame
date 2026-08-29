import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as dishService from "@/lib/dishes/service";
import * as cookingService from "@/lib/cooking/service";
import * as mealPlanService from "@/lib/mealplans/service";
import * as listService from "@/lib/grocery/list-service";
import { getOwnedMealPlanOrThrow } from "@/lib/mealplans/queries";
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
    stage: "ACTIVE",
    cuisine: null,
    description: null,
    yieldQuantity: 4,
    yieldUnit: "servings",
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

// Editing without carrying the existing row's `lineageId` forward mints a
// fresh one (ARCHITECTURE_PROPOSAL.md §D.-1) — indistinguishable from
// deleting the old ingredient and adding an unrelated new one, which would
// break the resync tests' contribution-matching-by-lineage entirely. A real
// editor always resubmits the loaded lineageId; this mirrors that.
async function primaryIngredientLineage(dishId: string) {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  return prisma.ingredient.findFirstOrThrow({
    where: {
      dishVersionId: dish.currentVersionId!,
      substituteForIngredientId: null,
    },
    include: { substitute: true },
  });
}

describe("mealplans service", () => {
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

  async function setupMealPlan() {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const mealPlanId = await mealPlanService.createMealPlan(userId, {
      title: "This week",
      startDate: new Date("2026-08-03T00:00:00.000Z"),
      endDate: new Date("2026-08-09T00:00:00.000Z"),
    });
    return { userId, mealPlanId };
  }

  it("pins the exact current Version at add time (§76.3)", async () => {
    const { mealPlanId } = await setupMealPlan();
    const dishId = await dishService.createDish(userId!, "RECIPE", content());

    const entryId = await mealPlanService.addMealPlanEntry(
      userId!,
      mealPlanId,
      {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      },
    );

    const entry = await prisma.mealPlanEntry.findUniqueOrThrow({
      where: { id: entryId },
    });
    expect(entry.dishVersionId).toBe(await currentVersionId(dishId));
    expect(entry.sourceDishTitleSnapshot).toBe("Ginger Soy Bowl");
    expect(entry.sourceDishVersionLabelSnapshot).toBe("V1.0");

    // Editing the Recipe afterward must not silently move the entry.
    await dishService.editDish(
      userId!,
      dishId,
      entry.dishVersionId!,
      content({ title: "Renamed" }),
      "MINOR",
    );
    const unchanged = await prisma.mealPlanEntry.findUniqueOrThrow({
      where: { id: entryId },
    });
    expect(unchanged.dishVersionId).toBe(entry.dishVersionId);
  });

  describe("grocery synchronization", () => {
    it("generates a MEAL_PLAN_LINKED list with contributions keyed by mealPlanEntryId", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );

      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
        include: { items: { include: { contributions: true } } },
      });
      expect(list.mode).toBe("MEAL_PLAN_LINKED");
      expect(list.linkedMealPlanId).toBe(mealPlanId);
      expect(list.items).toHaveLength(1);
      expect(list.items[0].contributions[0].mealPlanEntryId).toBe(entryId);
      expect(
        list.items[0].contributions[0].quantityDecimal?.toNumber(),
      ).toBeCloseTo(2);
    });

    it("adding an entry adds new contributions without disturbing existing ones", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Dish A",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Garlic", quantity: 2, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: dishA,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      const dishB = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Dish B",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Ginger", quantity: 1, unit: "tbsp" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: dishB,
        cookDate: new Date("2026-08-04T00:00:00.000Z"),
      });

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
        include: { items: { include: { contributions: true } } },
      });
      const names = list.items.map((i) => i.name).sort();
      expect(names).toEqual(["Garlic", "Ginger"]);
    });

    it("removing an entry flags its contribution REMOVED and preserves checkedAt (round-2 Correction 5)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Onion", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      const before = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      // Simulate the user checking it off before the plan changes.
      await prisma.groceryListItem.update({
        where: { id: before.id },
        data: { checkedAt: new Date() },
      });

      await mealPlanService.removeMealPlanEntry(userId!, mealPlanId, entryId);

      const after = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: before.id },
        include: { contributions: true },
      });
      expect(after.checkedAt).not.toBeNull();
      expect(after.syncFlag).toBe("REMOVED");
      expect(after.contributions).toHaveLength(1);
      expect(after.contributions[0].state).toBe("REMOVED");
    });

    it("changing an entry's target yield flags CHANGED with the previous quantity preserved", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          yieldQuantity: 4,
          yieldUnit: "servings",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Rice", quantity: 2, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 4,
          targetYieldUnit: "servings",
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      await mealPlanService.updateMealPlanEntry(userId!, mealPlanId, entryId, {
        targetYieldQuantity: 8,
        targetYieldUnit: "servings",
      });

      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
        include: { contributions: true },
      });
      expect(item.syncFlag).toBe("CHANGED");
      expect(item.quantityDecimal?.toNumber()).toBeCloseTo(4); // doubled from 2 cups
      expect(item.contributions[0].previousQuantityText).toContain("2");
    });

    it("preserves manual items and unrelated sources through a resync", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Carrot", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      const listService = await import("@/lib/grocery/list-service");
      await listService.addManualGroceryItem(userId!, listId, {
        name: "Paper towels",
      });

      await mealPlanService.updateMealPlanEntry(userId!, mealPlanId, entryId, {
        note: "extra spicy",
      });

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
        include: { items: true },
      });
      const manual = list.items.find((i) => i.isManual);
      expect(manual?.name).toBe("Paper towels");
      expect(manual?.syncFlag).toBe("UNCHANGED");
    });

    it("generates from a chosen date range by filtering entryIds — one of §81.1's three source modes", async () => {
      const { mealPlanId } = await setupMealPlan();
      const earlyDish = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Early Dish",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Lemon", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const lateDish = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Late Dish",
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
      const earlyEntryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: earlyDish, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: lateDish,
        cookDate: new Date("2026-08-08T00:00:00.000Z"),
      });

      // A "chosen date range" is expressed as a caller-computed entryIds
      // subset — generateGroceryListFromMealPlan already accepts an
      // arbitrary subset (§81.1's "selected plan entries"), so filtering
      // that subset by cookDate satisfies "a chosen date range" without a
      // separate code path or UI control.
      const mealPlan = await getOwnedMealPlanOrThrow(userId!, mealPlanId);
      const rangeStart = new Date("2026-08-01T00:00:00.000Z");
      const rangeEnd = new Date("2026-08-05T00:00:00.000Z");
      const entryIdsInRange = mealPlan.entries
        .filter((e) => e.cookDate >= rangeStart && e.cookDate <= rangeEnd)
        .map((e) => e.id);
      expect(entryIdsInRange).toEqual([earlyEntryId]);

      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Early week", entryIds: entryIdsInRange },
      );
      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items.map((i) => i.name)).toEqual(["Lemon"]);
    });

    it("a chosen substitute variant on a Meal-Plan-linked item survives an unrelated resync (§62.2's post-generation entry point)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.selectGroceryItemVariant(
        userId!,
        listId,
        item.id,
        "SUBSTITUTE",
      );
      await prisma.groceryListItem.update({
        where: { id: item.id },
        data: { checkedAt: new Date() },
      });

      // An unrelated plan mutation triggers a resync of this same list.
      const otherDish = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Other Dish",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Pepper", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: otherDish,
        cookDate: new Date("2026-08-04T00:00:00.000Z"),
      });

      const afterResync = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterResync.name).toBe("Margarine");
      expect(afterResync.contributions[0].selectedVariant).toBe("SUBSTITUTE");
      expect(afterResync.checkedAt).not.toBeNull();
      expect(afterResync.syncFlag).toBe("UNCHANGED");
    });

    // Code-audit correctness fix (2026-08-27): the sync-flag computation
    // used to compare only the PRIMARY snapshot against fresh content —
    // stacking a substitute selection with a resync that changes the
    // substitute's own content (or removes it) went completely undetected,
    // silently leaving the item `UNCHANGED` even though its actual synced
    // data materially changed.
    it("flags CHANGED when a chosen substitute variant's own content changes on resync", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.selectGroceryItemVariant(
        userId!,
        listId,
        item.id,
        "SUBSTITUTE",
      );

      // Bump the substitute's own quantity — the primary ("Butter") stays
      // identical, so a primary-only comparison would miss this entirely.
      const primary = await primaryIngredientLineage(dishId);
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: primary.lineageId,
                  name: "Butter",
                  quantity: 1,
                  unit: "cup",
                  substitute: {
                    lineageId: primary.substitute!.lineageId,
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
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
      );

      const afterResync = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterResync.contributions[0].selectedVariant).toBe("SUBSTITUTE");
      expect(
        afterResync.contributions[0].substituteQuantityDecimal?.toString(),
      ).toBe("2");
      expect(afterResync.syncFlag).toBe("CHANGED");
    });

    it("flags CHANGED when a chosen substitute variant's substitute disappears on resync (reverting to PRIMARY)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.selectGroceryItemVariant(
        userId!,
        listId,
        item.id,
        "SUBSTITUTE",
      );

      // Remove the substitute entirely — the primary ("Butter") stays
      // identical.
      const primary = await primaryIngredientLineage(dishId);
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: primary.lineageId,
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
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
      );

      const afterResync = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      // Reverted to PRIMARY, same rule as an ordinary standalone-list
      // refresh (Slice 12 correction 2) — but now correctly flagged, not
      // silently swallowed.
      expect(afterResync.contributions[0].selectedVariant).toBe("PRIMARY");
      expect(afterResync.syncFlag).toBe("CHANGED");
    });

    it("preserves a manual recategorization through an unrelated resync (categories/ordering guarantee)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Chili flakes", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      const otherCategory = await prisma.groceryCategory.create({
        data: {
          ownerId: userId!,
          normalizedName: "spices",
          displayName: "Spices",
          position: 99,
        },
      });
      await listService.recategorizeGroceryItem(
        userId!,
        listId,
        item.id,
        otherCategory.id,
      );

      const otherDish = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Unrelated Dish",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Parsley", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: otherDish,
        cookDate: new Date("2026-08-04T00:00:00.000Z"),
      });

      const afterResync = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      expect(afterResync.categoryId).toBe(otherCategory.id);
      expect(afterResync.position).toBe(0);
    });

    it("keeps a manually removed optional item removed through an unrelated later resync (§81.4 correction, formerly a Slice 21A known gap)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
                  unit: null,
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(item.isOptional).toBe(true);

      await listService.removeGroceryItem(userId!, listId, item.id);
      const removed = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(removed).toHaveLength(0);

      // The entry that produces Cilantro is untouched, and a plan mutation
      // elsewhere still triggers a resync of every active linked list — but
      // `removeGroceryItem` tombstoned this exact (entry, ingredient)
      // pairing, so the "Added" fold-in skips recreating it.
      const otherDish = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Unrelated Dish 2",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Salt", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: otherDish,
        cookDate: new Date("2026-08-04T00:00:00.000Z"),
      });

      const afterResync = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(afterResync.map((i) => i.name).sort()).toEqual(["Salt"]);
    });

    it("lets a materially different contribution from the same removed ingredient reappear (different lineage, not the same removed identity)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
                  unit: null,
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.removeGroceryItem(userId!, listId, item.id);

      // A genuinely new Version of the same entry's Recipe (a new
      // lineageId for its Cilantro line, since editing without carrying the
      // lineage forward mints a fresh one) is a materially different
      // contribution identity — it should reappear rather than staying
      // suppressed by the earlier removal.
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  name: "Cilantro",
                  quantity: 2,
                  unit: null,
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MAJOR",
      );
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
        await currentVersionId(dishId),
      );

      const afterAdopt = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(afterAdopt.map((i) => i.name)).toEqual(["Cilantro"]);
    });
  });

  describe("Meal Plan entry selection per list (§81.7)", () => {
    async function addDishEntry(
      mealPlanId: string,
      title: string,
      ingredientName: string,
      cookDate: string,
    ) {
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title,
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [ingredient({ name: ingredientName, quantity: 1 })],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId, cookDate: new Date(cookDate) },
      );
      return { dishId, entryId };
    }

    it("generating from a selected subset excludes the rest, and that exclusion survives an unrelated later resync", async () => {
      const { mealPlanId } = await setupMealPlan();
      const a = await addDishEntry(
        mealPlanId,
        "Dish A",
        "Garlic",
        "2026-08-03T00:00:00.000Z",
      );
      const b = await addDishEntry(
        mealPlanId,
        "Dish B",
        "Onion",
        "2026-08-04T00:00:00.000Z",
      );

      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Just A", entryIds: [a.entryId] },
      );

      const initialItems = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(initialItems.map((i) => i.name)).toEqual(["Garlic"]);

      // An unrelated mutation (adding a third, unselected entry) resyncs
      // every active linked list — the excluded entry (Dish B) must not be
      // pulled in just because the plan itself now has more entries.
      await addDishEntry(
        mealPlanId,
        "Dish C",
        "Ginger",
        "2026-08-05T00:00:00.000Z",
      );

      const afterUnrelatedMutation = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(afterUnrelatedMutation.map((i) => i.name)).toEqual(["Garlic"]);

      // One Meal Plan may feed a second list covering a different subset.
      const secondListId =
        await mealPlanService.generateGroceryListFromMealPlan(
          userId!,
          mealPlanId,
          { title: "Just B", entryIds: [b.entryId] },
        );
      const secondListItems = await prisma.groceryListItem.findMany({
        where: { groceryListId: secondListId },
      });
      expect(secondListItems.map((i) => i.name)).toEqual(["Onion"]);
    });

    it("toggling an entry off removes its contributions from this list (flagged, not deleted); toggling it back on restores them", async () => {
      const { mealPlanId } = await setupMealPlan();
      const a = await addDishEntry(
        mealPlanId,
        "Dish A",
        "Garlic",
        "2026-08-03T00:00:00.000Z",
      );

      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      await mealPlanService.setMealPlanGroceryListEntryIncluded(
        userId!,
        mealPlanId,
        listId,
        a.entryId,
        false,
      );
      const excluded = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(excluded.syncFlag).toBe("REMOVED");

      await mealPlanService.setMealPlanGroceryListEntryIncluded(
        userId!,
        mealPlanId,
        listId,
        a.entryId,
        true,
      );
      const restored = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(restored.syncFlag).not.toBe("REMOVED");
      expect(restored.name).toBe("Garlic");
    });

    it("toggling an entry never adds, removes, or edits the Meal Plan's own entries", async () => {
      const { mealPlanId } = await setupMealPlan();
      const a = await addDishEntry(
        mealPlanId,
        "Dish A",
        "Garlic",
        "2026-08-03T00:00:00.000Z",
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      await mealPlanService.setMealPlanGroceryListEntryIncluded(
        userId!,
        mealPlanId,
        listId,
        a.entryId,
        false,
      );

      const mealPlan = await getOwnedMealPlanOrThrow(userId!, mealPlanId);
      expect(mealPlan.entries.map((e) => e.id)).toEqual([a.entryId]);
    });

    it("a new entry added after Grocery Lists already exist appears unchecked in each, without contributing items, and explicit inclusion is per-list", async () => {
      const { mealPlanId } = await setupMealPlan();
      const a = await addDishEntry(
        mealPlanId,
        "Dish A",
        "Garlic",
        "2026-08-03T00:00:00.000Z",
      );
      const b = await addDishEntry(
        mealPlanId,
        "Dish B",
        "Onion",
        "2026-08-04T00:00:00.000Z",
      );

      // Two existing lists, each already covering a different subset.
      const listAId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "List A", entryIds: [a.entryId] },
      );
      const listBId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "List B", entryIds: [b.entryId] },
      );

      // A brand-new entry, added after both lists already exist.
      const c = await addDishEntry(
        mealPlanId,
        "Dish C",
        "Ginger",
        "2026-08-05T00:00:00.000Z",
      );

      // Neither pre-existing list gains Ginger automatically.
      const listAItems = await prisma.groceryListItem.findMany({
        where: { groceryListId: listAId },
      });
      const listBItems = await prisma.groceryListItem.findMany({
        where: { groceryListId: listBId },
      });
      expect(listAItems.map((i) => i.name)).toEqual(["Garlic"]);
      expect(listBItems.map((i) => i.name)).toEqual(["Onion"]);

      // It is available (excluded, i.e. present-but-unchecked) in both.
      const exclusionInA =
        await prisma.groceryListMealPlanEntryExclusion.findUnique({
          where: {
            groceryListId_mealPlanEntryId: {
              groceryListId: listAId,
              mealPlanEntryId: c.entryId,
            },
          },
        });
      const exclusionInB =
        await prisma.groceryListMealPlanEntryExclusion.findUnique({
          where: {
            groceryListId_mealPlanEntryId: {
              groceryListId: listBId,
              mealPlanEntryId: c.entryId,
            },
          },
        });
      expect(exclusionInA).not.toBeNull();
      expect(exclusionInB).not.toBeNull();
      const mealPlan = await getOwnedMealPlanOrThrow(userId!, mealPlanId);
      expect(mealPlan.entries.map((e) => e.id)).toContain(c.entryId);

      // Explicitly including it in List A only affects List A.
      await mealPlanService.setMealPlanGroceryListEntryIncluded(
        userId!,
        mealPlanId,
        listAId,
        c.entryId,
        true,
      );
      const listAAfterInclude = await prisma.groceryListItem.findMany({
        where: { groceryListId: listAId },
      });
      const listBAfterInclude = await prisma.groceryListItem.findMany({
        where: { groceryListId: listBId },
      });
      expect(listAAfterInclude.map((i) => i.name).sort()).toEqual([
        "Garlic",
        "Ginger",
      ]);
      expect(listBAfterInclude.map((i) => i.name)).toEqual(["Onion"]);
    });

    it("does not exclude a Meal Plan entry from a Grocery List generated after that entry already exists (generation's own selection is unaffected)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const a = await addDishEntry(
        mealPlanId,
        "Dish A",
        "Garlic",
        "2026-08-03T00:00:00.000Z",
      );

      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items.map((i) => i.name)).toEqual(["Garlic"]);
      const exclusion =
        await prisma.groceryListMealPlanEntryExclusion.findUnique({
          where: {
            groceryListId_mealPlanEntryId: {
              groceryListId: listId,
              mealPlanEntryId: a.entryId,
            },
          },
        });
      expect(exclusion).toBeNull();
    });
  });

  describe("optional-item tombstone invalidation on a required transition (§81.4 correction)", () => {
    async function setupRemovedOptionalCilantro() {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
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
                  unit: null,
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      const lineage = await primaryIngredientLineage(dishId);
      await listService.removeGroceryItem(userId!, listId, item.id);

      const tombstone =
        await prisma.groceryListRemovedContribution.findUniqueOrThrow({
          where: {
            groceryListId_mealPlanEntryId_ingredientLineageId: {
              groceryListId: listId,
              mealPlanEntryId: entryId,
              ingredientLineageId: lineage.lineageId,
            },
          },
        });
      expect(tombstone.wasOptional).toBe(true);

      return { mealPlanId, dishId, entryId, listId, lineage };
    }

    it("invalidates the tombstone once the same lineage becomes required, letting the required contribution appear", async () => {
      const { mealPlanId, dishId, entryId, listId, lineage } =
        await setupRemovedOptionalCilantro();

      // Same lineageId carried forward, isOptional flipped to false.
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: lineage.lineageId,
                  name: "Cilantro",
                  quantity: 1,
                  unit: null,
                  isOptional: false,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
        await currentVersionId(dishId),
      );

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items.map((i) => i.name)).toEqual(["Cilantro"]);
      expect(items[0].isOptional).toBe(false);

      const tombstoneAfter =
        await prisma.groceryListRemovedContribution.findUnique({
          where: {
            groceryListId_mealPlanEntryId_ingredientLineageId: {
              groceryListId: listId,
              mealPlanEntryId: entryId,
              ingredientLineageId: lineage.lineageId,
            },
          },
        });
      expect(tombstoneAfter).toBeNull();
    });

    it("does not automatically revive the old suppression if the lineage becomes optional again after a required transition", async () => {
      const { mealPlanId, dishId, entryId, listId, lineage } =
        await setupRemovedOptionalCilantro();

      // First transition: optional -> required (invalidates the tombstone).
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: lineage.lineageId,
                  name: "Cilantro",
                  quantity: 1,
                  unit: null,
                  isOptional: false,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
        await currentVersionId(dishId),
      );

      // Second transition: required -> optional again, same lineage.
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: lineage.lineageId,
                  name: "Cilantro",
                  quantity: 1,
                  unit: null,
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
        await currentVersionId(dishId),
      );

      // The old (already-invalidated) tombstone must not resurface and
      // suppress it again — it stays present, now optional.
      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items.map((i) => i.name)).toEqual(["Cilantro"]);
      expect(items[0].isOptional).toBe(true);
    });

    it("keeps unconditionally suppressing a tombstone recorded from removing an already-required contribution, even if it later becomes optional", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Salt", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      const lineage = await primaryIngredientLineage(dishId);
      await listService.removeGroceryItem(userId!, listId, item.id);

      const tombstone =
        await prisma.groceryListRemovedContribution.findUniqueOrThrow({
          where: {
            groceryListId_mealPlanEntryId_ingredientLineageId: {
              groceryListId: listId,
              mealPlanEntryId: entryId,
              ingredientLineageId: lineage.lineageId,
            },
          },
        });
      expect(tombstone.wasOptional).toBe(false);

      // Same lineage, now made optional — an already-required-at-removal
      // tombstone is unaffected by this rule and keeps suppressing.
      await dishService.editDish(
        userId!,
        dishId,
        await currentVersionId(dishId),
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({
                  lineageId: lineage.lineageId,
                  name: "Salt",
                  quantity: 1,
                  unit: null,
                  isOptional: true,
                }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
        "MINOR",
      );
      await mealPlanService.adoptNewerVersionInEntry(
        userId!,
        mealPlanId,
        entryId,
        await currentVersionId(dishId),
      );

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items).toHaveLength(0);
    });
  });

  describe("Sync now outcome summary (§81.2 UX correction)", () => {
    it("reports added/removed/changed counts for the list the user actually synced", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [ingredient({ name: "Garlic", quantity: 1 })],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      const noopSummary = await mealPlanService.resyncMealPlanGroceryLists(
        userId!,
        mealPlanId,
        listId,
      );
      expect(noopSummary).toEqual({ added: 0, removed: 0, changed: 0 });

      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: await dishService.createDish(
          userId!,
          "RECIPE",
          content({
            title: "Dish B",
            sections: [
              {
                name: null,
                guidanceNote: null,
                position: 0,
                ingredients: [ingredient({ name: "Onion", quantity: 1 })],
                instructions: [],
                partLinks: [],
              },
            ],
          }),
        ),
        cookDate: new Date("2026-08-04T00:00:00.000Z"),
      });
      // The Meal Plan mutation above already resynced this list automatically
      // (§81.2) — a further manual sync with nothing new to find reports no
      // changes, distinct from the first sync that actually added Onion.
      const afterAddSummary = await mealPlanService.resyncMealPlanGroceryLists(
        userId!,
        mealPlanId,
        listId,
      );
      expect(afterAddSummary).toEqual({ added: 0, removed: 0, changed: 0 });

      const items = await prisma.groceryListItem.findMany({
        where: { groceryListId: listId },
      });
      expect(items.map((i) => i.name).sort()).toEqual(["Garlic", "Onion"]);
    });

    it("returns null for a Meal Plan mutation's own automatic resync (no focus list requested)", async () => {
      const { mealPlanId } = await setupMealPlan();
      const summary = await mealPlanService.resyncMealPlanGroceryLists(
        userId!,
        mealPlanId,
      );
      expect(summary).toBeNull();
    });
  });

  describe("sticky unacknowledged CHANGED contributions (post-Slice-15 seed-review correction)", () => {
    it("stays CHANGED with checkoff and the original previous-value snapshot preserved through an unrelated resync, until acknowledged — then a later ordinary resync settles back to ACTIVE/UNCHANGED unless something changes again", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Dish A",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Rice", quantity: 2, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryAId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId: dishA,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 4,
          targetYieldUnit: "servings",
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      await listService.toggleGroceryItem(userId!, listId, item.id);

      // 1. Trigger a real CHANGED (target yield 4 -> 8, doubling the
      // resolved quantity) — becomes unacknowledged CHANGED.
      await mealPlanService.updateMealPlanEntry(userId!, mealPlanId, entryAId, {
        targetYieldQuantity: 8,
        targetYieldUnit: "servings",
      });
      const afterChange = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterChange.syncFlag).toBe("CHANGED");
      expect(afterChange.checkedAt).not.toBeNull();
      expect(afterChange.flagAcknowledgedAt).toBeNull();
      const originalPrevious =
        afterChange.contributions[0].previousQuantityText;
      expect(originalPrevious).toContain("2");

      // 2. An unrelated plan mutation (a different Recipe, different
      // entry) resyncs the same list.
      const dishB = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Dish B",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Basil", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: dishB,
        cookDate: new Date("2026-08-04T00:00:00.000Z"),
      });

      // 3 & 4. Remains CHANGED; previous-value snapshot and checkoff
      // remain intact — the unrelated resync must not silently erase the
      // warning (the exact bug this correction fixes).
      const afterUnrelated = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterUnrelated.syncFlag).toBe("CHANGED");
      expect(afterUnrelated.checkedAt).not.toBeNull();
      expect(afterUnrelated.flagAcknowledgedAt).toBeNull();
      expect(afterUnrelated.contributions[0].previousQuantityText).toBe(
        originalPrevious,
      );
      expect(afterUnrelated.contributions[0].state).toBe("CHANGED");

      // 5. Acknowledging clears the warning.
      await listService.acknowledgeGroceryItemSync(userId!, listId, item.id);
      const afterAck = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterAck.flagAcknowledgedAt).not.toBeNull();
      expect(afterAck.contributions[0].acknowledgedAt).not.toBeNull();
      // Acknowledging is not itself a mutation of the underlying sync
      // state — syncFlag/state stay CHANGED until the next resync
      // actually re-evaluates them (matches acknowledgeGroceryItemSync's
      // own doc comment).
      expect(afterAck.syncFlag).toBe("CHANGED");

      // 6. A later *ordinary* resync (another unrelated entry, no further
      // change to Dish A itself) settles the now-acknowledged contribution
      // back to ACTIVE/UNCHANGED, exactly as it did before this
      // correction — acknowledgment, not mere time passing, is what
      // allows this.
      const dishC = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Dish C",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Thyme", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId: dishC,
        cookDate: new Date("2026-08-05T00:00:00.000Z"),
      });

      const afterSettle = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterSettle.syncFlag).toBe("UNCHANGED");
      expect(afterSettle.contributions[0].state).toBe("ACTIVE");
      expect(afterSettle.checkedAt).not.toBeNull();
    });

    it("keeps the original unseen previous-value snapshot (not an intermediate one) when the same contribution changes again before acknowledgment, while the live value tracks the latest change", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          title: "Dish A",
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Rice", quantity: 2, unit: "cup" }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryAId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId: dishA,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 4,
          targetYieldUnit: "servings",
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });

      // First change: 4 -> 8 (2 cup -> 4 cup). Unacknowledged CHANGED,
      // baseline "2 cup".
      await mealPlanService.updateMealPlanEntry(userId!, mealPlanId, entryAId, {
        targetYieldQuantity: 8,
        targetYieldUnit: "servings",
      });

      // Second change before acknowledgment: 8 -> 12 (4 cup -> 6 cup).
      await mealPlanService.updateMealPlanEntry(userId!, mealPlanId, entryAId, {
        targetYieldQuantity: 12,
        targetYieldUnit: "servings",
      });

      const afterSecondChange = await prisma.groceryListItem.findUniqueOrThrow({
        where: { id: item.id },
        include: { contributions: true },
      });
      expect(afterSecondChange.syncFlag).toBe("CHANGED");
      expect(afterSecondChange.quantityDecimal?.toNumber()).toBeCloseTo(6); // latest live value
      // The baseline stays the ORIGINAL unseen "2 cup," not the
      // intermediate "4 cup" the user never saw either.
      expect(afterSecondChange.contributions[0].previousQuantityText).toContain(
        "2",
      );
    });
  });

  describe("completion freeze (§81.5)", () => {
    it("does not resync a completed list", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Lime", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );
      await prisma.groceryList.update({
        where: { id: listId },
        data: { completedAt: new Date() },
      });

      await mealPlanService.removeMealPlanEntry(userId!, mealPlanId, entryId);

      const item = await prisma.groceryListItem.findFirstOrThrow({
        where: { groceryListId: listId },
      });
      expect(item.syncFlag).toBe("UNCHANGED");
    });
  });

  describe("Cooking Session integration (§78)", () => {
    it("links the session and flips the entry to IN_PROGRESS, then COOKED on a Completed session", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(userId!, "RECIPE", content());
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );

      const session = await mealPlanService.startSessionFromEntry(
        userId!,
        mealPlanId,
        entryId,
      );

      const inProgress = await prisma.mealPlanEntry.findUniqueOrThrow({
        where: { id: entryId },
      });
      expect(inProgress.status).toBe("IN_PROGRESS");
      expect(inProgress.linkedSessionId).toBe(session.id);

      await cookingService.endCookingSession(userId!, session.id, "COMPLETED");

      const cooked = await prisma.mealPlanEntry.findUniqueOrThrow({
        where: { id: entryId },
      });
      expect(cooked.status).toBe("COOKED");
    });

    it("does not mark the entry Cooked when the session ends early", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(userId!, "RECIPE", content());
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        },
      );
      const session = await mealPlanService.startSessionFromEntry(
        userId!,
        mealPlanId,
        entryId,
      );

      await cookingService.endCookingSession(
        userId!,
        session.id,
        "ENDED_EARLY",
      );

      const entry = await prisma.mealPlanEntry.findUniqueOrThrow({
        where: { id: entryId },
      });
      expect(entry.status).toBe("IN_PROGRESS");
    });
  });

  describe("deleteMealPlan (round-3 Correction 2)", () => {
    it("converts an active linked list to STANDALONE before deleting the plan", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Basil", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      const listId = await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        { title: "Shopping" },
      );

      await mealPlanService.deleteMealPlan(userId!, mealPlanId);

      const list = await prisma.groceryList.findUniqueOrThrow({
        where: { id: listId },
      });
      expect(list.mode).toBe("STANDALONE");
      expect(list.linkedMealPlanId).toBeNull();
      await expect(
        prisma.mealPlan.findUniqueOrThrow({ where: { id: mealPlanId } }),
      ).rejects.toThrow();
    });

    it("fails loudly with a foreign-key violation if the plan is deleted before its lists are converted", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishId = await dishService.createDish(
        userId!,
        "RECIPE",
        content({
          sections: [
            {
              name: null,
              guidanceNote: null,
              position: 0,
              ingredients: [
                ingredient({ name: "Basil", quantity: 1, unit: null }),
              ],
              instructions: [],
              partLinks: [],
            },
          ],
        }),
      );
      await mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
        dishId,
        cookDate: new Date("2026-08-03T00:00:00.000Z"),
      });
      await mealPlanService.generateGroceryListFromMealPlan(
        userId!,
        mealPlanId,
        {
          title: "Shopping",
        },
      );

      // Deliberately reordered — delete the MealPlan row directly without
      // first converting its linked GroceryList's mode.
      await expect(
        prisma.mealPlan.delete({ where: { id: mealPlanId } }),
      ).rejects.toThrow();
    });
  });

  describe("authorization", () => {
    it("rejects cross-owner access to a Meal Plan", async () => {
      const { mealPlanId } = await setupMealPlan();
      const other = await createTestUser();
      otherUserId = other.id;
      await initializeNewUser(otherUserId);

      await expect(
        getOwnedMealPlanOrThrow(otherUserId, mealPlanId),
      ).rejects.toThrow(NotFoundError);
      await expect(
        mealPlanService.deleteMealPlan(otherUserId, mealPlanId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("saveMealPlanEntryChanges (F10 bulk save)", () => {
    it("applies a remove, a replace, an update, a Version-adoption, and a new entry from one batch call", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const dishB = await dishService.createDish(
        userId!,
        "RECIPE",
        content({ title: "Second Recipe" }),
      );
      const dishC = await dishService.createDish(
        userId!,
        "RECIPE",
        content({ title: "Third Recipe" }),
      );

      const removedEntryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: dishA, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );
      const replacedEntryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: dishA, cookDate: new Date("2026-08-04T00:00:00.000Z") },
      );
      const updatedEntryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: dishA, cookDate: new Date("2026-08-05T00:00:00.000Z") },
      );
      const versionAdoptedEntryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: dishC, cookDate: new Date("2026-08-06T00:00:00.000Z") },
      );
      // A newer minor Version on the same major line, for the
      // version-adoption entry to pick up.
      await dishService.editDish(
        userId!,
        dishC,
        await currentVersionId(dishC),
        content({ title: "Third Recipe", description: "v1.1" }),
        "MINOR",
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [removedEntryId],
          replacedEntries: [
            {
              entryId: replacedEntryId,
              dishId: dishB,
              cookDate: new Date("2026-08-04T00:00:00.000Z"),
            },
          ],
          updatedEntries: [
            {
              entryId: updatedEntryId,
              note: "Updated note",
            },
          ],
          versionAdoptedEntryIds: [versionAdoptedEntryId],
          newEntries: [
            { dishId: dishB, cookDate: new Date("2026-08-07T00:00:00.000Z") },
          ],
        },
      );

      expect(result.hadEntryError).toBe(false);

      const entries = await prisma.mealPlanEntry.findMany({
        where: { mealPlanId },
      });
      // Removed entry, and the replaced entry's original row, both gone;
      // the updated, Version-adopted, replacement, and new-draft entries
      // all present — four entries total, not five or six.
      expect(entries).toHaveLength(4);
      expect(entries.find((e) => e.id === removedEntryId)).toBeUndefined();
      expect(entries.find((e) => e.id === replacedEntryId)).toBeUndefined();

      const updated = entries.find((e) => e.id === updatedEntryId);
      expect(updated?.dishId).toBe(dishA);
      expect(updated?.note).toBe("Updated note");

      const replacement = entries.find(
        (e) => e.dishId === dishB && e.id !== updatedEntryId,
      );
      const replacementEntries = entries.filter((e) => e.dishId === dishB);
      expect(replacementEntries).toHaveLength(2); // the replace, and the new draft
      expect(replacement).toBeDefined();

      // The Version-adoption entry keeps its own id but moves off the
      // Version it was pinned to at add time, onto the newer minor.
      const adopted = entries.find((e) => e.id === versionAdoptedEntryId);
      expect(adopted?.dishVersionId).toBe(await currentVersionId(dishC));
    });

    it("keeps one category's failure from blocking the rest of the batch", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const keptEntryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: dishA, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: ["does-not-exist"],
          replacedEntries: [],
          updatedEntries: [{ entryId: keptEntryId, note: "Still applied" }],
          versionAdoptedEntryIds: [],
          newEntries: [],
        },
      );

      expect(result.hadEntryError).toBe(true);
      const kept = await prisma.mealPlanEntry.findUniqueOrThrow({
        where: { id: keptEntryId },
      });
      expect(kept.note).toBe("Still applied");
    });

    it("skips a queued Version-adoption for an entry that was also removed in the same batch", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        { dishId: dishA, cookDate: new Date("2026-08-03T00:00:00.000Z") },
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [entryId],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [entryId],
          newEntries: [],
        },
      );

      expect(result.hadEntryError).toBe(false);
      const entry = await prisma.mealPlanEntry.findUnique({
        where: { id: entryId },
      });
      expect(entry).toBeNull();
    });
  });

  describe("Schedule assignments (Schedule-section redesign, §77.1/§77.2)", () => {
    it("replaces a Meal's complete schedule, discarding whatever it had before", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId: dishA,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 6,
        },
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: [],
          scheduleAssignments: [
            {
              mealKey: entryId,
              meals: [
                {
                  label: "Sunday dinner",
                  date: new Date("2026-08-03T00:00:00.000Z"),
                  servings: 2,
                },
                {
                  label: "Monday lunch",
                  date: new Date("2026-08-04T00:00:00.000Z"),
                  servings: 2,
                },
              ],
            },
          ],
        },
      );
      expect(result.hadEntryError).toBe(false);
      expect(
        await prisma.plannedMeal.findMany({ where: { entryId } }),
      ).toHaveLength(2);

      // A second assignment for the same Meal replaces, not appends.
      const result2 = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: [],
          scheduleAssignments: [
            {
              mealKey: entryId,
              meals: [
                {
                  label: "Tuesday lunch",
                  date: new Date("2026-08-05T00:00:00.000Z"),
                  servings: 1,
                },
              ],
            },
          ],
        },
      );
      expect(result2.hadEntryError).toBe(false);
      const mealsAfter = await prisma.plannedMeal.findMany({
        where: { entryId },
      });
      expect(mealsAfter).toHaveLength(1);
      expect(mealsAfter[0]?.label).toBe("Tuesday lunch");
    });

    it("rejects a scheduled date outside the Meal Plan's own range", async () => {
      const { mealPlanId } = await setupMealPlan(); // 2026-08-03..2026-08-09
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId: dishA,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 6,
        },
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: [],
          scheduleAssignments: [
            {
              mealKey: entryId,
              meals: [
                {
                  label: "Too late",
                  date: new Date("2026-08-15T00:00:00.000Z"),
                  servings: 1,
                },
              ],
            },
          ],
        },
      );

      expect(result.hadEntryError).toBe(true);
      expect(
        await prisma.plannedMeal.findMany({ where: { entryId } }),
      ).toHaveLength(0);
    });

    it("rejects total scheduled servings exceeding the Meal's target yield, atomically", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId: dishA,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 6,
        },
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: [],
          scheduleAssignments: [
            {
              mealKey: entryId,
              meals: [
                {
                  label: "A",
                  date: new Date("2026-08-03T00:00:00.000Z"),
                  servings: 4,
                },
                {
                  label: "B",
                  date: new Date("2026-08-04T00:00:00.000Z"),
                  servings: 3,
                },
              ],
            },
          ],
        },
      );

      expect(result.hadEntryError).toBe(true);
      // Rejected before the transaction runs — neither row was created.
      expect(
        await prisma.plannedMeal.findMany({ where: { entryId } }),
      ).toHaveLength(0);
    });

    it("resolves a new entry's localKey to its created entryId within the same batch", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [],
          replacedEntries: [],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: [
            {
              dishId: dishA,
              cookDate: new Date("2026-08-03T00:00:00.000Z"),
              targetYieldQuantity: 4,
              localKey: "draft-1",
            },
          ],
          scheduleAssignments: [
            {
              mealKey: "draft-1",
              meals: [
                {
                  label: "Sunday dinner",
                  date: new Date("2026-08-03T00:00:00.000Z"),
                  servings: 2,
                },
              ],
            },
          ],
        },
      );

      expect(result.hadEntryError).toBe(false);
      const entry = await prisma.mealPlanEntry.findFirstOrThrow({
        where: { mealPlanId, dishId: dishA },
      });
      const meals = await prisma.plannedMeal.findMany({
        where: { entryId: entry.id },
      });
      expect(meals).toHaveLength(1);
      expect(meals[0]?.label).toBe("Sunday dinner");
    });

    it("redirects a replaced entry's schedule (keyed by its old entryId) onto the row created in its place", async () => {
      const { mealPlanId } = await setupMealPlan();
      const dishA = await dishService.createDish(userId!, "RECIPE", content());
      const dishB = await dishService.createDish(
        userId!,
        "RECIPE",
        content({ title: "Second Recipe" }),
      );
      const entryId = await mealPlanService.addMealPlanEntry(
        userId!,
        mealPlanId,
        {
          dishId: dishA,
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
          targetYieldQuantity: 4,
        },
      );

      const result = await mealPlanService.saveMealPlanEntryChanges(
        userId!,
        mealPlanId,
        {
          removedEntryIds: [],
          replacedEntries: [
            {
              entryId,
              dishId: dishB,
              cookDate: new Date("2026-08-03T00:00:00.000Z"),
              targetYieldQuantity: 4,
            },
          ],
          updatedEntries: [],
          versionAdoptedEntryIds: [],
          newEntries: [],
          scheduleAssignments: [
            {
              mealKey: entryId,
              meals: [
                {
                  label: "Sunday dinner",
                  date: new Date("2026-08-03T00:00:00.000Z"),
                  servings: 2,
                },
              ],
            },
          ],
        },
      );

      expect(result.hadEntryError).toBe(false);
      const newEntry = await prisma.mealPlanEntry.findFirstOrThrow({
        where: { mealPlanId, dishId: dishB },
      });
      const meals = await prisma.plannedMeal.findMany({
        where: { entryId: newEntry.id },
      });
      expect(meals).toHaveLength(1);
      expect(meals[0]?.label).toBe("Sunday dinner");
    });
  });

  describe("transaction safety", () => {
    it("leaves no partial entry when the source Dish is not owned", async () => {
      const { mealPlanId } = await setupMealPlan();
      await expect(
        mealPlanService.addMealPlanEntry(userId!, mealPlanId, {
          dishId: "does-not-exist",
          cookDate: new Date("2026-08-03T00:00:00.000Z"),
        }),
      ).rejects.toThrow(NotFoundError);

      const entries = await prisma.mealPlanEntry.findMany({
        where: { mealPlanId },
      });
      expect(entries).toHaveLength(0);
    });

    it("rejects an end date before the start date", async () => {
      const user = await createTestUser();
      userId = user.id;
      await initializeNewUser(userId);
      await expect(
        mealPlanService.createMealPlan(userId, {
          title: "Bad range",
          startDate: new Date("2026-08-10T00:00:00.000Z"),
          endDate: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ).rejects.toThrow(ValidationError);
    });
  });
});
