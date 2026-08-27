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
 * An `ImageAsset` created here that never ends up attached to any saved
 * `DishVersion` (uploaded, then never saved, or replaced before saving) is
 * not cleaned up inline — the reference-counted cleanup this app does
 * implement (`deleteImageAssetIfOrphaned`, below) only runs where a
 * `DishVersion` row actually stops referencing an asset, which never
 * happens for one that was never attached in the first place. That case is
 * instead swept up later by the scheduled `cleanupAbandonedImageAssets`
 * (below), so an abandoned upload here is a temporary, bounded-lifetime
 * gap rather than a permanent one.
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
 * True when `imageAssetId` is still legitimately referenced by some
 * `DishVersion` or a still-`PENDING` `DirectShare`'s frozen graph. Factored
 * out of `deleteImageAssetIfOrphaned` so `cleanupAbandonedImageAssets`
 * (below) can re-verify a candidate without deleting the row as a side
 * effect of checking.
 *
 * Every other legitimate reference (an accepted share's independent copy, a
 * `ShareLink` in either mode, a frozen print) always resolves through an
 * actual `DishVersion` row — `ShareLink.fixedDishVersionId` points at one
 * directly, and `CURRENT` mode always follows a Dish's live current
 * Version — so the `dishVersion.count` check below already covers them; only
 * the `DirectShare` frozen-graph case needs a second, explicit check.
 */
async function isImageAssetReferenced(
  client: Prisma.TransactionClient | typeof prisma,
  imageAssetId: string,
): Promise<boolean> {
  const remaining = await client.dishVersion.count({ where: { imageAssetId } });
  if (remaining > 0) return true;

  const pendingDirectShares = await client.directShare.count({
    where: { status: "PENDING", frozenImageAssetIds: { has: imageAssetId } },
  });
  return pendingDirectShares > 0;
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
 *
 * Slice 17 correction pass: a still-`PENDING` `DirectShare`'s frozen graph
 * (`frozenImageAssetIds`) is an equally legitimate reference — the sender
 * replacing their live source image in place (the same
 * `applyVersionMetadataUpdate` path above) must not orphan-delete an image
 * a pending delivery's frozen Preview/Accept still needs. Cancelling,
 * declining, or the deletion transaction's own cancellation step (both of
 * which flip `status` away from `PENDING` *before* this runs — see
 * `revokeSharesAndCancelPendingShares`'s call order in `deleteRecipe`/
 * `deletePart`) correctly releases that protection once no longer needed;
 * an already-`ACCEPTED` delivery needs no separate protection here since
 * its copy's own `DishVersion.imageAssetId` reference already counts above.
 *
 * Deletes the DB row first and leaves the Blob delete to the caller
 * (`bestEffortDeleteBlob`, after the transaction commits) — every caller of
 * this function is already deleting the row as part of a larger operation
 * (Dish/account deletion) where the row is the primary record and a
 * best-effort external cleanup is an acceptable trade. The scheduled
 * abandoned-upload sweep below deliberately does *not* use this function,
 * for exactly that reason — see `cleanupAbandonedImageAssets`'s doc
 * comment.
 */
export async function deleteImageAssetIfOrphaned(
  tx: Prisma.TransactionClient,
  imageAssetId: string,
): Promise<string | null> {
  if (await isImageAssetReferenced(tx, imageAssetId)) return null;
  const asset = await tx.imageAsset.delete({ where: { id: imageAssetId } });
  return asset.storageKey;
}

/**
 * Conservative minimum age before an unattached upload is considered
 * abandoned rather than mid-edit. Ordinary edit sessions (upload an image,
 * finish and save the Recipe/Part) complete in minutes; this is generous
 * enough to also cover someone resuming a draft the next day, while still
 * being a bounded, clearly-abandoned window for a scheduled sweep to act on.
 */
const ABANDONED_UPLOAD_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Bounds how many candidates one cron invocation processes, so an
 * unexpectedly large backlog can't turn a daily sweep into a long-running
 * request — any remainder is simply picked up by the next scheduled run. */
const ABANDONED_UPLOAD_CLEANUP_BATCH_SIZE = 200;

export type AbandonedImageCleanupResult = {
  candidateCount: number;
  deletedCount: number;
  retainedForRetryCount: number;
};

/**
 * How long a single candidate's transaction (below) is allowed to run —
 * longer than Prisma's 5s interactive-transaction default, since the Blob
 * delete call runs *inside* this transaction (see the doc comment on
 * `cleanupAbandonedImageAssets`) and needs headroom beyond a fast local
 * query. If a Blob call genuinely hangs past this, the transaction times
 * out and rolls back — the row is retained (safe), never deleted out from
 * under a Blob object that might not actually be gone.
 */
const ABANDONED_UPLOAD_CLEANUP_TRANSACTION_TIMEOUT_MS = 15_000;

