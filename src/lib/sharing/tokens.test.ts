import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/env/server", () => ({
  env: {
    SHARE_LINK_HMAC_SECRET: "test-secret-do-not-use",
    NEXT_PUBLIC_APP_URL: "https://dishframe.test",
  },
}));

import {
  generateTokenId,
  buildShareToken,
  buildShareUrl,
  parseShareToken,
} from "./tokens";

describe("sharing tokens", () => {
  it("round-trips a generated tokenId through build/parse", () => {
    const tokenId = generateTokenId();
    const token = buildShareToken(tokenId);
    expect(parseShareToken(token)).toBe(tokenId);
  });

  it("rejects a token with a forged signature", () => {
    const tokenId = generateTokenId();
    const forged = `${tokenId}.not-the-real-signature`;
    expect(parseShareToken(forged)).toBeNull();
  });

  it("rejects a tokenId paired with another token's valid-looking signature", () => {
    const tokenA = buildShareToken(generateTokenId());
    const tokenB = buildShareToken(generateTokenId());
    const [, signatureB] = tokenB.split(".");
    const [tokenIdA] = tokenA.split(".");
    expect(parseShareToken(`${tokenIdA}.${signatureB}`)).toBeNull();
  });

  it("rejects malformed tokens (no separator, empty signature)", () => {
    expect(parseShareToken("no-separator-here")).toBeNull();
    expect(parseShareToken("tokenid.")).toBeNull();
    expect(parseShareToken(".signature-only")).toBeNull();
  });

  it("builds a complete pasteable URL, not just the raw token", () => {
    const tokenId = generateTokenId();
    const url = buildShareUrl(tokenId);
    expect(url).toBe(`https://dishframe.test/s/${buildShareToken(tokenId)}`);
    expect(() => new URL(url)).not.toThrow();
  });
});
