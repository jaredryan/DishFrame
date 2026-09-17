import { describe, expect, it } from "vitest";
import {
  computeMealPlanResyncPlan,
  computeReconciliationManualDeletions,
  recomputeMealPlanItemAggregate,
  type MealPlanResyncInput,
  type ResyncContributionSnapshot,
} from "@/lib/grocery/mealplan-resync-core";
import type { ResolvedIngredientOccurrence } from "@/lib/grocery/ingredient-gather-core";

function occurrence(
  overrides: Partial<ResolvedIngredientOccurrence> = {},
): ResolvedIngredientOccurrence {
  return {
    ingredientLineageId: "ing-1",
    originalName: "Flour",
    quantity: 2,
    quantityEnd: null,
    isApproximate: false,
    unit: "cup",
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
    ...overrides,
  };
}

function contribution(
  overrides: Partial<ResyncContributionSnapshot> = {},
): ResyncContributionSnapshot {
  return {
    id: "c1",
    groceryListItemId: "item-1",
    mealPlanEntryId: "entry-1",
    ingredientLineageId: "ing-1",
    originalName: "Flour",
    quantityDecimal: 2,
    // Matches the module's own convention (unit stored separately, not
    // folded into quantityText) — see computeMealPlanResyncPlan's
    // `toQuantityText` derivation, which never appends the unit.
    quantityText: "2",
    unit: "cup",
    isOptional: false,
    selectedVariant: "PRIMARY",
    substituteName: null,
    substituteQuantityDecimal: null,
    substituteQuantityText: null,
    substituteUnit: null,
    state: "ACTIVE",
    acknowledgedAt: null,
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<MealPlanResyncInput> = {},
): MealPlanResyncInput {
  return {
    fresh: [],
    excludedEntryIds: new Set(),
    existingContributions: [],
    candidateItems: [],
    tombstones: [],
    categoryByNormalizedName: new Map(),
    fallbackCategoryId: "fallback",
    ...overrides,
  };
}

describe("computeMealPlanResyncPlan", () => {
  it("adds a brand-new occurrence as a new item", () => {
    const plan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [{ mealPlanEntryId: "entry-1", occurrence: occurrence() }],
      }),
    );
    expect(plan.summary).toEqual({ added: 1, removed: 0, changed: 0 });
    expect(plan.newItems).toHaveLength(1);
    expect(plan.newItems[0].contribution.originalName).toBe("Flour");
  });

  it("flags a disappeared contribution REMOVED instead of deleting it", () => {
    const existing = contribution();
    const plan = computeMealPlanResyncPlan(
      baseInput({ existingContributions: [existing] }),
    );
    expect(plan.summary).toEqual({ added: 0, removed: 1, changed: 0 });
    expect(plan.removedContributionIds).toEqual([existing.id]);
  });

  it("classifies a quantity change as CHANGED, and a no-op refresh as ACTIVE with no summary bump", () => {
    const existing = contribution();
    const changedPlan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [
          {
            mealPlanEntryId: "entry-1",
            occurrence: occurrence({ quantity: 5 }),
          },
        ],
        existingContributions: [existing],
      }),
    );
    expect(changedPlan.summary.changed).toBe(1);
    expect(changedPlan.updatedContributions[0].nextState).toBe("CHANGED");

    const samePlan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [{ mealPlanEntryId: "entry-1", occurrence: occurrence() }],
        existingContributions: [existing],
      }),
    );
    expect(samePlan.summary.changed).toBe(0);
    expect(samePlan.updatedContributions[0].nextState).toBe("ACTIVE");
  });

  it("keeps a sticky unacknowledged CHANGED contribution CHANGED even once its fresh value matches what's stored", () => {
    const sticky = contribution({ state: "CHANGED", acknowledgedAt: null });
    const plan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [{ mealPlanEntryId: "entry-1", occurrence: occurrence() }],
        existingContributions: [sticky],
      }),
    );
    expect(plan.updatedContributions[0].nextState).toBe("CHANGED");
    expect(plan.updatedContributions[0].resetPreviousSnapshot).toBe(false);
    expect(plan.summary.changed).toBe(0);
  });

  it("never revives a manually removed contribution merely because its source still produces it", () => {
    const plan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [{ mealPlanEntryId: "entry-1", occurrence: occurrence() }],
        tombstones: [
          {
            id: "t1",
            mealPlanEntryId: "entry-1",
            ingredientLineageId: "ing-1",
            wasOptional: false,
          },
        ],
      }),
    );
    expect(plan.newItems).toHaveLength(0);
    expect(plan.addedContributionsToExistingItems).toHaveLength(0);
    expect(plan.summary.added).toBe(0);
  });

  it("revives a tombstone once its lineage transitions from optional to required (§81.4)", () => {
    const plan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [
          {
            mealPlanEntryId: "entry-1",
            occurrence: occurrence({ isOptional: false }),
          },
        ],
        tombstones: [
          {
            id: "t1",
            mealPlanEntryId: "entry-1",
            ingredientLineageId: "ing-1",
            wasOptional: true,
          },
        ],
      }),
    );
    expect(plan.revivedTombstoneIds).toEqual(["t1"]);
    expect(plan.summary.added).toBe(1);
  });

  it("folds a second added occurrence into the new item the same resync just created", () => {
    const plan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [
          { mealPlanEntryId: "entry-1", occurrence: occurrence() },
          { mealPlanEntryId: "entry-2", occurrence: occurrence() },
        ],
      }),
    );
    expect(plan.newItems).toHaveLength(1);
    expect(plan.addedContributionsToExistingItems).toHaveLength(1);
    expect(plan.addedContributionsToExistingItems[0].groceryListItemId).toBe(
      plan.newItems[0].placeholderItemId,
    );
  });

  it("excludes a Meal Plan entry the list has toggled off, treating it like it disappeared", () => {
    const existing = contribution();
    const plan = computeMealPlanResyncPlan(
      baseInput({
        fresh: [{ mealPlanEntryId: "entry-1", occurrence: occurrence() }],
        existingContributions: [existing],
        excludedEntryIds: new Set(["entry-1"]),
      }),
    );
    expect(plan.removedContributionIds).toEqual([existing.id]);
  });
});

