"use server";

import { revalidatePath } from "next/cache";
import { requireUserId, getServerSession } from "@/lib/auth/session";
import {
  AuthorizationError,
  ValidationError,
  toActionErrorMessage,
} from "@/lib/errors";
import * as accountService from "@/lib/account/service";
import {
  revokeAuthSessionSchema,
  deleteAccountSchema,
} from "@/lib/account/schema";

const PROFILE_PATH = "/profile";

export type AccountActionState =
  { status: "success" } | { status: "error"; message: string };

export async function revokeAuthSessionAction(
  values: unknown,
): Promise<AccountActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId } = revokeAuthSessionSchema.parse(values);
    await accountService.revokeAuthSession(userId, sessionId);
    revalidatePath(PROFILE_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function revokeOtherAuthSessionsAction(): Promise<AccountActionState> {
  try {
    await requireUserId();
    await accountService.revokeOtherAuthSessions();
    revalidatePath(PROFILE_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DeleteAccountActionState =
  | { status: "success" }
  | { status: "needs_reauth" }
  | { status: "error"; message: string };

/**
 * PRODUCT_SPEC.md §91: explicit destructive confirmation (the caller must
 * type their own account email — checked server-side against the signed-in
 * session, never trusted from the client alone) plus recent authentication
 * (`isSessionFresh`, the same freshness window Better Auth's own
 * `listSessions` enforces natively). No password/reauth-modal flow exists
 * for this app's Google-only sign-in (AGENTS.md — never invent one); when
 * the session isn't fresh, the caller must sign out and back in before
 * retrying, which is what `needs_reauth` prompts the UI to offer.
 */
export async function deleteAccountAction(
  values: unknown,
): Promise<DeleteAccountActionState> {
  try {
    const session = await getServerSession();
    if (!session) {
      throw new AuthorizationError("You must be signed in to do that.");
    }
    const { confirmEmail } = deleteAccountSchema.parse(values);
    if (
      confirmEmail.trim().toLowerCase() !== session.user.email.toLowerCase()
    ) {
      throw new ValidationError("Type your account email exactly to confirm.");
    }
    if (!accountService.isSessionFresh(session)) {
      return { status: "needs_reauth" };
    }

    await accountService.deleteAccount(session.user.id);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
