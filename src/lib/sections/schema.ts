import { z } from "zod";
import { dishKindValues } from "@/lib/dishes/schema";

// Slice 6, PRODUCT_SPEC.md §68.1: the attach-time validation call — a
// lightweight, single-target check (ARCHITECTURE_PROPOSAL.md §G.4) run
// before the editor's form state even gains the new occurrence.
// `containerDishId: null` covers a brand-new, not-yet-saved Recipe/Part —
// nothing can already be reachable from an item that doesn't have a stable
// id yet, so the cycle check is simply skipped in that case.
export const validatePartAttachmentSchema = z.object({
  containerDishId: z.string().min(1).nullable(),
  containerKind: z.enum(dishKindValues),
  targetDishId: z.string().min(1),
  // Absent = the target Part's current Version (§68.1's default).
  targetDishVersionId: z.string().min(1).optional(),
});

// §70.1: resolves one linked Part Version's own shallow content so the
// editor can inline it as local content and drop the live link.
export const resolvePartVersionForDetachSchema = z.object({
  targetDishVersionId: z.string().min(1),
});

// §69.2 "Save as reusable Part" (create and link) / §69.3 "Save a copy as
// Part" share the same shape: extract one whole Section's content into a
// brand-new Part.
export const createPartFromSectionSchema = z.object({
  containerDishId: z.string().min(1),
  containerKind: z.enum(dishKindValues),
  baseVersionId: z.string().min(1),
  sectionLineageId: z.string().min(1),
  partTitle: z.string().trim().min(1, "Enter a name for the reusable Part."),
});
