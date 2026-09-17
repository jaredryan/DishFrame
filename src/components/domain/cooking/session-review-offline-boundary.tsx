"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { SessionReviewForm } from "@/components/domain/cooking/session-review-form";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type { SessionReviewProps } from "@/lib/reviews/session-review-view";

type CookingSessionDoc = { reviewProps?: SessionReviewProps };

/**
 * Same "offline document bootstrap" pattern as the other boundaries,
 * scoped to the `cookingSession` entity's `reviewProps` field (added
 * alongside its existing Cooking Mode props in `offline-sync/cooking.ts`'s
 * `snapshotResult` — see `lib/reviews/session-review-view.ts`'s doc
 * comment for the "already in the replica" scope this covers: a session
 * ended on this device works offline; an older session not already
 * replicated still needs a connection).
 *
 * Identity comes from `useParams()`, not `serverProps.sessionId` — see
 * `DishOfflineBoundary`'s doc comment for why (`public/sw.js`'s route-
 * shell fallback can serve a different session's cached payload for this
 * route pattern on a first-ever offline visit). When the ids disagree,
 * only the replica's own review data for the real session is ever shown.
 */
export function SessionReviewOfflineBoundary({
  serverProps,
}: {
  serverProps: SessionReviewProps | null;
}) {
  const { sessionId: realSessionId } = useParams<{ sessionId: string }>();
  const isShellFallback =
    serverProps === null || serverProps.sessionId !== realSessionId;
  const [props, setProps] = React.useState<SessionReviewProps | null>(
    isShellFallback ? null : serverProps,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<CookingSessionDoc>(
        "cookingSession",
        realSessionId,
      );
      if (cancelled) return;

      if (isShellFallback) {
        setProps(local?.doc.reviewProps ?? null);
        return;
      }

      if (local?.dirty && local.doc.reviewProps) {
        setProps(local.doc.reviewProps);
        return;
      }

      if (local) {
        await putEntity({
          ...local,
          doc: { ...local.doc, reviewProps: serverProps },
          serverRevision: new Date().toISOString(),
          localUpdatedAt: new Date().toISOString(),
          dirty: false,
          conflict: null,
        });
      }
      setProps(serverProps);
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realSessionId, isShellFallback, serverProps]);

  if (!props) {
    return <OfflineShellPlaceholder />;
  }

  return (
    <SessionReviewForm
      sessionId={props.sessionId}
      dishId={props.dishId}
      dishVersionId={props.dishVersionId}
      dishKind={props.dishKind}
      dishTitle={props.dishTitle}
      outcome={props.outcome as "COMPLETED" | "ENDED_EARLY"}
      contextUnits={props.contextUnits}
      tasterOptions={props.tasterOptions}
      existingReview={props.existingReview}
      existingRatings={props.existingRatings}
      rawElapsedSeconds={props.rawElapsedSeconds}
      currentStage={props.currentStage}
    />
  );
}
