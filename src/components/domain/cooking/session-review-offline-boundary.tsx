"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { SessionReviewForm } from "@/components/domain/cooking/session-review-form";
import { MultiSourceSessionReviewWizard } from "@/components/domain/cooking/multi-source-session-review-wizard";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type {
  SessionReviewProps,
  MultiSourceSessionReviewProps,
} from "@/lib/reviews/session-review-view";

type CookingSessionDoc = {
  reviewProps?: SessionReviewProps;
  sourceReviewProps?: MultiSourceSessionReviewProps;
};

/**
 * Same "offline document bootstrap" pattern as the other boundaries,
 * scoped to the `cookingSession` entity's `reviewProps`/`sourceReviewProps`
 * fields (added alongside its existing Cooking Mode props in
 * `offline-sync/cooking.ts`'s `snapshotResult` — see
 * `lib/reviews/session-review-view.ts`'s doc comment for the "already in
 * the replica" scope this covers: a session ended on this device works
 * offline; an older session not already replicated still needs a
 * connection).
 *
 * Identity comes from `useParams()`, not `serverProps.sessionId` — see
 * `DishOfflineBoundary`'s doc comment for why (`public/sw.js`'s route-
 * shell fallback can serve a different session's cached payload for this
 * route pattern on a first-ever offline visit). When the ids disagree,
 * only the replica's own review data for the real session is ever shown.
 *
 * Multi-source Cooking Sessions completion pass (2026-09-18): renders the
 * per-source review wizard when the session has more than one
 * participating source, the single form otherwise — same branch a
 * single-source session already took, now made explicit rather than
 * assumed.
 */
export function SessionReviewOfflineBoundary({
  serverProps,
  serverSourceProps,
}: {
  serverProps: SessionReviewProps | null;
  serverSourceProps: MultiSourceSessionReviewProps | null;
}) {
  const { sessionId: realSessionId } = useParams<{ sessionId: string }>();
  const isShellFallback =
    serverProps === null || serverProps.sessionId !== realSessionId;
  const [props, setProps] = React.useState<SessionReviewProps | null>(
    isShellFallback ? null : serverProps,
  );
  const [sourceProps, setSourceProps] =
    React.useState<MultiSourceSessionReviewProps | null>(
      isShellFallback ? null : serverSourceProps,
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
        setSourceProps(local?.doc.sourceReviewProps ?? null);
        return;
      }

      if (local?.dirty && local.doc.reviewProps) {
        setProps(local.doc.reviewProps);
        setSourceProps(local.doc.sourceReviewProps ?? null);
        return;
      }

      if (local) {
        await putEntity({
          ...local,
          doc: {
            ...local.doc,
            reviewProps: serverProps,
            sourceReviewProps: serverSourceProps,
          },
          serverRevision: new Date().toISOString(),
          localUpdatedAt: new Date().toISOString(),
          dirty: false,
          conflict: null,
        });
      }
      setProps(serverProps);
      setSourceProps(serverSourceProps);
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realSessionId, isShellFallback, serverProps, serverSourceProps]);

  if (!props) {
    return <OfflineShellPlaceholder />;
  }

  if (sourceProps && sourceProps.length > 1) {
    return (
      <MultiSourceSessionReviewWizard
        sessionId={props.sessionId}
        sources={sourceProps}
      />
    );
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
