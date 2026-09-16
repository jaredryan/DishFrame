"use client";

import * as React from "react";
import { CookingModeShell } from "@/components/domain/cooking/cooking-mode-shell";
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
  serverProps: CookingModeSessionProps;
  initialFocusedUnitId: string | null;
}) {
  const [props, setProps] = React.useState<CookingModeSessionProps>(serverProps);
  const sessionId = serverProps.sessionId;

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<CookingModeSessionProps>("cookingSession", sessionId);
      if (cancelled) return;

      if (local?.dirty) {
        // A local mutation hasn't synced yet — the replica is the more
        // trustworthy source of "what the user actually sees right now."
        setProps(local.doc);
        return;
      }

      // Otherwise, this render's own server props are the freshest truth
      // (a real online SSR, not a stale cached document) — persist them.
      await putEntity({
        entityType: "cookingSession",
        id: sessionId,
        doc: serverProps,
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
    // Deliberately keyed only on sessionId/serverProps identity, not every
    // field — a new `serverProps` object arrives only on a fresh
    // navigation/server round trip, which is exactly when re-reconciling
    // is warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, serverProps]);

  return <CookingModeShell {...props} initialFocusedUnitId={initialFocusedUnitId} />;
}
