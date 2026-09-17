"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { VersionHistoryView } from "@/components/domain/dish/version-history-view";
import { VersionHistoryOfflineView } from "@/components/domain/dish/version-history-offline-view";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import type { ReplicatedVersion } from "@/lib/dishes/version-history-snapshot";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";
import type { VersionHistoryViewProps } from "@/lib/dishes/version-history-page-props";

type ReplicaState = {
  kind: DishKindValue;
  displayTitle: string;
  stage: StageValue;
  currentVersionId: string | null;
  versions: ReplicatedVersion[];
} | null;

/**
 * Chooses between the two Version History renderers based on whether
 * `serverProps` can be trusted for the browser's *real* current URL —
 * see `DishOfflineBoundary`'s doc comment for why identity comes from
 * `useParams()`, not the props themselves (`public/sw.js`'s route-shell
 * fallback can serve a different Dish's or Version's cached payload for
 * this route pattern on a first-ever offline visit).
 *
 * `serverProps: null` covers the proactively-precached neutral shell.
 * Both that and a real navigation served a mismatched shell render the
 * identical `OfflineShellPlaceholder` first — never any field read out of
 * `serverProps` (not even `displayTitle`/`kind`), so hydration never has
 * to reconcile against a different record's content — then the effect
 * below reads the *replica's* own record for the real id and switches to
 * `VersionHistoryOfflineView` once it has enough to render.
 *
 * A genuine match renders the full, richer `VersionHistoryView` (resolved
 * nested PartLink trees, tag/cuisine/Flavor-profile chips) exactly as
 * online — preserving that richer rendering is the point of keeping two
 * renderers instead of collapsing to the simpler one always.
 * `VersionHistoryOfflineView` switches between replicated Versions via
 * local state (`onSelectVersionAction`) instead of a navigation-per-version, so
 * browsing already-replicated history works fully offline once it's
 * showing.
 */
export function VersionHistoryOfflineBoundary({
  serverProps,
}: {
  serverProps: VersionHistoryViewProps | null;
}) {
  const router = useRouter();
  const { dishId: realDishId, versionId: realVersionId } = useParams<{
    dishId: string;
    versionId: string;
  }>();
  const isShellFallback =
    serverProps === null ||
    serverProps.dishId !== realDishId ||
    serverProps.versionId !== realVersionId;

  const [activeVersionId, setActiveVersionId] = React.useState(realVersionId);
  const [replica, setReplica] = React.useState<ReplicaState>(null);

  React.useEffect(() => {
    if (!isShellFallback) return;
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<DishSnapshotDoc>("dish", realDishId);
      if (cancelled) return;
      if (!local) {
        setReplica(null);
        return;
      }
      const detail =
        local.doc.detail && (local.doc.detail as DishDetailViewProps).hasVersion
          ? (local.doc.detail as Extract<
              DishDetailViewProps,
              { hasVersion: true }
            >)
          : null;
      setReplica({
        kind: local.doc.kind,
        displayTitle: detail?.displayTitle ?? "",
        stage: local.doc.stage as StageValue,
        currentVersionId: local.doc.currentVersionId,
        versions: local.doc.versions,
      });
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realDishId, isShellFallback]);

  if (!isShellFallback) {
    return <VersionHistoryView {...serverProps} />;
  }

  if (!replica) {
    return <OfflineShellPlaceholder />;
  }

  function handleSelectVersion(versionId: string) {
    setActiveVersionId(versionId);
    // Best-effort — keeps the URL shareable/bookmarkable when online, but
    // the view above already renders from local state regardless of
    // whether this navigation actually completes.
    router.replace(
      `${dishBasePath(replica!.kind)}/${realDishId}/versions/${versionId}`,
      {
        scroll: false,
      },
    );
  }

  return (
    <VersionHistoryOfflineView
      dishId={realDishId}
      kind={replica.kind}
      displayTitle={replica.displayTitle}
      stage={replica.stage}
      currentVersionId={replica.currentVersionId}
      versions={replica.versions}
      activeVersionId={activeVersionId}
      onSelectVersionAction={handleSelectVersion}
    />
  );
}
