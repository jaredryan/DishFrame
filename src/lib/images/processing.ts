import "server-only";
import sharp from "sharp";
import { ValidationError } from "@/lib/errors";
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  IMAGE_WEBP_QUALITY,
  MAX_IMAGE_DIMENSION_PX,
  type AllowedImageContentType,
} from "@/lib/images/schema";

// sharp's own detected format strings for the three types this app accepts
// — not the same string as the MIME type, so kept as its own map rather
// than reusing `ALLOWED_IMAGE_CONTENT_TYPES` directly.
const SHARP_FORMAT_TO_CONTENT_TYPE: Record<string, AllowedImageContentType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type NormalizedImage = {
  buffer: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
};

/**
 * Slice 6A, server-side trusted image processing (the only place uploaded
 * Recipe/Part image bytes are ever normalized — see
 * `service.ts#uploadAndNormalizeImage`): validates the buffer is actually
 * one of the supported formats by sniffing its real content via sharp
 * (never trusting a client-supplied `Content-Type` alone), then
 * auto-orients from EXIF and strips it (`.rotate()` with no args),
 * resizes down to `MAX_IMAGE_DIMENSION_PX` on the longest edge without
 * upscaling a smaller source, and converts to WebP at a fixed quality —
 * preserving the source aspect ratio throughout (no cropping).
 *
 * Called exactly once per upload/replace — an already-normalized WebP
 * stored in Blob is never re-read and reprocessed by anything else in the
 * app (reads always stream the stored bytes as-is via
 * `/api/images/[assetId]`), so there's no risk of repeated reprocessing.
 */
export async function normalizeImageBuffer(
  input: Buffer,
): Promise<NormalizedImage> {
  const source = sharp(input, { failOn: "error" });

  let format: string | undefined;
  try {
    ({ format } = await source.metadata());
  } catch {
    throw new ValidationError("Please choose a JPEG, PNG, or WebP image.");
  }

  if (!format || !(format in SHARP_FORMAT_TO_CONTENT_TYPE)) {
    throw new ValidationError("Please choose a JPEG, PNG, or WebP image.");
  }
  if (
    !ALLOWED_IMAGE_CONTENT_TYPES.includes(SHARP_FORMAT_TO_CONTENT_TYPE[format])
  ) {
    throw new ValidationError("Please choose a JPEG, PNG, or WebP image.");
  }

  try {
    const { data, info } = await sharp(input, { failOn: "error" })
      .rotate()
      .resize({
        width: MAX_IMAGE_DIMENSION_PX,
        height: MAX_IMAGE_DIMENSION_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      contentType: "image/webp",
      width: info.width,
      height: info.height,
    };
  } catch {
    throw new ValidationError(
      "That image couldn't be processed. Please try a different file.",
    );
  }
}
