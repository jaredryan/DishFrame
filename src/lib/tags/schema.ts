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
