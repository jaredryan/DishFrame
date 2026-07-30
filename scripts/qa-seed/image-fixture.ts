import { deflateSync, crc32 } from "node:zlib";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import type { updateVersionMetadata as UpdateVersionMetadata } from "@/lib/dishes/service";

// Fixed, deterministic pathname — reused (overwritten) on every seed run
// rather than generating a new Blob each time, per the task's "must not
// create an unbounded new private Blob on every seed run" requirement.
export const IMAGE_FIXTURE_STORAGE_KEY = "images/qa-seed/sunday-ramen-project.png";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * Generates a deterministic solid-color PNG entirely in code (no external
 * asset, nothing to fetch or commit) — good enough to exercise real image
 * upload/replace/remove/logged-out-access flows without needing an actual
 * photo. Same bytes every run (zlib deflate is deterministic for identical
 * input), so re-uploading it to the same fixed pathname is a true no-op.
 */
export function generateSolidColorPng(
  width: number,
  height: number,
  rgb: [number, number, number],
): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      raw[pixelStart] = rgb[0];
      raw[pixelStart + 1] = rgb[1];
      raw[pixelStart + 2] = rgb[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Attaches the deterministic image fixture to "[QA] Sunday Ramen
 * Project"'s current Version via the real `updateVersionMetadata` domain
 * function (a pure in-place metadata update — never creates a Version),
 * so real upload/replace/remove/logged-out-access review is possible
 * without a manual step. Skips gracefully (not a hard failure) when
 * `BLOB_READ_WRITE_TOKEN` isn't configured — this repo's `.env.example`
 * doesn't require it for other local dev work, so the seed must keep
 * working fully without it.
 */
export async function attachSeedImage(
  updateVersionMetadata: typeof UpdateVersionMetadata,
  ownerId: string,
  dishId: string,
  versionId: string,
  description: string | null,
): Promise<{ attached: boolean }> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.log(
      "[qa-seed] BLOB_READ_WRITE_TOKEN is not set — skipping the image fixture " +
        "(see docs/MANUAL_QA_SEED.md for the manual image-upload step).",
    );
    return { attached: false };
  }

  const png = generateSolidColorPng(640, 480, [214, 122, 44]);
  await put(IMAGE_FIXTURE_STORAGE_KEY, png, {
    access: "private",
    contentType: "image/png",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  const asset = await prisma.imageAsset.upsert({
    where: { storageKey: IMAGE_FIXTURE_STORAGE_KEY },
    update: {},
    create: { storageKey: IMAGE_FIXTURE_STORAGE_KEY, uploadedByUserId: ownerId },
  });

  await updateVersionMetadata(
    ownerId,
    dishId,
    versionId,
    { description, imageAssetId: asset.id },
    "RECIPE",
  );

  return { attached: true };
}
