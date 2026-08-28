"use server";

import { revalidatePath } from "next/cache";
import { requireUserId, getServerSession } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as sharingService from "@/lib/sharing/service";
import * as collectionsService from "@/lib/sharing/collections";
import {
  createShareLinkSchema,
  shareLinkIdSchema,
  updateShareLinkSchema,
  saveSharedCopySchema,
  directShareIdSchema,
  sendDirectShareCollectionSchema,
  directShareCollectionIdSchema,
  finalizeDirectShareCollectionSchema,
  publishDishesSchema,
  directShareRecipientHistorySchema,
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

export type PublishDishesResultItem =
  | {
      dishId: string;
      status: "success";
      dishKind: DishKindValue;
      title: string;
      url: string;
    }
  | { dishId: string; status: "error"; message: string };

export type PublishDishesActionState =
  | { status: "success"; results: PublishDishesResultItem[] }
  | { status: "error"; message: string };

/**
 * `/share`'s generalized bulk Publish entry point (Share → Publish). One
 * shared settings payload, applied per selected item — see
 * `sharingService.publishDishes` for why each item resolves independently
 * rather than the whole batch failing together.
 */
export async function publishDishes(
  values: unknown,
): Promise<PublishDishesActionState> {
  try {
    const userId = await requireUserId();
    const input = publishDishesSchema.parse(values);
    const results = await sharingService.publishDishes(userId, {
      ...input,
      expiresAt: input.expiresAt ?? null,
    });
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return {
      status: "success",
      results: results.map((result) =>
        result.status === "success"
          ? result
          : {
              dishId: result.dishId,
              status: "error",
              message: toActionErrorMessage(result.error),
            },
      ),
    };
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

// ============================================================================
// Direct account-to-account sharing. Every Send now goes through
// `sendDirectShareCollection` below — there is no separate single-item send
// action, and no recipient-lookup action (the sender is never shown whether
// the entered email belongs to an existing account).
// ============================================================================

export type DeclineDirectShareActionState =
  | { status: "success"; outcome: "declined" | "not_actionable" }
  | { status: "error"; message: string };

export async function declineDirectShare(
  values: unknown,
): Promise<DeclineDirectShareActionState> {
  try {
    const userId = await requireUserId();
    const { directShareId } = directShareIdSchema.parse(values);
    const result = await sharingService.declineDirectShare(
      userId,
      directShareId,
    );
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success", outcome: result.outcome };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type AcceptDirectShareActionState =
  | {
      status: "success";
      outcome: "accepted";
      dishId: string;
      dishKind: DishKindValue;
    }
  | { status: "success"; outcome: "accepted_copy_deleted" }
  | { status: "success"; outcome: "not_actionable" }
  | { status: "error"; message: string };

export async function acceptDirectShare(
  values: unknown,
): Promise<AcceptDirectShareActionState> {
  try {
    const userId = await requireUserId();
    const { directShareId } = directShareIdSchema.parse(values);
    const result = await sharingService.acceptDirectShare(
      userId,
      directShareId,
    );
    revalidatePath(SHARE_MANAGEMENT_PATH);
    if (result.outcome === "accepted") {
      return {
        status: "success",
        outcome: "accepted",
        dishId: result.dishId,
        dishKind: result.dishKind,
      };
    }
    return { status: "success", outcome: result.outcome };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DirectSharePreviewActionState =
  | { status: "success"; preview: sharingService.DirectSharePreview }
  | { status: "error"; message: string };

export async function getDirectSharePreview(
  values: unknown,
): Promise<DirectSharePreviewActionState> {
  try {
    const userId = await requireUserId();
    const { directShareId } = directShareIdSchema.parse(values);
    const preview = await sharingService.getDirectSharePreview(
      userId,
      directShareId,
    );
    return { status: "success", preview };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

// ============================================================================
// The unified Send flow: any mix of Recipes and Parts, one item or many, in
// a single canonical DirectShareCollection envelope.
// ============================================================================

export type ShareableItemsActionState =
  | { status: "success"; items: collectionsService.ShareableItemSummary[] }
  | { status: "error"; message: string };

export async function listShareableItemsForSender(): Promise<ShareableItemsActionState> {
  try {
    const userId = await requireUserId();
    const items = await collectionsService.listShareableItemsForSender(userId);
    return { status: "success", items };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DirectShareRecipientHistoryActionState =
  | {
      status: "success";
      history: Record<string, collectionsService.DirectShareHistoryStatus>;
    }
  | { status: "error"; message: string };

/**
 * Picker resend-prevention pass: per-Dish ACCEPTED/PENDING share status from
 * this sender to the candidate recipient email, so the Send picker can
 * disable already-shared items instead of the sender rediscovering it after
 * a duplicate-pending error.
 */
export async function getDirectShareRecipientHistory(
  values: unknown,
): Promise<DirectShareRecipientHistoryActionState> {
  try {
    const userId = await requireUserId();
    const input = directShareRecipientHistorySchema.parse(values);
    const history = await collectionsService.getDirectShareHistoryForRecipient(
      userId,
      input.recipientEmail,
    );
    return { status: "success", history };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type SendDirectShareCollectionActionState =
  | { status: "success"; collectionId: string }
  | { status: "error"; message: string };

export async function sendDirectShareCollection(
  values: unknown,
): Promise<SendDirectShareCollectionActionState> {
  try {
    const userId = await requireUserId();
    const input = sendDirectShareCollectionSchema.parse(values);
    const result = await collectionsService.sendDirectShareCollection(
      userId,
      input,
    );
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success", ...result };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function cancelDirectShareCollection(
  values: unknown,
): Promise<ShareActionState> {
  try {
    const userId = await requireUserId();
    const { collectionId } = directShareCollectionIdSchema.parse(values);
    await collectionsService.cancelDirectShareCollection(userId, collectionId);
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DirectShareCollectionDetailActionState =
  | {
      status: "success";
      detail: collectionsService.DirectShareCollectionDetail;
    }
  | { status: "error"; message: string };

export async function getDirectShareCollectionDetail(
  values: unknown,
): Promise<DirectShareCollectionDetailActionState> {
  try {
    const userId = await requireUserId();
    const { collectionId } = directShareCollectionIdSchema.parse(values);
    const detail = await collectionsService.getDirectShareCollectionDetail(
      userId,
      collectionId,
    );
    return { status: "success", detail };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type FinalizeDirectShareCollectionActionState =
  | {
      status: "success";
      result: collectionsService.FinalizeDirectShareCollectionResult;
    }
  | { status: "error"; message: string };

export async function finalizeDirectShareCollection(
  values: unknown,
): Promise<FinalizeDirectShareCollectionActionState> {
  try {
    const userId = await requireUserId();
    const input = finalizeDirectShareCollectionSchema.parse(values);
    const result =
      await collectionsService.finalizeDirectShareCollectionDecision(
        userId,
        input.collectionId,
        input.acceptedShareIds,
      );
    revalidatePath(SHARE_MANAGEMENT_PATH);
    return { status: "success", result };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
