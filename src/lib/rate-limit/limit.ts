import "server-only";
import { prisma } from "@/lib/db/prisma";

export type RateLimitOutcome =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Fixed-window counter backed by Postgres (`RateLimitHit`, see
 * prisma/schema.prisma), not process memory — every Vercel serverless
 * instance shares the same window, which an in-memory counter cannot do
 * (each cold start / concurrent instance would otherwise keep its own
 * count, silently multiplying the effective limit by however many
 * instances are live).
 *
 * Single-statement `INSERT ... ON CONFLICT ... DO UPDATE` so the
 * read-and-increment is atomic under concurrent requests for the same key
 * (Postgres serializes the upsert at the row level) — no separate
 * read-then-write round trip that a race could slip between.
 *
 * `key` should already encode the scope, e.g. `contact:203.0.113.4` or
 * `image-upload:user_abc123`, so unrelated limits never collide.
 */
export async function consumeRateLimit(
  key: string,
  options: { max: number; windowSeconds: number },
): Promise<RateLimitOutcome> {
  const now = new Date();
  const windowMs = options.windowSeconds * 1000;
  const cutoff = new Date(now.getTime() - windowMs);

  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "RateLimitHit" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitHit"."windowStart" <= ${cutoff} THEN 1
        ELSE "RateLimitHit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitHit"."windowStart" <= ${cutoff} THEN ${now}
        ELSE "RateLimitHit"."windowStart"
      END
    RETURNING "count", "windowStart"
  `;

  const row = rows[0];
  if (!row || row.count <= options.max) {
    return { allowed: true };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((row.windowStart.getTime() + windowMs - now.getTime()) / 1000),
  );
  return { allowed: false, retryAfterSeconds };
}

/**
 * Vercel's own docs (docs/headers/request-headers) are explicit that on
 * Vercel's standard infrastructure (no customer-added proxy in front of
 * it, which this deployment doesn't have), it "overwrite[s] the
 * `X-Forwarded-For` header and do[es] not forward external IPs" — a client
 * cannot spoof it. `x-vercel-forwarded-for` is documented as identical but
 * additionally immune to being overwritten if a proxy is ever added in
 * front of Vercel later, so it's checked first; `x-forwarded-for` and
 * `x-real-ip` (also Vercel-set, "identical to x-forwarded-for" per the
 * same page) are the fallbacks for that same trustworthy value. None of
 * these are read as a client-suppliable value — if this ever runs behind
 * an untrusted proxy this doesn't control, this trust assumption would
 * need revisiting.
 *
 * Falls back to a single shared bucket key when none of these headers are
 * present (local dev, where no proxy sets them at all), which
 * under-protects rather than throws.
 *
 * Typed structurally (not `Headers`) so both a real `Request.headers` and
 * `next/headers`' read-only `headers()` result (which omits the mutating
 * methods `Headers` declares) satisfy it without a cast.
 */
export function getClientIp(headers: {
  get(name: string): string | null;
}): string {
  for (const name of [
    "x-vercel-forwarded-for",
    "x-forwarded-for",
    "x-real-ip",
  ]) {
    const value = headers.get(name);
    if (!value) continue;
    const first = value.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * `consumeRateLimit` never deletes a row — a given key's row is reused
 * (reset in place) as long as the same key keeps recurring, but a key that
 * stops recurring (an IP that moves on, a since-deleted user) leaves its
 * last row behind forever. Every window this app uses is well under a day
 * (the longest is the contact form's 15 minutes), so any row untouched for
 * a full day is from an expired window and safe to drop. Called from the
 * existing daily cron (`/api/cron/cleanup-orphan-images`) rather than a
 * separate schedule.
 */
export async function cleanupExpiredRateLimitHits(): Promise<{
  deletedCount: number;
}> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.$executeRaw`
    DELETE FROM "RateLimitHit" WHERE "windowStart" < ${cutoff}
  `;
  return { deletedCount: result };
}
