import { z } from "zod";

// PRODUCT_SPEC.md §79.3: user-created, renamed, reordered, deleted values —
// same shape/limit as Tag/Taster names.
export const flavorProfileNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(60, "Name is too long.");

export const createFlavorProfileSchema = z.object({
  name: flavorProfileNameSchema,
});

export const renameFlavorProfileSchema = z.object({
  id: z.string().min(1),
  name: flavorProfileNameSchema,
});

export const flavorProfileIdSchema = z.object({
  id: z.string().min(1),
});

export const reorderFlavorProfilesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

export type FlavorProfileDto = {
  id: string;
  displayName: string;
  position: number;
};

export type CreateFlavorProfileActionState = ActionState & {
  flavorProfile?: FlavorProfileDto;
};

export const initialCreateFlavorProfileActionState: CreateFlavorProfileActionState =
  { status: "idle" };
