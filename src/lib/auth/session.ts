import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { AuthorizationError } from "@/lib/errors";

/**
 * Better Auth's own `getSession` re-wraps any internal failure (a dead DB
 * connection, a broken session-store query) as a thrown
 * `FAILED_TO_GET_SESSION` APIError rather than returning null — so an
 * unguarded call here doesn't fail "not signed in," it crashes whatever
 * page called it (every page does, via requireUserId/this function).
 * Better Auth's own internal callers (getSessionFromCtx) already treat
 * that failure as "no session"; this does the same at the application
 * boundary instead of letting it reach the client-side error boundary.
 *
 * Wrapped in React's `cache()` because every protected route calls this at
 * least twice (once in `(app)/layout.tsx`, again in the page) — without
 * request-level memoization each call was a separate session-table lookup.
 * `cache()` dedupes those into one lookup per render pass; it does not
 * persist across separate requests/Server Actions, so it can't serve a
 * stale session.
 */
export const getServerSession = cache(async function getServerSession() {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch (error) {
    console.error("[getServerSession] Session lookup failed:", error);
    return null;
  }
});

/**
 * For Server Actions and other authenticated-only entry points: returns the
 * signed-in user's id, or throws AuthorizationError. Two-layer authorization
 * (ARCHITECTURE_PROPOSAL.md §K.6) starts here — every domain query still
 * scopes by ownerId in its own `where` clause on top of this check.
 */
export async function requireUserId(): Promise<string> {
  const session = await getServerSession();
  if (!session) {
    throw new AuthorizationError("You must be signed in to do that.");
  }
  return session.user.id;
}
