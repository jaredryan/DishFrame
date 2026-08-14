import { z } from "zod";

/**
 * Slice 9 — Session Review + Rating (ARCHITECTURE_PROPOSAL.md §D.8, §K.3).
 * Client-supplied ratings carry only a tasterId and a whole-star value —
 * everything else (dishId/dishVersionId/session ownership) is re-derived
 * server-side (PRODUCT_SPEC.md §35.1's "1-5 whole stars").
 */

export const ratingValueSchema = z.number().int().min(1).max(5);

export const reviewRatingInputSchema = z.object({
  tasterId: z.string().min(1),
  value: ratingValueSchema,
});

export const saveSessionReviewSchema = z.object({
  sessionId: z.string().min(1),
  whatWentWell: z.string().trim().max(4000).nullable(),
  whatDidNotGoWell: z.string().trim().max(4000).nullable(),
  anythingElse: z.string().trim().max(4000).nullable(),
  actualAmountQuantity: z.number().positive().nullable(),
  actualAmountUnit: z.string().trim().max(60).nullable(),
  reviewAdjustedDurationSeconds: z.number().int().min(0).nullable(),
  ratings: z.array(reviewRatingInputSchema),
  // Post-cook review redesign — the reviewer's own final "This session
  // included" selection (real checkboxes, not the session's own completion
  // state). Re-validated server-side against the session's own active units.
  includedUnitIds: z.array(z.string()),
});
export type SaveSessionReviewInput = z.infer<typeof saveSessionReviewSchema>;

export const deleteSessionReviewSchema = z.object({
  sessionId: z.string().min(1),
});

export const updateCookingNotesSchema = z.object({
  sessionId: z.string().min(1),
  cookingNotes: z.string().trim().max(4000).nullable(),
});

export type ActionState =
  | { status: "success"; message?: string }
  | { status: "error"; message: string };
