import { z } from "zod";

// PRODUCT_SPEC.md §46: user-created, renamed, reordered, deleted values —
// same shape/limit as Tag/Taster/Flavor profile names.
export const cuisineNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(60, "Name is too long.");

export const createCuisineSchema = z.object({
  name: cuisineNameSchema,
});

export const renameCuisineSchema = z.object({
  id: z.string().min(1),
  name: cuisineNameSchema,
});

export const cuisineIdSchema = z.object({
  id: z.string().min(1),
});

export const reorderCuisinesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

export type CuisineDto = {
  id: string;
  displayName: string;
  position: number;
};

export type CreateCuisineActionState = ActionState & {
  cuisine?: CuisineDto;
};

export const initialCreateCuisineActionState: CreateCuisineActionState = {
  status: "idle",
};
