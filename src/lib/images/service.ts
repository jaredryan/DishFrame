import "server-only";
import { randomUUID } from "node:crypto";
import { del } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError } from "@/lib/errors";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import {
  MAX_IMAGE_BYTES,
  type AllowedImageContentType,
} from "@/lib/images/schema";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4),
 * matching `src/lib/tasters/service.ts`'s existing pattern.
 */

/** Strips any path segments and non-portable characters, keeping the
 * original name (and extension) legible in the Blob dashboard/storageKey
 * without trusting it as a literal filesystem path. */
function sanitizeFileNameSegment(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
}

// Short-lived — the client is expected to start the actual Blob `put()`
// immediately after receiving this token (ARCHITECTURE_PROPOSAL.md §M:
// signed-URL upload flow, ownership-validated, short-lived).
const CLIENT_TOKEN_TTL_MS = 5 * 60 * 1000;

export type RequestedImageUpload = {
  imageAssetId: string;
  storageKey: string;
  clientToken: string;
};

/**
 * ARCHITECTURE_PROPOSAL.md §L "Image storage": issues a short-lived,
 * ownership-validated client token for a direct browser→Blob upload (the
 * signed-URL client-upload pattern — bytes never pass through this
 * Server Action's own request body), and creates the `ImageAsset` row up
 * front, before the bytes are actually uploaded, so the editor form has a
 * real `imageAssetId` to carry in its own state as soon as the client-side
 * upload call resolves. `DishVersion.imageAssetId` itself is only ever set
 * later, as part of the ordinary `createDish`/`editDish`/
 * `promoteHistoricalVersion` save transaction (`src/lib/dishes/service.ts`)
 * — this function's only job is issuing the token and reserving the
 * `ImageAsset` row.
 *
 * Ownership is checked via `getOwnedDishOrThrow` whenever `dishId` is
 * given — an upload token can never be issued for a Dish the caller
 * doesn't own. `dishId` is `null` only for the "New recipe/part" flow,
 * before any Dish row exists yet to check ownership against (the editor
 * reuses this same upload widget for both create and edit); in that case
 * any authenticated user may request a token for themselves, scoped by
 * their own id in the storage path instead of a Dish id.
 *
 * Accepted gap (documented in the Slice 5 report, not silently ignored):
 * an `ImageAsset` created here that never ends up attached to any saved
 * `DishVersion` — the user uploads, then never saves, or replaces it with
 * a different image before saving — has no cleanup path today. Tier 1 has
 * no scheduled-job infrastructure to sweep it, and the reference-counted
 * cleanup this slice does implement (`deleteImageAssetIfOrphaned`, below)
 * only runs where a `DishVersion` row is actually deleted.
 */
export async function requestImageUploadUrl(
  ownerId: string,
  dishId: string | null,
  fileName: string,
  contentType: AllowedImageContentType,
  sizeBytes: number,
): Promise<RequestedImageUpload> {
  const pathScope = dishId
    ? (await getOwnedDishOrThrow(ownerId, dishId)).id
    : ownerId;

  const storageKey = `images/${pathScope}/${randomUUID()}-${sanitizeFileNameSegment(fileName)}`;

  const imageAsset = await prisma.imageAsset.create({
    data: { storageKey, uploadedByUserId: ownerId },
  });

  // No `access` field here: the store itself (`dishframe-images`) is
  // provisioned private, so every object in it is private by construction
  // — `BlobClientTokenConstraintOptions` has no per-token access override
  // to set, confirmed directly against the installed `@vercel/blob` types
  // rather than assumed from memory.
  const clientToken = await generateClientTokenFromReadWriteToken({
    pathname: storageKey,
    allowedContentTypes: [contentType],
    maximumSizeInBytes: Math.min(sizeBytes, MAX_IMAGE_BYTES),
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + CLIENT_TOKEN_TTL_MS,
  });

  return { imageAssetId: imageAsset.id, storageKey, clientToken };
}

/**
 * Version-trigger correction pass: before a `DishVersion` (new or existing)
 * is set to reference `imageAssetId`, verify the caller is actually allowed
 * to use that asset — a client-supplied id must never be trusted merely
 * because the row exists. An asset is attachable by `ownerId` when either:
 *
 * - `ownerId` is who requested the upload (`requestImageUploadUrl` always
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
