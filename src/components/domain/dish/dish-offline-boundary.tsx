"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { DishDetailView } from "@/components/domain/dish/dish-detail-view";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity, putEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";

/**
 * Same "offline document bootstrap" pattern as `CookingModeOfflineBoundary`/
 * `MealPlanOfflineBoundary`/`GroceryListOfflineBoundary`, adapted for the
 * "dish" entity's replica doc (`DishSnapshotDoc`), which also carries the
 * editor's `content` and `cookableUnits` — this boundary only ever reads or
 * patches the doc's `detail` field, leaving the rest of the replicated
 * record untouched.
 *
 * `serverProps` is `null` for two distinct cases, both handled identically
 * (render the neutral, prop-less `OfflineShellPlaceholder`, never a
 * mismatched record's real content):
 * - the proactively-precached neutral shell (`OFFLINE_SHELL_SENTINEL` —
 *   the page itself passes `null` for that dishId, before any auth/data
 *   fetch), so `public/sw.js` has *something* content-free to serve for a
 *   genuinely first-ever offline visit to this route pattern;
 * - a real navigation whose exact URL wasn't cached, served the *sentinel
 *   shell* by `public/sw.js`'s route-shell fallback — that cached response
 *   also rendered with `serverProps: null`, so hydration always agrees
 *   with what was server-rendered; only this effect's own replica lookup
 *   (keyed off `useParams()`, the browser's real URL, never anything
 *   embedded in the payload) can then reveal real content.
 *
 * Identity beyond that null check also comes from `useParams()`, not
 * `serverProps.dishId` — a real Dish's own shell (cached opportunistically
 * for a *different*, real dishId under the exact-URL key) is never reused
 * across ids by the service worker, but this still guards defensively:
 * mismatched embedded ids never render as if they were the real one.
 *
 * A queued `dish.edit` doesn't optimistically recompute `detail` (that
 * would mean reimplementing the detail page's read-side aggregation
 * client-side just for an instant preview — see `lib/dishes/offline-
 * save.ts`), so while the entity is `dirty` this renders the last-known
 * `detail` snapshot (pre-edit for an existing Dish, or nothing yet for a
 * Dish created offline and not yet synced) rather than a live preview of
 * the unsynced edit.
 */
export function DishOfflineBoundary({
  serverProps,
}: {
  serverProps: DishDetailViewProps | null;
}) {
  const { dishId: realDishId } = useParams<{ dishId: string }>();
  const isShellFallback =
    serverProps === null || serverProps.dishId !== realDishId;
  const [props, setProps] = React.useState<DishDetailViewProps | null>(
    isShellFallback ? null : serverProps,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<DishSnapshotDoc>("dish", realDishId);
      if (cancelled) return;

      if (isShellFallback) {
        // Never trust `serverProps` here — only the replica's own record
        // for the real id.
        setProps(
          local?.doc.detail ? (local.doc.detail as DishDetailViewProps) : null,
        );
        return;
      }

      if (local?.dirty && local.doc.detail) {
        setProps(local.doc.detail as DishDetailViewProps);
        return;
      }

      if (local) {
        await putEntity({
          ...local,
          doc: { ...local.doc, detail: serverProps },
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
  }, [realDishId, isShellFallback, serverProps]);

  if (!props) {
    return <OfflineShellPlaceholder />;
  }

  return <DishDetailView {...props} />;
}
