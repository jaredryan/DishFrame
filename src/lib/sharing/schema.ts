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

export const directShareIdSchema = z.object({
  directShareId: z.string().min(1),
});

// ============================================================================
// Send-unification pass: one canonical Send flow for any mix of Recipes and
// Parts, to an existing DishFrame account or a not-yet-registered email
// alike. The sender is never shown whether the entered email belongs to an
// existing account.
// ============================================================================

// PRODUCT_SPEC.md's "reasonable server-enforced batch maximum, preferably
// 50 items" — enforced here (schema) and again defensively in
// `sharing/collections.ts` (never only client-side).
export const DIRECT_SHARE_MAX_ITEMS = 50;

export const directShareRecipientHistorySchema = z.object({
  recipientEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
});

const recipientEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

const directShareItemsSchema = z
  .array(
    z.object({
      dishId: z.string().min(1),
      dishVersionId: z.string().min(1),
    }),
  )
  .min(1, "Select at least one item.")
  .max(
    DIRECT_SHARE_MAX_ITEMS,
    `You can send at most ${DIRECT_SHARE_MAX_ITEMS} items at once.`,
  );

const directShareNoteSchema = z.string().trim().max(1000).nullable().optional();

// Toast/Send/Publish QA batch item 4: a Send now addresses one or many
// recipients — every recipient still goes through the exact same
// per-recipient `sendDirectShareCollection` service call (looped at the
// action layer, see `actions.ts`), so ownership/dedup/claim behavior is
// unchanged per recipient. Deduped here (after normalization) so an
// accidental double-paste never becomes two collections to the same email.
export const sendDirectShareCollectionSchema = z.object({
  recipientEmails: z
    .array(recipientEmailSchema)
    .min(1, "Add at least one recipient.")
    .transform((emails) => [...new Set(emails)]),
  // Each selected item carries its own explicit Version choice (design
  // pass) — never one Version applied across the whole batch.
  items: directShareItemsSchema,
  note: directShareNoteSchema,
});
export type SendDirectShareCollectionInput = z.infer<
  typeof sendDirectShareCollectionSchema
>;

/** The per-recipient shape `sharing/collections.ts#sendDirectShareCollection`
 * (unchanged, one recipient per call) actually consumes — `actions.ts` loops
 * `SendDirectShareCollectionInput.recipientEmails` and calls the service once
 * per recipient with this shape. */
export type SendOneDirectShareCollectionInput = {
  recipientEmail: string;
  items: z.infer<typeof directShareItemsSchema>;
  note?: string | null;
};

// ============================================================================
// `/share` generalized bulk Publish: one shared settings payload, applied to
// several selected Recipes/Parts to create one independent public ShareLink
// per item (never a new collection-link concept — reuses `createShareLink`
// per item, same as the contextual single-item Publish action).
// ============================================================================

export const PUBLISH_MAX_ITEMS = 50;

export const publishDishesSchema = z.object({
  dishIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one item.")
    .max(
      PUBLISH_MAX_ITEMS,
      `You can publish at most ${PUBLISH_MAX_ITEMS} items at once.`,
    ),
  mode: z.enum(shareLinkModeValues).default("FIXED_SNAPSHOT"),
  // Per-item explicit Version choice for FIXED_SNAPSHOT only — ignored
  // under CURRENT mode, which keeps tracking each item's own latest
  // Version exactly as before (no picker needed there).
  versionIdByDishId: z.record(z.string(), z.string().min(1)).optional(),
  showCreatorName: z.boolean().default(false),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type PublishDishesInput = z.infer<typeof publishDishesSchema>;

export const directShareCollectionIdSchema = z.object({
  collectionId: z.string().min(1),
});

export const finalizeDirectShareCollectionSchema = z.object({
  collectionId: z.string().min(1),
  // The exact set of pending child DirectShare ids to accept; every other
  // still-pending child in the collection is declined as part of this same
  // action (PRODUCT_SPEC.md: "unselected items are declined as part of
  // the explicit final action"). An empty array is a valid "Decline all".
  acceptedShareIds: z.array(z.string().min(1)),
});
export type FinalizeDirectShareCollectionInput = z.infer<
  typeof finalizeDirectShareCollectionSchema
>;
