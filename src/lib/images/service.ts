import "server-only";
import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import { normalizeImageBuffer } from "@/lib/images/processing";
import { MAX_IMAGE_BYTES } from "@/lib/images/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4),
 * matching `src/lib/tasters/service.ts`'s existing pattern.
 */

/** Strips any path segments and non-portable characters, keeping the
 * original name legible in the Blob dashboard/storageKey without trusting
 * it as a literal filesystem path. */
function sanitizeFileNameSegment(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

/** Every stored image is normalized to WebP (`processing.ts`) regardless
 * of the source format — the storage key's extension reflects that. */
function withWebpExtension(fileName: string): string {
  const sanitized = sanitizeFileNameSegment(fileName);
  const withoutExtension = sanitized.replace(/\.[^./]+$/, "");
  return `${withoutExtension || "photo"}.webp`;
}

export type UploadedImage = { imageAssetId: string };

/**
 * Slice 6A, ARCHITECTURE_PROPOSAL.md §L/§M (superseding the earlier
 * client-direct-to-Blob signed-URL pattern for image bytes specifically):
 * the image's bytes are received here, server-side, so they can be
 * validated and normalized (`processing.ts` — real-format sniffing,
 * orientation correction, max-dimension resize, WebP conversion, quality
 * compression) before ever reaching storage — a client-controlled upload
 * can no longer put arbitrary, unprocessed bytes into private Blob
 * storage. The route handler that calls this
 * (`src/app/api/images/upload/route.ts`) receives the raw multipart
 * request; this function does everything after that: ownership check,
 * size/format validation via processing, the actual Blob `put()`, and
 * reserving the `ImageAsset` row — mirroring `requestImageUploadUrl`'s old
 * ownership/scoping rules exactly, just with the upload itself now
 * happening on this side of the wire instead of issuing a client token for
 * the browser to upload with.
 *
 * `dishId` is `null` for a brand-new, not-yet-saved Recipe/Part — see the
 * prior `requestImageUploadUrl` implementation's own note for why that's a
 * supported case, not an oversight: any authenticated user may upload for
 * themselves before any Dish row exists, scoped by their own id in the
 * storage path instead of a Dish id.
 *
 * Accepted gap (unchanged from the prior implementation, documented in the
 * Slice 5 report): an `ImageAsset` created here that never ends up
 * attached to any saved `DishVersion` (uploaded, then never saved, or
 * replaced before saving) has no cleanup path today — Tier 1 has no
 * scheduled-job infrastructure to sweep it. The reference-counted cleanup
 * this app does implement (`deleteImageAssetIfOrphaned`, below) only runs
 * where a `DishVersion` row actually stops referencing an asset.
 */
export async function uploadAndNormalizeImage(
  ownerId: string,
  dishId: string | null,
  file: { name: string; buffer: Buffer },
): Promise<UploadedImage> {
  if (file.buffer.byteLength === 0) {
    throw new ValidationError("Please choose an image.");
  }
  if (file.buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ValidationError("That image is too large (8 MB maximum).");
  }

  const pathScope = dishId
    ? (await getOwnedDishOrThrow(ownerId, dishId)).id
    : ownerId;

  const normalized = await normalizeImageBuffer(file.buffer);

  const storageKey = `images/${pathScope}/${randomUUID()}-${withWebpExtension(file.name)}`;

  // The store itself (`dishframe-images`) is provisioned private, so every
  // object in it is private by construction — no separate `access`
  // override needed beyond passing `"private"` explicitly for clarity.
  await put(storageKey, normalized.buffer, {
    access: "private",
    contentType: normalized.contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
  });

  const asset = await prisma.imageAsset.create({
    data: { storageKey, uploadedByUserId: ownerId },
  });

  return { imageAssetId: asset.id };
}

/**
 * Version-trigger correction pass: before a `DishVersion` (new or existing)
 * is set to reference `imageAssetId`, verify the caller is actually allowed
 * to use that asset — a client-supplied id must never be trusted merely
 * because the row exists. An asset is attachable by `ownerId` when either:
 *
 * - `ownerId` is who requested the upload (`uploadAndNormalizeImage` always
 *   stamps `uploadedByUserId` with the requester, whether the upload was
 *   for a brand-new not-yet-saved item or an existing owned Dish); or
 * - the asset is already referenced by some `DishVersion` belonging to a
 *   Dish `ownerId` owns — the cross-account-safe sharing case
 *   (ARCHITECTURE_PROPOSAL.md §D.2a: a duplicate or accepted copy
 *   legitimately reuses another account's `ImageAsset` row) means an asset
 *   already legitimately in this owner's own library stays reusable.
 *
 * Neither condition holds for an asset only ever uploaded (or referenced)
 * by a different, unrelated account — that request is rejected rather than
 * silently honored.
 */
export async function assertImageAssetAttachable(
  client: Prisma.TransactionClient | typeof prisma,
  ownerId: string,
  imageAssetId: string,
): Promise<void> {
  const asset = await client.imageAsset.findUnique({
    where: { id: imageAssetId },
    select: {
      uploadedByUserId: true,
      versions: {
        where: { dish: { ownerId } },
        select: { id: true },
        take: 1,
      },
    },
  });

  const isUsableByOwner =
    !!asset &&
    (asset.uploadedByUserId === ownerId || asset.versions.length > 0);

  if (!isUsableByOwner) {
    throw new AuthorizationError("That image isn't available to attach here.");
  }
}

/**
 * ARCHITECTURE_PROPOSAL.md §D.2a: query-based reference-counted cleanup,
 * not a maintained counter. Call inside the same transaction as whatever
 * just removed a `DishVersion`'s reference to `imageAssetId` — `deleteDish`'s
 * cascade, and (Version-trigger correction pass) `editDish`'s/
 * `updateVersionMetadata`'s in-place image replace-or-remove path
 * (`src/lib/dishes/service.ts`'s `applyVersionMetadataUpdate`), since a
 * Version's image is mutable metadata now, not immutable content — a
 * `DishVersion` genuinely can lose its existing image reference in place,
 * not only via deletion. Returns the freed `storageKey` to best-effort-
 * delete from Blob storage *after* the transaction commits, or `null` if
 * the asset is still referenced by some other `DishVersion` — including,
 * per Correction 7, a different account's surviving copy after duplication
 * or an accepted share.
 */
export async function deleteImageAssetIfOrphaned(
  tx: Prisma.TransactionClient,
  imageAssetId: string,
): Promise<string | null> {
  const remaining = await tx.dishVersion.count({ where: { imageAssetId } });
  if (remaining > 0) return null;

  const asset = await tx.imageAsset.delete({ where: { id: imageAssetId } });
  return asset.storageKey;
}

/**
 * Best-effort, after-commit external side effect (the same discipline
 * ARCHITECTURE_PROPOSAL.md §I establishes for this class of operation) —
 * logs and swallows a Blob-delete failure rather than failing the
 * already-committed database deletion it's cleaning up after.
 */
export async function bestEffortDeleteBlob(storageKey: string): Promise<void> {
  try {
    await del(storageKey);
  } catch (error) {
    console.error(
      "[images] Failed to delete orphaned blob for storageKey:",
      storageKey,
      error,
    );
  }
}