/**
 * Sweeps `ImageAsset` rows created by `uploadAndNormalizeImage` that never
 * ended up attached to any saved `DishVersion` — the accepted gap documented
 * on that function's own doc comment (an upload-then-abandoned edit, with no
 * `DishVersion` mutation ever occurring to trigger `deleteImageAssetIfOrphaned`
 * above). Intended to run on a schedule (`/api/cron/cleanup-orphan-images`,
 * `vercel.json`'s daily Vercel Cron entry), never inline in a request path.
 *
 * Candidates are `ImageAsset` rows with no `versions` at all and older than
 * `ABANDONED_UPLOAD_MIN_AGE_MS`, oldest first, one bounded batch per call.
 *
 * Deliberately Blob-first, the opposite order from `deleteImageAssetIfOrphaned`
 * above: there, the DB row is the primary record being deleted as part of a
 * larger operation, so losing the Blob object to a rare delete failure is an
 * acceptable best-effort trade (nothing else depends on that row surviving).
 * Here, the `ImageAsset` row *is* the only remaining record of the Blob
 * object's existence — deleting it before the Blob delete is confirmed would
 * turn any Blob API failure into a silent, permanent storage leak with no
 * later run ever able to find it again. So each candidate's Blob object is
 * deleted first, and the `ImageAsset` row is only removed once that
 * succeeds; a Blob failure leaves the row in place, safe to retry on the
 * next scheduled run.
 *
 * A plain "recheck before deleting the row" (an earlier version of this
 * function) does *not* actually close the race with a concurrent attach: if
 * `editDish`/`createDish` attaches this asset to a `DishVersion` after the
 * initial check but before the Blob delete call, the recheck correctly
 * leaves the row in place — but the Blob is *already gone* by then, leaving
 * a saved DishVersion pointing at a deleted Blob object. The 24h age
 * threshold makes this unlikely, not impossible (a long-lived open edit
 * session could still finish a save at exactly the wrong moment).
 *
 * The fix: `SELECT ... FOR UPDATE` locks this specific `ImageAsset` row
 * *before* the reference recheck and the Blob delete, both of which then run
 * while still holding that lock, inside one transaction. Postgres itself
 * requires any concurrent `INSERT`/`UPDATE` that sets a `DishVersion`'s
 * `imageAssetId` to this id to first acquire an implicit `FOR KEY SHARE`
 * lock on this same row (ordinary foreign-key enforcement) — which
 * conflicts with `FOR UPDATE` and therefore blocks until this transaction
 * commits or rolls back. So an attach can no longer land in the gap between
 * the check and the Blob delete: it's either already committed (the recheck
 * sees it and this function backs off before touching the Blob) or it's
 * forced to wait until this transaction is done (and if this function goes
 * on to delete the row, that blocked attempt then fails outright with a
 * foreign-key violation, rather than silently succeeding against a
 * soon-to-be-deleted Blob). `DirectShare.frozenImageAssetIds` has no such
 * FK — but it can't reach an asset from this candidate set anyway, since a
 * frozen graph is only ever built by walking an *already-attached* Dish's
 * content (`sharing/graph.ts`), and every candidate here has zero
 * `DishVersion` references by construction.
 *
 * Running the Blob call inside a transaction that holds a row lock is a
 * deliberate, narrow exception to the usual "external I/O only after commit"
 * discipline (`bestEffortDeleteBlob`'s doc comment) — justified here because
 * it's the only way to close this specific race with Postgres's own
 * primitives, it locks exactly one row for the duration of one call, and
 * this is a low-frequency, sequential batch job, not a request path.
 */
export async function cleanupAbandonedImageAssets(): Promise<AbandonedImageCleanupResult> {
  const cutoff = new Date(Date.now() - ABANDONED_UPLOAD_MIN_AGE_MS);

  const candidates = await prisma.imageAsset.findMany({
    where: { createdAt: { lt: cutoff }, versions: { none: {} } },
    select: { id: true, storageKey: true },
    orderBy: { createdAt: "asc" },
    take: ABANDONED_UPLOAD_CLEANUP_BATCH_SIZE,
  });

  let deletedCount = 0;
  let retainedForRetryCount = 0;

  for (const candidate of candidates) {
    const outcome = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ImageAsset" WHERE id = ${candidate.id} FOR UPDATE`;

        if (await isImageAssetReferenced(tx, candidate.id)) {
          return "referenced" as const;
        }

        try {
          await del(candidate.storageKey);
        } catch (error) {
          console.error(
            "[images] Abandoned-upload sweep: Blob delete failed, retaining row for retry:",
            candidate.storageKey,
            error,
          );
          return "blob-failed" as const;
        }

        await tx.imageAsset.delete({ where: { id: candidate.id } });
        return "deleted" as const;
      },
      { timeout: ABANDONED_UPLOAD_CLEANUP_TRANSACTION_TIMEOUT_MS },
    );

    if (outcome === "deleted") {
      deletedCount++;
    } else {
      retainedForRetryCount++;
    }
  }

  return {
    candidateCount: candidates.length,
    deletedCount,
    retainedForRetryCount,
  };
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
