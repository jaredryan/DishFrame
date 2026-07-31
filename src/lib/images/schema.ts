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

/**
 * Slice 6A: image normalization limits/quality — centralized here so
 * `processing.ts` (the actual sharp pipeline) and any caller that needs to
 * describe the behavior (tests, error messages) share one source rather
 * than scattering magic numbers.
 */
// Longest edge, in pixels, an uploaded image is resized down to (never up —
// see `processing.ts`'s `withoutEnlargement`). A generous ceiling for food
// photography that still meaningfully caps storage/bandwidth.
export const MAX_IMAGE_DIMENSION_PX = 2400;
// sharp's 0-100 WebP quality scale — a reasonable visual-quality default,
// not a canonical spec figure.
export const IMAGE_WEBP_QUALITY = 82;
