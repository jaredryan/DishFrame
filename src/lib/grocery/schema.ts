import { z } from "zod";

// PRODUCT_SPEC.md §63: user-owned, reorderable, no retailer taxonomy.
export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(60, "Category name is too long.");

export const createCategorySchema = z.object({ name: categoryNameSchema });

export const renameCategorySchema = z.object({
  id: z.string().min(1),
  name: categoryNameSchema,
});

export const categoryIdSchema = z.object({ id: z.string().min(1) });

export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

export type CategoryDto = {
  id: string;
  displayName: string;
  position: number;
  isFallback: boolean;
};

export type CreateCategoryActionState = ActionState & {
  category?: CategoryDto;
};

export const initialCreateCategoryActionState: CreateCategoryActionState = {
  status: "idle",
};
