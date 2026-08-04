import { z } from "zod";

export const shareLinkModeValues = ["FIXED_SNAPSHOT", "CURRENT"] as const;
export type ShareLinkModeValue = (typeof shareLinkModeValues)[number];

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
