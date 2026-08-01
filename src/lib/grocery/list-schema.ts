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
  sources: z
    .array(
      z.object({
        dishId: z.string().min(1),
        scaleFactor: positiveScaleFactor,
      }),
    )
    .min(1, "Select at least one Recipe or Part."),
});

export const renameGroceryListSchema = listIdSchema.extend({
  title: z
    .string()
    .trim()
    .min(1, "Enter a title for this grocery list.")
    .max(120),
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

export const combineGroceryItemsSchema = listIdSchema.extend({
  itemIds: z
    .array(z.string().min(1))
    .min(2, "Select at least two items to combine."),
});

export const refreshSourceSchema = listIdSchema.extend({
  sourceId: z.string().min(1),
  targetVersionId: z.string().min(1).optional(),
});

export const selectGroceryItemVariantSchema = itemIdSchema.extend({
  variant: z.enum(["PRIMARY", "SUBSTITUTE"]),
});

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
  unit: string | null;
  isOptional: boolean;
  /** Has a persisted substitute snapshot to select (Slice 12 correction). */
  hasSubstitute: boolean;
  /** Which frozen snapshot is currently effective — reversible in either
   * direction (Slice 12 correction 2). */
  selectedVariant: "PRIMARY" | "SUBSTITUTE";
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
};

export type GroceryListSourceDto = {
  id: string;
  dishId: string | null;
  sourceDishTitleSnapshot: string;
  sourceDishKindSnapshot: "RECIPE" | "PART";
  sourceDishVersionLabelSnapshot: string;
  isDeleted: boolean;
};

export type GroceryListDetailDto = {
  id: string;
  title: string;
  createdAt: string;
  completedAt: string | null;
  sources: GroceryListSourceDto[];
  items: GroceryListItemDto[];
};
