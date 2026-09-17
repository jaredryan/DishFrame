"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  CookingSetup,
  type CookingSetupProps,
} from "@/components/domain/cooking/cooking-setup";
import { toSetupUnits } from "@/lib/cooking/setup-units";
import { OfflineShellPlaceholder } from "@/components/offline/offline-shell-placeholder";
import { getEntity } from "@/lib/offline/db";
import { onSyncActivity } from "@/lib/offline/sync-engine";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";

/**
 * Same "offline document bootstrap" pattern as `DishOfflineBoundary` —
 * adapted for the checklist preview only. The replicated `cookableUnits`
 * only ever covers the Dish's *current* Version (`DishSnapshotDoc`'s doc
 * comment), so this only ever substitutes them in when the Version this
 * Setup screen is showing matches the replica's `currentVersionId` —
 * viewing Setup for a historical Version, like the rest of Version
 * History, stays a "requires connection" boundary.
 *
 * `serverProps: null` covers both the proactively-precached neutral shell
 * and a real navigation served that same shell by `public/sw.js`'s
 * route-shell fallback — see `DishOfflineBoundary`'s doc comment for the
 * full reasoning (both cases render the identical `OfflineShellPlaceholder`
 * so hydration never has to reconcile against a different record's
 * content). Identity beyond that comes from `useParams()`, never
 * `serverProps.dishId`.
 *
 * `cookableUnits` isn't recomputed by a queued `dish.edit`'s optimistic
 * patch (`lib/dishes/offline-save.ts` — it would mean reimplementing
 * `buildCookableUnits`' enumeration client-side just for a preview), so
 * while the entity is `dirty` this still only shows the last-synced
 * checklist, not a live preview of the unsynced edit — same accepted
 * "provisional preview" scope §1 of the offline plan already documents
 * for Cooking Mode's own use of this same field.
 */
export function CookingSetupOfflineBoundary({
  serverProps,
}: {
  serverProps: CookingSetupProps | null;
}) {
  const { dishId: realDishId } = useParams<{ dishId: string }>();
  const isShellFallback =
    serverProps === null || serverProps.dishId !== realDishId;
  const [state, setState] = React.useState<CookingSetupProps | null>(
    isShellFallback ? null : serverProps,
  );

  React.useEffect(() => {
    let cancelled = false;

    async function reconcile() {
      const local = await getEntity<DishSnapshotDoc>("dish", realDishId);
      if (cancelled) return;

      if (isShellFallback) {
        if (!local || !local.doc.currentVersionId) {
          setState(null);
          return;
        }
        setState({
          dishId: local.doc.id,
          dishKind: local.doc.kind,
          dishVersionId: local.doc.currentVersionId,
          dishTitle: local.doc.content?.title ?? "Untitled",
          versionLabel: "",
          isCurrent: true,
          currentVersionId: local.doc.currentVersionId,
          versions: [],
          units: toSetupUnits(local.doc.cookableUnits),
          sourceOutputQuantity: local.doc.content?.yieldQuantity ?? null,
          sourceOutputUnit: local.doc.content?.yieldUnit ?? null,
          cancelHref: `${dishBasePath(local.doc.kind)}/${local.doc.id}`,
        });
        return;
      }

      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const viewingCurrentVersion =
        local?.doc.currentVersionId === serverProps.dishVersionId;

      if (viewingCurrentVersion && (local?.dirty || offline)) {
        setState({
          ...serverProps,
          units: toSetupUnits(local!.doc.cookableUnits),
        });
        return;
      }
      setState(serverProps);
    }

    void reconcile();
    const unsubscribe = onSyncActivity(() => void reconcile());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [realDishId, isShellFallback, serverProps]);

  if (!state) {
    return <OfflineShellPlaceholder />;
  }

  return <CookingSetup key={state.dishVersionId} {...state} />;
}
