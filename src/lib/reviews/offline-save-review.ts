"use client";

import { generateClientId } from "@/lib/offline/ids";
import { runOrQueueMutation } from "@/lib/offline/mutate";
import type { SaveSessionReviewActionState } from "@/lib/reviews/actions";
import type { SessionReviewProps } from "@/lib/reviews/session-review-view";

type CookingSessionDoc = { reviewProps?: SessionReviewProps };

/**
 * Drop-in offline-capable replacement for `saveSessionReview` (the Server
 * Action) — same name pattern as `saveDishOffline`/`groceryMutate`. Routes
 * through `/api/sync/cooking`'s `cooking.saveReview` op either way, so
 * there's one code path online and off. The `deleted` flag (an empty
 * review is treated as removing it — `reviews/service.ts`'s
 * `hasMeaningfulContent`) is only known once the server has actually
 * decided it, so a queued-offline save always reports `deleted: false`,
 * matching the "no summary yet" pattern already accepted for other
 * queued cross-cutting operations (e.g. grocery/mealplan resync).
 */
export async function saveSessionReviewOffline(values: {
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
  const result = await runOrQueueMutation({
    op: "cooking.saveReview",
    entityType: "cookingSession",
    entityId: values.sessionId,
    payload: values,
    optimisticDoc: (current: unknown) => {
      const doc = current as CookingSessionDoc | undefined;
      if (!doc?.reviewProps) return current;
      return {
        ...doc,
        reviewProps: {
          ...doc.reviewProps,
          existingReview: {
            whatWentWell: values.whatWentWell,
            whatDidNotGoWell: values.whatDidNotGoWell,
            anythingElse: values.anythingElse,
            actualAmountQuantity: values.actualAmountQuantity,
            actualAmountUnit: values.actualAmountUnit,
            reviewAdjustedDurationSeconds: values.reviewAdjustedDurationSeconds,
            includedUnitIds: values.includedUnitIds,
          },
          existingRatings: values.ratings,
        },
      };
    },
    mutationId: generateClientId(),
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", deleted: false };
}
