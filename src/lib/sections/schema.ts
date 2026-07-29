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
// editor can inline it as local content and drop the live link. Slice 6
// post-gate: `multiplier` is the detached occurrence's own current
// multiplier (default 1), applied to the resolved quantities so localized
// content preserves the parent's actual cooking meaning.
export const resolvePartVersionForDetachSchema = z.object({
  targetDishVersionId: z.string().min(1),
  multiplier: z.number().gt(0).default(1),
});
