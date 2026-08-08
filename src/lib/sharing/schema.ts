import { z } from "zod";

export const shareLinkModeValues = ["FIXED_SNAPSHOT", "CURRENT"] as const;
export type ShareLinkModeValue = (typeof shareLinkModeValues)[number];

export const directShareStatusValues = [
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELED",
] as const;
export type DirectShareStatusValue = (typeof directShareStatusValues)[number];

// PRODUCT_SPEC.md §83.3: "Share this Version" is the default mode.
export const createShareLinkSchema = z.object({
  dishId: z.string().min(1),
  mode: z.enum(shareLinkModeValues).default("FIXED_SNAPSHOT"),
  // FIXED_SNAPSHOT only — which Version to freeze; defaults to the item's
  // current Version when omitted (§83.3: "works for current or historical
  // Versions").
  versionId: z.string().min(1).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  showCreatorName: z.boolean().default(false),
});
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

export const shareLinkIdSchema = z.object({
  shareLinkId: z.string().min(1),
});

export const updateShareLinkSchema = z.object({
  shareLinkId: z.string().min(1),
  expiresAt: z.coerce.date().nullable().optional(),
  showCreatorName: z.boolean().optional(),
});
export type UpdateShareLinkInput = z.infer<typeof updateShareLinkSchema>;

export const saveSharedCopySchema = z.object({
  token: z.string().min(1),
});

// Slice 17: exact-email-only, per the recipient-lookup privacy boundary —
// never a partial/prefix query, which would let a
// sender enumerate accounts by typing a few characters at a time.
export const lookupDirectShareRecipientSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
});

export const sendDirectShareSchema = z.object({
  dishId: z.string().min(1),
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type SendDirectShareInput = z.infer<typeof sendDirectShareSchema>;

export const directShareIdSchema = z.object({
  directShareId: z.string().min(1),
});

// ============================================================================
// Slice 22: unified single-/multi-Recipe direct sharing.
// ============================================================================

// PRODUCT_SPEC.md's "reasonable server-enforced batch maximum, preferably
// 50 Recipes" — enforced here (schema) and again defensively in
// `sharing/collections.ts` (never only client-side).
export const DIRECT_SHARE_COLLECTION_MAX_RECIPES = 50;

export const sendDirectShareCollectionSchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
  dishIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one Recipe.")
    .max(
      DIRECT_SHARE_COLLECTION_MAX_RECIPES,
      `You can send at most ${DIRECT_SHARE_COLLECTION_MAX_RECIPES} Recipes at once.`,
    ),
  note: z.string().trim().max(1000).nullable().optional(),
});
export type SendDirectShareCollectionInput = z.infer<
  typeof sendDirectShareCollectionSchema
>;

export const directShareCollectionIdSchema = z.object({
  collectionId: z.string().min(1),
});

export const finalizeDirectShareCollectionSchema = z.object({
  collectionId: z.string().min(1),
  // The exact set of pending child DirectShare ids to accept; every other
  // still-pending child in the collection is declined as part of this same
  // action (PRODUCT_SPEC.md: "unselected Recipes are declined as part of
  // the explicit final action"). An empty array is a valid "Decline all".
  acceptedShareIds: z.array(z.string().min(1)),
});
export type FinalizeDirectShareCollectionInput = z.infer<
  typeof finalizeDirectShareCollectionSchema
>;