describe("computeReconciliationManualDeletions", () => {
  it("surfaces a tombstone whose lineage still produces a fresh occurrence", () => {
    const result = computeReconciliationManualDeletions(
      [{ mealPlanEntryId: "entry-1", occurrence: occurrence() }],
      new Set(),
      [
        {
          id: "t1",
          mealPlanEntryId: "entry-1",
          ingredientLineageId: "ing-1",
          wasOptional: false,
        },
      ],
    );
    expect(result).toEqual([{ id: "t1", name: "Flour" }]);
  });

  it("excludes a tombstone whose lineage has since become required", () => {
    const result = computeReconciliationManualDeletions(
      [
        {
          mealPlanEntryId: "entry-1",
          occurrence: occurrence({ isOptional: false }),
        },
      ],
      new Set(),
      [
        {
          id: "t1",
          mealPlanEntryId: "entry-1",
          ingredientLineageId: "ing-1",
          wasOptional: true,
        },
      ],
    );
    expect(result).toEqual([]);
  });
});

describe("recomputeMealPlanItemAggregate", () => {
  it("returns null for an item with no contributions", () => {
    expect(recomputeMealPlanItemAggregate([])).toBeNull();
  });

  it("flags an item REMOVED once every contribution behind it disappeared", () => {
    const result = recomputeMealPlanItemAggregate([
      contribution({ state: "REMOVED" }),
    ]);
    expect(result).toEqual({ kind: "removed" });
  });

  it("combines two combinable live contributions into one aggregate", () => {
    const result = recomputeMealPlanItemAggregate([
      contribution({ id: "a", quantityDecimal: 2, quantityText: "2 cup" }),
      contribution({ id: "b", quantityDecimal: 1, quantityText: "1 cup" }),
    ]);
    expect(result?.kind).toBe("updated");
    if (result?.kind === "updated") {
      expect(result.quantityDecimal).toBe(3);
      expect(result.syncFlag).toBe("UNCHANGED");
    }
  });
});
