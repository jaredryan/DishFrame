"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { VersionCompareContent } from "@/components/domain/dish/version-compare-content";
import { VersionCompareOfflineView } from "@/components/domain/dish/version-compare-offline-view";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import {
  compareVersionsOffline,
  type OfflineCompareResult,
} from "@/lib/dishes/offline-version-compare";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";
import type { VersionCompareViewProps } from "@/lib/dishes/version-compare-page-props";

type ReplicaState = {
  kind: DishKindValue;
  displayTitle: string;
  compare: OfflineCompareResult;
} | null;

/**
 * Chooses between the two Compare Versions renderers based on whether
 * `serverProps` can be trusted for the browser's *real* current URL — same
 * identity/hydration-safety pattern as `VersionHistoryOfflineBoundary` (see
 * its doc comment). `serverProps: null` covers the proactively-precached
 * neutral shell; both that and a real navigation served a mismatched shell
 * render the identical `OfflineShellPlaceholder` first, never a field off
 * `serverProps`.
 *
 * A genuine match renders the richer `VersionCompareContent` (server-
 * resolved historical PartLink display info, `resolvePartLinkDisplayInfo`)
 * exactly as online. The offline path reuses the exact same pure
 * `compareDishVersions` core (`offline-version-compare.ts`) against
 * replicated `DishSnapshotDoc.versions`, and drives from/to selection via
 * local state instead of a `router.push`-per-change navigation, so
 * switching versions works fully offline once this is showing.
 */
export function VersionCompareOfflineBoundary({
  serverProps,
}: {
  serverProps: VersionCompareViewProps | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { dishId: realDishId } = useParams<{ dishId: string }>();
  const isShellFallback =
    serverProps === null || serverProps.dishId !== realDishId;

  const [fromId, setFromId] = React.useState<string | undefined>(
    searchParams.get("from") ?? undefined,
  );
  const [toId, setToId] = React.useState<string | undefined>(
    searchParams.get("to") ?? undefined,
  );
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
      let compare = await compareVersionsOffline(
        realDishId,
        local.doc.currentVersionId,
        fromId,
        toId,
      );
      if (compare === null && (fromId || toId)) {
        // Stale/invalid ?from=&to= (e.g. a version that no longer exists
        // locally) — fall back to the default pair rather than getting stuck.
        compare = await compareVersionsOffline(
          realDishId,
          local.doc.currentVersionId,
          undefined,
          undefined,
        );
      }
      if (cancelled) return;
      setReplica({
        kind: local.doc.kind,
        displayTitle: detail?.displayTitle ?? "",
        compare,
      });
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realDishId, isShellFallback, fromId, toId]);

  if (!isShellFallback) {
    return <VersionCompareContent {...serverProps} />;
  }

  if (!replica) {
    return <OfflineShellPlaceholder />;
  }

  const basePath = dishBasePath(replica.kind);
  const collectionLabel = replica.kind === "PART" ? "Parts" : "Recipes";
  const breadcrumbItems = [
    { label: collectionLabel, href: basePath },
    { label: replica.displayTitle, href: `${basePath}/${realDishId}` },
    { label: "Compare versions" },
  ];

  if (!replica.compare || !replica.compare.hasEnoughVersions) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Breadcrumbs items={breadcrumbItems} />
        <p className="text-muted-foreground">
          {replica.compare
            ? `Nothing to compare yet — this ${replica.kind === "PART" ? "part" : "recipe"} only has one version.`
            : "This item isn't available offline yet."}
        </p>
      </div>
    );
  }

  function navigate(nextFrom: string, nextTo: string) {
    setFromId(nextFrom);
    setToId(nextTo);
    // Best-effort — keeps the URL shareable/bookmarkable when online, but
    // the view above already renders from local state regardless of
    // whether this navigation actually completes.
    router.replace(
      `${basePath}/${realDishId}/compare?from=${nextFrom}&to=${nextTo}`,
      {
        scroll: false,
      },
    );
  }

  return (
    <VersionCompareOfflineView
      kind={replica.kind}
      dishId={realDishId}
      displayTitle={replica.displayTitle}
      compare={replica.compare}
      onSelectFromAction={(id) =>
        navigate(
          id,
          replica.compare!.hasEnoughVersions ? replica.compare!.toId : id,
        )
      }
      onSelectToAction={(id) =>
        navigate(
          replica.compare!.hasEnoughVersions ? replica.compare!.fromId : id,
          id,
        )
      }
    />
  );
}
