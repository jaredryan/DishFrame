import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { normalizeImageBuffer } from "@/lib/images/processing";
import { MAX_IMAGE_DIMENSION_PX } from "@/lib/images/schema";
import { ValidationError } from "@/lib/errors";

function solidColorPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 100, b: 50 },
    },
  })
    .png()
    .toBuffer();
}

describe("normalizeImageBuffer", () => {
  it("converts a PNG source to WebP", async () => {
    const input = await solidColorPng(100, 80);
    const result = await normalizeImageBuffer(input);

    expect(result.contentType).toBe("image/webp");
    // WebP's RIFF container: bytes 0-3 "RIFF", bytes 8-11 "WEBP".
    expect(result.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("resizes an oversized image down to the max dimension, preserving aspect ratio", async () => {
    const input = await solidColorPng(4000, 2000);
    const result = await normalizeImageBuffer(input);

    expect(result.width).toBe(MAX_IMAGE_DIMENSION_PX);
    expect(result.height).toBe(MAX_IMAGE_DIMENSION_PX / 2);
  });

  it("does not upscale a smaller image", async () => {
    const input = await solidColorPng(200, 100);
    const result = await normalizeImageBuffer(input);

    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
  });

  it("rejects a buffer that isn't a supported image", async () => {
    await expect(
      normalizeImageBuffer(Buffer.from("not an image")),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
