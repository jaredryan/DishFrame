"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { CookingModeShell } from "@/components/domain/cooking/cooking-mode-shell";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type { CookingModeSessionProps } from "@/lib/cooking/session-view";

/**
 * The offline "document/app bootstrap" the plan calls for, specifically
 * for Cooking Mode: a cached server-rendered HTML shell (served by the
 * service worker's `dishframe-documents` cache when the network is down)
 * is a snapshot from whenever it was last cached — it cannot know about a
 * checklist toggle or timer start made locally since. This component reads
 * the live local replica on every mount/sync event and re-renders
 * `CookingModeShell` from *that* whenever it's newer or has unsynced
 * changes, rather than trusting the server props baked into the page.
 *
 * Identity comes from `useParams()`, not `serverProps.sessionId` — see
 * `DishOfflineBoundary`'s doc comment for why (`public/sw.js`'s route-
 * shell fallback can serve a *different* session's cached payload for
 * this route pattern on a first-ever offline visit to an unfamiliar
 * sessionId). When the ids disagree, only the replica's own record for
 * the real session is ever shown, falling back to a plain "not available
 * offline" message.
 *
 * The reverse direction matters too: a fresh, online server render is the
 * best available truth, so its props are written into the replica (unless
 * the replica is currently `dirty`, meaning a local mutation hasn't synced
 * yet and would otherwise be clobbered by a server snapshot that predates
 * it) — every visit to this page keeps the offline replica current, with
 * no separate "save for offline" step.
 */
export function CookingModeOfflineBoundary({
  serverProps,
  initialFocusedUnitId,
}: {
  serverProps: CookingModeSessionProps | null;
  initialFocusedUnitId: string | null;
}) {
  const { sessionId: realSessionId } = useParams<{ sessionId: string }>();
  const isShellFallback =
    serverProps === null || serverProps.sessionId !== realSessionId;
  const [props, setProps] = React.useState<CookingModeSessionProps | null>(
    isShellFallback ? null : serverProps,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<CookingModeSessionProps>(
        "cookingSession",
        realSessionId,
      );
      if (cancelled) return;

      if (isShellFallback) {
        setProps(local?.doc ?? null);
        return;
      }

      if (local?.dirty) {
        // A local mutation hasn't synced yet — the replica is the more
        // trustworthy source of "what the user actually sees right now."
        setProps(local.doc);
        return;
      }

      // Otherwise, this render's own server props are the freshest truth
      // (a real online SSR, not a stale cached document) — persist them.
      // This page never computes `reviewProps` (it's Session Review's own
      // field, added to every mutation's `snapshotResult` in `offline-
      // sync/cooking.ts` — see `session-review-view.ts`), so it's carried
      // over from whatever's already in the replica rather than dropped.
      await putEntity({
        entityType: "cookingSession",
        id: realSessionId,
        doc: {
          ...serverProps,
          reviewProps: (local?.doc as { reviewProps?: unknown } | undefined)
            ?.reviewProps,
        },
        serverRevision: new Date().toISOString(),
        localUpdatedAt: new Date().toISOString(),
        dirty: false,
        conflict: null,
      });
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
    <CookingModeShell {...props} initialFocusedUnitId={initialFocusedUnitId} />
  );
}
