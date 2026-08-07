import "server-only";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env/server";

const SHARE_LINK_PATH_PREFIX = "/s/";

/**
 * ARCHITECTURE_PROPOSAL.md §D.13/§M.4, round-2 Correction 6: `ShareLink.tokenId`
 * is a public lookup key, not a secret — the shareable URL token is
 * `tokenId + "." + HMAC-SHA256(tokenId, SECRET)`, recomputed on demand from
 * `tokenId` and a server-only secret rather than itself stored. This is what
 * lets `getShareLinkUrl` reproduce a working link on demand for the owner's
 * sharing-management page without ever having stored the raw token.
 */

export function generateTokenId(): string {
  return randomBytes(18).toString("base64url");
}

function sign(tokenId: string): string {
  return createHmac("sha256", env.SHARE_LINK_HMAC_SECRET)
    .update(tokenId)
    .digest("base64url");
}

export function buildShareToken(tokenId: string): string {
  return `${tokenId}.${sign(tokenId)}`;
}

/**
 * The actual pasteable URL for a share link (`buildShareToken` alone is
 * just the token — never valid to hand to a viewer on its own, since it's
 * missing the origin and the `/s/` route).
 */
export function buildShareUrl(tokenId: string): string {
  return `${env.NEXT_PUBLIC_APP_URL}${SHARE_LINK_PATH_PREFIX}${buildShareToken(tokenId)}`;
}

/**
 * Splits the incoming token into `tokenId` + signature and verifies the
 * signature server-side with a constant-time comparison before ever
 * returning `tokenId` for a database lookup — a request with a valid-looking
 * `tokenId` but a forged or missing signature is rejected here, before any
 * query runs (PRODUCT_SPEC.md §83, Slice 16's own validation requirement).
 * Returns `null` for anything malformed or unverified.
 */
export function parseShareToken(token: string): string | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex <= 0 || dotIndex === token.length - 1) return null;

  const tokenId = token.slice(0, dotIndex);
  const providedSignature = token.slice(dotIndex + 1);
  const expectedSignature = sign(tokenId);

  const expectedBuf = Buffer.from(expectedSignature);
  const providedBuf = Buffer.from(providedSignature);
  if (expectedBuf.length !== providedBuf.length) return null;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return null;

  return tokenId;
}
