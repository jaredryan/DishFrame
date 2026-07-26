import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import { AuthorizationError } from "@/lib/errors";

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

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
