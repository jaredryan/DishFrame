"use client";

import { getEntity } from "@/lib/offline/db";
import {
  consolidateSources,
  suggestConsolidatedOrder,
} from "@/lib/cooking/consolidation";
import {
  toConsolidatedSetupUnits,
  type ConsolidatedSetupUnit,
} from "@/lib/cooking/setup-units";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";
import type { MultiSourceSetupSourceDto } from "@/lib/cooking/actions";

/**
 * Offline equivalent of `getMultiSourceSetupData` — reads each selected
 * source's own replicated `DishSnapshotDoc` instead of querying Postgres,
 * then reuses the exact same pure `consolidateSources`/
 * `suggestConsolidatedOrder`/`toConsolidatedSetupUnits` functions the
 * online path calls, so consolidation never disagrees between the two.
 *
 * Scoped like every other offline preview in this codebase: `cookableUnits`
 * is only ever replicated for a Dish's *current* Version
 * (`offline-sync/dishes.ts`'s `buildDishSnapshot`), so offline Setup can
 * only offer each source's current Version — no offline Version switcher.
 * Starting the session still always re-derives everything server-side once
 * the creation mutation syncs (§22.4's "never trusted from the client"),
 * exactly like the online path.
 */
export async function getMultiSourceSetupDataOffline(
  dishIds: string[],
): Promise<
  | {
      status: "success";
      sources: MultiSourceSetupSourceDto[];
      units: ConsolidatedSetupUnit[];
    }
  | { status: "error"; message: string }
> {
  if (dishIds.length === 0) {
    return { status: "error", message: "Select at least one Recipe or Part." };
  }

  const records = await Promise.all(
    dishIds.map((dishId) => getEntity<DishSnapshotDoc>("dish", dishId)),
  );

  const sources: MultiSourceSetupSourceDto[] = [];
  for (const record of records) {
    const doc = record?.doc;
    if (!doc || !doc.currentVersionId) {
      return {
        status: "error",
        message: "One of these items isn't available offline yet.",
      };
    }
    const detail =
      doc.detail && (doc.detail as DishDetailViewProps).hasVersion
        ? (doc.detail as Extract<DishDetailViewProps, { hasVersion: true }>)
        : null;
    const currentVersion = doc.versions.find(
      (v) => v.id === doc.currentVersionId,
    );
    sources.push({
      dishId: doc.id,
      dishKind: doc.kind,
      dishTitle: detail?.displayTitle || "Untitled",
      dishVersionId: doc.currentVersionId,
      versionLabel: detail?.versionLabel ?? "—",
      isCurrent: true,
      currentVersionId: doc.currentVersionId,
      versions: currentVersion
        ? [
            {
              id: currentVersion.id,
              majorVersion: currentVersion.majorVersion,
              minorVersion: currentVersion.minorVersion,
            },
          ]
        : [],
      outputQuantity: detail?.yieldQuantity ?? null,
      outputUnit: detail?.yieldUnit ?? null,
    });
  }

  const consolidated = consolidateSources(
    records.map((record) => ({
      cookableUnits: record!.doc.cookableUnits,
      scaleFactor: null,
    })),
  );
  const units = toConsolidatedSetupUnits(
    suggestConsolidatedOrder(consolidated),
    sources.map((s) => s.dishTitle),
  );

  return { status: "success", sources, units };
}
