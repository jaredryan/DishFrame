import { readFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { normalizeImageBuffer } from "@/lib/images/processing";
import {
  deleteImageAssetIfOrphaned,
  bestEffortDeleteBlob,
} from "@/lib/images/service";
import type { updateVersionMetadata as UpdateVersionMetadata } from "@/lib/dishes/service";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * Image fixtures are opt-in, never implied by `BLOB_READ_WRITE_TOKEN`'s mere
 * presence in `.env.local` — a correction after the Slice 7-15 seed pass
 * accidentally contacted Vercel Blob during ordinary `pnpm db:seed` runs on
 * a machine that happened to have the token configured for unrelated app
 * development. `pnpm db:seed` never reads this module's exported functions
 * with real effect unless this exact flag is set; `pnpm db:seed-images`
 * (package.json) is the only script that sets it.
 */
export const SEED_UPLOAD_BLOB_IMAGES_ENV_VAR = "SEED_UPLOAD_BLOB_IMAGES";

export function isImageUploadRequested(): boolean {
  return process.env[SEED_UPLOAD_BLOB_IMAGES_ENV_VAR] === "true";
}

/**
 * Real, repository-owner-supplied food photos, mapped deterministically to
 * their Recipe/Part by descriptive filename (see this file's own
 * filename-matching logic below). Not committed for any user beyond this
 * repository, and licensing/ownership of these specific files is the
 * repository owner's responsibility, not something this script verifies.
 */
export const SEED_IMAGE_ASSET_DIR = path.join(
  process.cwd(),
  "prisma",
  "seed-assets",
  "food",
);

export type SeedImageTarget = {
  /** Used verbatim in the deterministic storage key
   * (`images/qa-seed/{slug}.webp`) — stable across runs so a rerun reuses
   * the same `ImageAsset` row/Blob object (upsert by `storageKey`) instead
   * of creating a new one, and so `cleanupOrphanedSeedImageAssets` can tell
   * a genuinely-dropped target apart from one that's merely being
   * re-attached. */
  slug: string;
  dishId: string;
  kind: DishKindValue;
  /** Filename under `SEED_IMAGE_ASSET_DIR`, extension included — source
   * formats are deliberately mixed (.jpg/.jpeg/.webp) across targets to
   * prove seeding isn't brittle to a specific image format; every source
   * format is normalized to the same canonical .webp storage key below via
   * the real `normalizeImageBuffer` pipeline. */
  fileName: string;
};

async function currentVersionAndDescription(dishId: string) {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  const version = await prisma.dishVersion.findUniqueOrThrow({
    where: { id: dish.currentVersionId! },
    select: { id: true, description: true },
  });
  return { versionId: version.id, description: version.description };
}

async function readSeedImageFixture(fileName: string): Promise<Buffer> {
  const filePath = path.join(SEED_IMAGE_ASSET_DIR, fileName);
  try {
    return await readFile(filePath);
  } catch (error) {
    throw new Error(
      `[qa-seed] Expected local image fixture is missing or unreadable: ${filePath} (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
}

export type AttachSeedImagesResult = {
  requested: boolean;
  attachedCount: number;
  skippedReason: string | null;
};

/**
 * Attaches a real local food photo (`prisma/seed-assets/food/`) to each
 * target's CURRENT Version (re-fetched fresh per target, never trusted from
 * a caller-held snapshot — the cooking-session fixtures once hit exactly
 * this staleness bug when an earlier pipeline step
 * MINOR-edited a Recipe after its Version id had already been captured) via
 * the real `updateVersionMetadata` domain function — a pure in-place
 * metadata update, never creates a Version. Each source file is routed
 * through the same `normalizeImageBuffer` pipeline a real user upload goes
 * through (`src/lib/images/service.ts#uploadAndNormalizeImage`) — real
 * format sniffing, EXIF-orientation correction, resize, WebP conversion —
 * rather than a bespoke upload path, so this exercises the actual
 * validation/normalization conventions instead of a parallel one. A no-op,
 * explained by `skippedReason`, unless BOTH `SEED_UPLOAD_BLOB_IMAGES=true`
 * and `BLOB_READ_WRITE_TOKEN` are set; `pnpm db:seed` sets neither, so it
 * never reaches the `put()` call at all.
 */
export async function attachSeedImages(
  updateVersionMetadata: typeof UpdateVersionMetadata,
  ownerId: string,
  targets: SeedImageTarget[],
): Promise<AttachSeedImagesResult> {
  if (!isImageUploadRequested()) {
    return {
      requested: false,
      attachedCount: 0,
      skippedReason: `${SEED_UPLOAD_BLOB_IMAGES_ENV_VAR} is not "true" — the ordinary seed never contacts Vercel Blob. Run "pnpm db:seed-images" for the image-enabled review seed.`,
    };
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    const reason =
      "BLOB_READ_WRITE_TOKEN is not set — skipping image fixtures despite SEED_UPLOAD_BLOB_IMAGES=true.";
    console.log(`[qa-seed] ${reason}`);
    return { requested: true, attachedCount: 0, skippedReason: reason };
  }

  let attachedCount = 0;
  for (const target of targets) {
    const { versionId, description } = await currentVersionAndDescription(
      target.dishId,
    );
    const sourceBuffer = await readSeedImageFixture(target.fileName);
    const normalized = await normalizeImageBuffer(sourceBuffer);

    const storageKey = `images/qa-seed/${target.slug}.webp`;
    await put(storageKey, normalized.buffer, {
      access: "private",
      contentType: normalized.contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    const asset = await prisma.imageAsset.upsert({
      where: { storageKey },
      update: {},
      create: { storageKey, uploadedByUserId: ownerId },
    });

    await updateVersionMetadata(
      ownerId,
      target.dishId,
      versionId,
      { description, imageAssetId: asset.id },
      target.kind,
    );
    attachedCount++;
  }

  return { requested: true, attachedCount, skippedReason: null };
}

/**
 * Reference-counted cleanup (reusing `src/lib/images/service.ts`'s existing
 * `deleteImageAssetIfOrphaned`/`bestEffortDeleteBlob` — the same mechanism
 * `deleteDish`/`editDish`'s in-place image replace-or-remove path already
 * relies on) for `ImageAsset` rows the *previous* seed run's now-deleted QA
 * Dishes referenced. `wipeExistingFixtures` (owner.ts) collects these
 * candidate ids from every QA `DishVersion` BEFORE deleting the Dishes —
 * call this only AFTER the new fixture set (including its own
 * `attachSeedImages` call, which reuses a still-live `storageKey` via
 * upsert rather than creating a new row) has been fully rebuilt, so an id
 * about to be legitimately reused is never flagged as orphaned mid-seed.
 *
 * A no-op outside image-enabled mode — deleting is itself a real Blob
 * network call (`del()`), so `pnpm db:seed` must never reach it even if a
 * prior `db:seed-images` run left orphaned rows behind. Those rows simply
 * persist harmlessly (unreferenced, invisible in the app) until the next
 * `db:seed-images` run cleans them up for real.
 */
export async function cleanupOrphanedSeedImageAssets(
  candidateImageAssetIds: string[],
): Promise<{ deletedCount: number }> {
  if (!isImageUploadRequested() || candidateImageAssetIds.length === 0) {
    return { deletedCount: 0 };
  }

  let deletedCount = 0;
  for (const imageAssetId of new Set(candidateImageAssetIds)) {
    const storageKey = await prisma.$transaction((tx) =>
      deleteImageAssetIfOrphaned(tx, imageAssetId),
    );
    if (storageKey) {
      await bestEffortDeleteBlob(storageKey);
      deletedCount++;
    }
  }
  return { deletedCount };
}
