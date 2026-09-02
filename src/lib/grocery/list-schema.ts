import { z } from "zod";

// PRODUCT_SPEC.md §60-64 — standalone Grocery List generation/management.

export const listIdSchema = z.object({ listId: z.string().min(1) });
export const itemIdSchema = listIdSchema.extend({ itemId: z.string().min(1) });

const positiveScaleFactor = z
  .number()
  .gt(0, "That amount must be greater than zero.")
  .lte(1000, "That amount is too large.");

export const generateGroceryListSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title for this grocery list.")
    .max(120),
  plannedDate: z.coerce.date(),
  sources: z
    .array(
      z.object({
        dishId: z.string().min(1),
        dishVersionId: z.string().min(1).optional(),
        scaleFactor: positiveScaleFactor,
      }),
    )
    .min(1, "Select at least one Recipe or Part."),
});

export const updateGroceryListDetailsSchema = listIdSchema.extend({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title for this grocery list.")
    .max(120),
  plannedDate: z.coerce.date(),
  isActive: z.boolean(),
});

export const addManualGroceryItemSchema = listIdSchema.extend({
  name: z.string().trim().min(1, "Enter an item name.").max(200),
  quantityText: z.string().trim().max(60).nullable().optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

export const editGroceryItemSchema = itemIdSchema.extend({
  name: z.string().trim().min(1).max(200).optional(),
  quantityText: z.string().trim().max(60).nullable().optional(),
  unit: z.string().trim().max(30).nullable().optional(),
});

export const recategorizeGroceryItemSchema = itemIdSchema.extend({
  categoryId: z.string().min(1),
});

export const reorderGroceryListItemsSchema = listIdSchema.extend({
  orderedItemIds: z.array(z.string().min(1)).min(1),
});

export const refreshSourceSchema = listIdSchema.extend({
  sourceId: z.string().min(1),
  targetVersionId: z.string().min(1).optional(),
});

export const addGroceryListSourceSchema = listIdSchema.extend({
  dishId: z.string().min(1),
  dishVersionId: z.string().min(1).optional(),
  scaleFactor: positiveScaleFactor,
});

export const removeGroceryListSourceSchema = listIdSchema.extend({
  sourceId: z.string().min(1),
});

export const updateGroceryListSourceSchema = listIdSchema.extend({
  sourceId: z.string().min(1),
  targetVersionId: z.string().min(1),
  scaleFactor: positiveScaleFactor,
});

export const listSourceVersionOptionsSchema = z.object({
  dishId: z.string().min(1),
});

export const selectGroceryItemVariantSchema = itemIdSchema.extend({
  variant: z.enum(["PRIMARY", "SUBSTITUTE"]),
});

// Slice 15 — acknowledging a Meal-Plan-sync `CHANGED`/`REMOVED` flag.
export const acknowledgeGroceryItemSyncSchema = itemIdSchema;

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};
export const initialActionState: ActionState = { status: "idle" };

export type GroceryCategoryOptionDto = {
  id: string;
  displayName: string;
  isFallback: boolean;
};

export type GroceryContributionDto = {
  id: string;
  groceryListSourceId: string | null;
  originalName: string;
  quantityText: string | null;
  /** Raw numeric quantity backing `quantityText`, in `unit` — lets the
   * client re-sum a combined item's total locally (§81.7 optimistic UI)
   * using the same pure `combine.ts` grouping the server uses, rather than
   * re-parsing the formatted display text. */
  quantityDecimal: number | null;
  unit: string | null;
  isOptional: boolean;
  /** Has a persisted substitute snapshot to select (Slice 12 correction). */
  hasSubstitute: boolean;
  /** Which frozen snapshot is currently effective — reversible in either
   * direction (Slice 12 correction 2). */
  selectedVariant: "PRIMARY" | "SUBSTITUTE";
  /** Slice 15 — this occurrence's Meal-Plan sync state, present only on a
   * `MEAL_PLAN_LINKED` list's contributions. */
  syncState: "ACTIVE" | "CHANGED" | "REMOVED" | null;
  previousQuantityText: string | null;
  /** The contributing Recipe/Part's snapshot title (from the owning
   * `GroceryListSource` or `MealPlanEntry`) — null only for legacy/mixed
   * data with neither snapshot available. */
  sourceTitle: string | null;
  /** The owning Meal Plan entry, present only on a `MEAL_PLAN_LINKED`
   * list's contributions — lets the client locally recompute an item's
   * displayed aggregate the instant a Meal Plan entry's inclusion checkbox
   * is toggled, without waiting on the server (§81.7 optimistic UI). */
  mealPlanEntryId: string | null;
};

export type GroceryListItemDto = {
  id: string;
  name: string;
  quantityText: string | null;
  unit: string | null;
  isOptional: boolean;
  isManual: boolean;
  checkedAt: string | null;
  position: number;
  category: GroceryCategoryOptionDto | null;
  contributions: GroceryContributionDto[];
  /** Slice 15 — set (non-`UNCHANGED`) only on a `MEAL_PLAN_LINKED` list
   * after a plan mutation materially changed or removed this item's
   * contributions (§81.4). */
  syncFlag: "UNCHANGED" | "CHANGED" | "REMOVED";
  flagAcknowledgedAt: string | null;
};

export type GroceryListSourceDto = {
  id: string;
  dishId: string | null;
  dishVersionId: string | null;
  scaleFactor: number;
  sourceDishTitleSnapshot: string;
  sourceDishKindSnapshot: "RECIPE" | "PART";
  sourceDishVersionLabelSnapshot: string;
  isDeleted: boolean;
};

/** §81.6 — one of the linked Meal Plan's own entries, shown in this list's
 * Meals section with a checkbox reflecting whether it currently contributes
 * to this particular list (a selection distinct from the Meal Plan's own
 * list of Meals — toggling here never adds/removes the actual entry). */
export type GroceryListMealPlanEntryDto = {
  id: string;
  dishKind: "RECIPE" | "PART";
  title: string;
  versionLabel: string;
  targetYieldQuantity: number | null;
  targetYieldUnit: string | null;
  included: boolean;
};

export type GroceryListDetailDto = {
  id: string;
  title: string;
  createdAt: string;
  plannedDate: string;
  completedAt: string | null;
  mode: "STANDALONE" | "MEAL_PLAN_LINKED";
  linkedMealPlanId: string | null;
  sources: GroceryListSourceDto[];
  items: GroceryListItemDto[];
  /** Populated only for a `MEAL_PLAN_LINKED` list. */
  mealPlanEntries: GroceryListMealPlanEntryDto[];
};
