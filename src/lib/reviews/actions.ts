"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as reviewService from "@/lib/reviews/service";
import {
  saveSessionReviewSchema,
  deleteSessionReviewSchema,
  updateCookingNotesSchema,
  type ActionState,
} from "@/lib/reviews/schema";

function revalidateSession(sessionId: string) {
  revalidatePath("/cook");
  revalidatePath(`/cook/${sessionId}`);
  revalidatePath(`/cook/${sessionId}/review`);
}

export type SaveSessionReviewActionState =
  | { status: "success"; deleted: boolean }
  | { status: "error"; message: string };

export async function saveSessionReview(values: {
  sessionId: string;
  whatWentWell: string | null;
  whatDidNotGoWell: string | null;
  anythingElse: string | null;
  actualAmountQuantity: number | null;
  actualAmountUnit: string | null;
  reviewAdjustedDurationSeconds: number | null;
  ratings: Array<{ tasterId: string; value: number }>;
  includedUnitIds: string[];
}): Promise<SaveSessionReviewActionState> {
  try {
    const userId = await requireUserId();
    const input = saveSessionReviewSchema.parse(values);

    const result = await reviewService.saveSessionReview(userId, input);

    revalidateSession(values.sessionId);
    // Rating summaries appear on the source Recipe/Part's own pages too.
    revalidatePath("/recipes");
    revalidatePath("/parts");
    return { status: "success", deleted: result.deleted };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteSessionReview(values: {
  sessionId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId } = deleteSessionReviewSchema.parse(values);

    await reviewService.deleteSessionReview(userId, sessionId);

    revalidateSession(sessionId);
    revalidatePath("/recipes");
    revalidatePath("/parts");
    return { status: "success", message: "Review deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateCookingNotes(values: {
  sessionId: string;
  cookingNotes: string | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { sessionId, cookingNotes } = updateCookingNotesSchema.parse(values);

    await reviewService.updateCookingNotes(userId, sessionId, cookingNotes);

    revalidateSession(sessionId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
