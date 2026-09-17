"use client";

import { getEntity } from "@/lib/offline/db";
import {
  gatherIngredientSlotsOffline,
  resolveIngredientOccurrences,
} from "@/lib/grocery/offline-ingredient-gather";
import {
  diffOccurrences,
  type GroceryListSourceRefreshPreview,
} from "@/lib/grocery/ingredient-gather-core";
import { versionLabel } from "@/lib/dishes/version-note";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { GroceryListViewProps } from "@/lib/grocery/list-view";

/**
 * Offline mirror of `list-service.ts#previewGroceryListSourceRefresh` —
 * same shared `diffOccurrences`/`resolveIngredientOccurrences`
 * (`ingredient-gather-core.ts`) as the online path, sourced from the
 * replica instead of Postgres, so the two can never compute a different
 * diff for the same inputs (docs/OFFLINE_IMPLEMENTATION_PLAN.md §4).
 *
 * Only the "same major line's own highest minor" default-target
 * resolution (§60.4) is reproduced here — an explicit `targetVersionId`
 * pass-through works unconditionally since it's already just an id.
 */
export async function previewGroceryListSourceRefreshOffline(
  listId: string,
  sourceId: string,
  targetVersionId?: string,
): Promise<GroceryListSourceRefreshPreview | { error: string }> {
  const listRecord = await getEntity<GroceryListViewProps>(
    "groceryList",
    listId,
  );
  const list = listRecord?.doc.list;
  if (!list) return { error: "This grocery list isn't available offline yet." };

  const source = list.sources.find((s) => s.id === sourceId);
  if (!source) return { error: "Grocery list source not found." };
  if (!source.dishId || !source.dishVersionId) {
    return {
      error:
        "This source's original Recipe or Part has been deleted and can no longer be refreshed.",
    };
  }

  const dishRecord = await getEntity<DishSnapshotDoc>("dish", source.dishId);
  if (!dishRecord)
    return { error: "This recipe or part isn't available offline yet." };
  const versions = dishRecord.doc.versions;

  const pinned = versions.find((v) => v.id === source.dishVersionId);
  if (!pinned)
    return { error: "The current version isn't available offline yet." };

  let resolvedId = targetVersionId;
  if (!resolvedId) {
    // §60.4 default: the same major line's own highest minor.
    const sameMajor = versions.filter(
      (v) => v.majorVersion === pinned.majorVersion,
    );
    const highestMinor = Math.max(...sameMajor.map((v) => v.minorVersion));
    resolvedId =
      sameMajor.find((v) => v.minorVersion === highestMinor)?.id ??
      source.dishVersionId;
  }
  const targetVersion = versions.find((v) => v.id === resolvedId);
  if (!targetVersion)
    return { error: "Target version not available offline yet." };

  const hasNewerMinor = targetVersion.id !== source.dishVersionId;

  const existingContributions = list.items
    .flatMap((item) => item.contributions)
    .filter((c) => c.groceryListSourceId === sourceId);

  const slots = await gatherIngredientSlotsOffline(
    source.dishId,
    targetVersion.id,
  );
  if (!slots)
    return {
      error: "This recipe or part's content isn't available offline yet.",
    };
  const fresh = resolveIngredientOccurrences(slots, source.scaleFactor);

  const diff = diffOccurrences(existingContributions, fresh);

  return {
    hasNewerMinor,
    targetVersionId: targetVersion.id,
    targetVersionLabel: versionLabel(
      targetVersion.majorVersion,
      targetVersion.minorVersion,
    ),
    ...diff,
  };
}
