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

    it("documents that a manually removed optional item may be re-added by a later resync if the plan still produces it (Slice 21A review item, not changed here)", async () => {
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

      // The entry that produces Cilantro is untouched — a plan mutation
      // elsewhere still triggers a resync of this same list, and the
      // "added" fold-in has no record that this occurrence was ever
      // deliberately removed, so it reappears. This mirrors
      // `applyGroceryListSourceRefresh`'s existing accepted behavior from
      // Slice 12 and is an explicit Slice 21A review item, not a defect.
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
      expect(afterResync.map((i) => i.name).sort()).toEqual([
        "Cilantro",
        "Salt",
      ]);
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
