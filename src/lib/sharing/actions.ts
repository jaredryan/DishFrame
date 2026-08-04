"use server";

import { revalidatePath } from "next/cache";
import { requireUserId, getServerSession } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as sharingService from "@/lib/sharing/service";
import {
  createShareLinkSchema,
  shareLinkIdSchema,
  updateShareLinkSchema,
  saveSharedCopySchema,
} from "@/lib/sharing/schema";
import type { DishKindValue } from "@/lib/dishes/schema";

const SHARE_MANAGEMENT_PATH = "/share";

export type ShareActionState =
  { status: "success" } | { status: "error"; message: string };

export type CreateShareLinkActionState =
  | { status: "success"; shareLinkId: string; url: string }
  | { status: "error"; message: string };

export type ShareLinkUrlActionState =
  { status: "success"; url: string } | { status: "error"; message: string };

export type SaveSharedCopyActionState =
  | { status: "success"; dishId: string; dishKind: DishKindValue }
  | { status: "error"; message: string; requiresSignIn?: boolean }
  /** Correction pass, Gate 7 §2.8: this recipient already accepted this
   * exact share and later deleted their copy — the one-time rule still
   * applies, so no new copy is created. The page should already prevent
   * this by not rendering the Save action once it detects this state
   * (`(share)/s/[token]/page.tsx`); this is the defensive fallback for a
   * stale page or a direct call. */
  | { status: "previously_accepted_deleted" };

export async function createShareLink(
  values: unknown,
): Promise<CreateShareLinkActionState> {
  try {
    const userId = await requireUserId();
    const input = createShareLinkSchema.parse(values);
    const result = await sharingService.createShareLink(userId, input);
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success", ...result };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function revokeShareLink(
  values: unknown,
): Promise<ShareActionState> {
  try {
    const userId = await requireUserId();
    const { shareLinkId } = shareLinkIdSchema.parse(values);
    await sharingService.revokeShareLink(userId, shareLinkId);
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function regenerateShareLink(
  values: unknown,
): Promise<ShareLinkUrlActionState> {
  try {
    const userId = await requireUserId();
    const { shareLinkId } = shareLinkIdSchema.parse(values);
    const url = await sharingService.regenerateShareLink(userId, shareLinkId);
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success", url };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateShareLinkSettings(
  values: unknown,
): Promise<ShareActionState> {
  try {
    const userId = await requireUserId();
    const input = updateShareLinkSchema.parse(values);
    await sharingService.updateShareLinkSettings(userId, input);
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function getShareLinkUrl(
  values: unknown,
): Promise<ShareLinkUrlActionState> {
  try {
    const userId = await requireUserId();
    const { shareLinkId } = shareLinkIdSchema.parse(values);
    const url = await sharingService.getShareLinkUrl(userId, shareLinkId);
    return { status: "success", url };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

/**
 * PRODUCT_SPEC.md §84.1: a logged-out viewer is prompted to authenticate
 * before saving, rather than the action silently failing — `requiresSignIn`
 * lets the public page's client component redirect to sign-in instead of
 * just showing a generic error.
 */
export async function saveSharedCopy(
  values: unknown,
): Promise<SaveSharedCopyActionState> {
  try {
    const session = await getServerSession();
    if (!session) {
      return {
        status: "error",
        message: "Sign in to save this to your account.",
        requiresSignIn: true,
      };
    }
    const { token } = saveSharedCopySchema.parse(values);
    const result = await sharingService.saveSharedCopy(session.user.id, token);
    if (result.outcome === "previously_accepted_copy_deleted") {
      return { status: "previously_accepted_deleted" };
    }
    return {
      status: "success",
      dishId: result.dishId,
      dishKind: result.dishKind,
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
