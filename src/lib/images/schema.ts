import { z } from "zod";

/**
 * PRODUCT_SPEC.md §12 / ARCHITECTURE_PROPOSAL.md §M: server-side MIME-type
 * and size validation before ever issuing an upload token — never trusted
 * from the client alone. A concrete, reasonably generous set/limit for
 * ordinary food photography; not spec-mandated exact figures, so flagged
 * in the Slice 5 report as a chosen default rather than a canonical
 * requirement.
 */
export const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedImageContentType =
  (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

export const requestImageUploadSchema = z.object({
  // Absent/null when uploading during "New recipe/part" creation, before
  // any Dish row exists to check ownership against (Slice 5 — the editor
  // reuses one component for both create and edit, and `createDish` itself
  // accepts an already-uploaded `imageAssetId`). Present for every upload
  // from an existing Dish's edit flow, and checked against real ownership
  // in that case.
  dishId: z.string().min(1).nullable().optional(),
  fileName: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_IMAGE_CONTENT_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_IMAGE_BYTES, "Image is too large."),
});
export type RequestImageUploadInput = z.infer<typeof requestImageUploadSchema>;
