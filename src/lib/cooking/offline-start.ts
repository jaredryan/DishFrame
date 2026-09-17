"use client";

import { generateClientId } from "@/lib/offline/ids";
import { runOrQueueMutation } from "@/lib/offline/mutate";
import type { StartCookingSessionActionState } from "@/lib/cooking/actions";

/**
 * Offline-capable replacement for calling `startCookingSession` (the
 * Server Action) directly from `CookingSetup`, used only when
 * `navigator.onLine === false` — same "check upfront, call the pure
 * offline path directly" pattern as `paste-import-flow.tsx`'s
 * `handleConfirmCreate` falling back to `saveDishOffline`, rather than
 * `runOrQueueMutation`'s own online-then-fallback branching, so the
 * online path keeps calling the real Server Action and its full
 * `status: "conflict"` (already-active-session) detection untouched.
 *
 * Going through `/api/sync/cooking` instead has no equivalent conflict
 * detection: an `ActiveSessionConflictError` there becomes a plain HTTP 409
 * with only a message (the sync API's uniform error shape, `offline-sync/
 * http.ts`), so a conflict discovered this way — only possible once the
 * mutation actually reaches the server, either immediately if a stray
 * online retry happens or later during a queued sync — surfaces as a
 * generic failed-mutation, the same "terminal failure, not a routed
 * conflict dialog" path §6 of the offline plan already documents,
 * rather than the rich "end existing session" recovery flow.
 */
export async function startCookingSessionOffline(values: {
  dishId: string;
  dishVersionId: string;
  scaleFactor?: number | null;
  units: Array<{ unitKey: string; scaleFactor?: number | null }>;
}): Promise<StartCookingSessionActionState> {
  const clientSessionId = generateClientId();
  const result = await runOrQueueMutation({
    op: "cooking.startSession",
    entityType: "cookingSession",
    entityId: clientSessionId,
    payload: { clientSessionId, input: values },
    optimisticDoc: (current: unknown) => current,
    mutationId: clientSessionId,
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", sessionId: clientSessionId };
}
