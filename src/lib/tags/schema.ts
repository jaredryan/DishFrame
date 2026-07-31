import { z } from "zod";

// PRODUCT_SPEC.md §45.4: case-insensitive identity, trimmed, ordinary
// punctuation/spaces allowed, no arbitrary per-item length limit — 60 chars
// is a sane upper bound for a tag label, not a product restriction.
export const tagNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a tag name.")
  .max(60, "Tag name is too long.");

export const createTagSchema = z.object({ name: tagNameSchema });

export const renameTagSchema = z.object({
  id: z.string().min(1),
  name: tagNameSchema,
});

export const tagIdSchema = z.object({ id: z.string().min(1) });

export type ActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const initialActionState: ActionState = { status: "idle" };

export type TagDto = {
  id: string;
  displayName: string;
  isFavorite: boolean;
  dishCount: number;
};

export type CreateTagActionState = ActionState & { tag?: TagDto };
export const initialCreateTagActionState: CreateTagActionState = {
  status: "idle",
};

// PRODUCT_SPEC.md §45.6: renaming to an existing tag merges the source into
// that destination — the manager UI needs to know when that happened (to
// show "Merged into X" instead of "Renamed") and how many Dishes moved.
export type RenameTagActionState = ActionState & {
  merged?: { destinationId: string; destinationName: string };
};
export const initialRenameTagActionState: RenameTagActionState = {
  status: "idle",
};
