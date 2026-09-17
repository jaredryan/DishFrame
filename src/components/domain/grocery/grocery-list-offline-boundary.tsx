"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { GroceryListDetailView } from "@/components/domain/grocery/grocery-list-detail-view";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type { GroceryListViewProps } from "@/lib/grocery/list-view";

/**
 * Same "offline document bootstrap" pattern as
 * `CookingModeOfflineBoundary`/`MealPlanOfflineBoundary`: a cached
 * server-rendered document is a snapshot from whenever it was cached, so
 * this re-reads the live local replica on mount/sync activity and renders
 * from it whenever it's newer (dirty — an unsynced local change) than
 * whatever this render's own server props show, and otherwise persists
 * the fresh server props into the replica.
 *
 * Identity comes from `useParams()`, not `serverProps.list.id` — see
 * `DishOfflineBoundary`'s doc comment for why (`public/sw.js`'s route-
 * shell fallback can serve a different list's cached payload for this
 * route pattern on a first-ever offline visit). When the ids disagree,
 * only the replica's own record for the real id is ever shown.
 */
export function GroceryListOfflineBoundary({
  serverProps,
}: {
  serverProps: GroceryListViewProps | null;
}) {
  const { id: realListId } = useParams<{ id: string }>();
  const isShellFallback =
    serverProps === null || serverProps.list.id !== realListId;
  const [props, setProps] = React.useState<GroceryListViewProps | null>(
    isShellFallback ? null : serverProps,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<GroceryListViewProps>(
        "groceryList",
        realListId,
      );
      if (cancelled) return;

      if (isShellFallback || !serverProps) {
        setProps(local?.doc ?? null);
        return;
      }

      // `dirty` alone doesn't tell us whether the local edit is still
      // actually in flight for *this* session, or a previous attempt that
      // got interrupted mid-request (e.g. a hard navigation right after
      // the click — see `mutate.ts`'s `runOrQueueMutation`) and is simply
      // sitting stale until its retry lease expires. In the latter case,
      // trusting `local.doc` forever would hide genuinely newer server
      // truth (e.g. a Meal-Plan-driven resync) behind a snapshot from
      // before that resync happened. A fine-grained optimistic patch (e.g.
      // `toggleGroceryItem`'s `patchItem`) only touches the one item it
      // changed, never `list.updatedAt` itself — so a *strictly* newer
      // server `updatedAt` can only mean the server has moved past
      // whatever this local doc reflects (a real external change since
      // then), never a false positive against a genuine, still-pending
      // offline edit of the same list (that comparison stays equal, so it
      // still falls through to trusting `local.doc` below).
      const localUpdatedAt = (local?.doc as GroceryListViewProps | undefined)
        ?.list.updatedAt;
      const serverIsNewer =
        localUpdatedAt !== undefined &&
        serverProps.list.updatedAt > localUpdatedAt;
      if (local?.dirty && !serverIsNewer) {
        setProps(local.doc);
        return;
      }

      await putEntity({
        entityType: "groceryList",
        id: realListId,
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
  }, [realListId, isShellFallback, serverProps]);

  if (!props) {
    return <OfflineShellPlaceholder />;
  }

  return (
    <GroceryListDetailView
      list={props.list}
      categoryOptions={props.categoryOptions}
      sourceCandidates={props.sourceCandidates}
    />
  );
}
