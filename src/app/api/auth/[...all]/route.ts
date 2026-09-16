import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit/limit";

const { GET, POST: authPost } = toNextJsHandler(auth);

/**
 * Security hardening pass: only the credential/account-creation paths, by
 * IP — not the whole `/api/auth/*` surface. `get-session` in particular is
 * called on effectively every authenticated page load, so a blanket limit
 * here would throttle ordinary usage, not abuse. This app currently only
 * wires up Google sign-in (no `emailAndPassword` block in `auth.ts`), so
 * `sign-in/social` is the one path actually reachable today; the
 * email/password paths are guarded too in case that ever changes.
 * Durable across every serverless instance (`consumeRateLimit`, Postgres) —
 * unlike Better Auth's own built-in limiter, which defaults to an
 * in-memory, per-instance counter (see docs/TODO.md).
 */
const RATE_LIMITED_AUTH_SUFFIXES = [
  "/sign-in/social",
  "/sign-in/email",
  "/sign-up/email",
  "/reset-password",
];

async function POST(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const matched = RATE_LIMITED_AUTH_SUFFIXES.find((suffix) =>
    pathname.endsWith(suffix),
  );

  if (matched) {
    const ip = getClientIp(request.headers);
    const result = await consumeRateLimit(`auth${matched}:${ip}`, {
      max: 20,
      windowSeconds: 5 * 60,
    });
    if (!result.allowed) {
      return Response.json(
        { message: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSeconds) },
        },
      );
    }
  }

  return authPost(request);
}

export { GET, POST };
