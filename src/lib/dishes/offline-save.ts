"use client";

import { generateClientId } from "@/lib/offline/ids";
import { runOrQueueMutation } from "@/lib/offline/mutate";
import { getEntity } from "@/lib/offline/db";
import type { DishActionState } from "@/lib/dishes/schema";
import type { DishFormValues } from "@/components/domain/dish/dish-form-values";
import type { DishKindValue, VersionChoiceValue } from "@/lib/dishes/schema";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";

/**
 * Offline-capable replacement for calling `createDish`/`editDish` (the
 * Server Actions) directly from `DishEditor` — routes through the stable
 * `/api/sync/dishes` contract instead (docs/OFFLINE_IMPLEMENTATION_PLAN.md:
 * "do not queue raw Server Action requests"), online or off, so there's
 * exactly one code path instead of an online one plus a separate offline
 * fallback. Returns the same `DishActionState` shape `DishEditor` already
 * expects from those actions.
 */
export async function saveDishOffline(
  kind: DishKindValue,
  existing: { id: string; baseVersionId: string } | null,
  content: DishFormValues,
  versionChoice?: VersionChoiceValue,
  // Import metadata (docs/OFFLINE_IMPLEMENTATION_PLAN.md §7) — only ever
  // set by `paste-import-flow.tsx`'s offline fallback, applied server-side
  // once this queued `dish.create` mutation actually reaches the sync API
  // (`offline-sync/dishes.ts`), the same way `confirmImport`/
  // `confirmImportBatch` apply it online. Ignored for an edit (`existing`
  // set) — import attribution only ever applies to a brand-new Dish.
  importMetadata?: {
    sourceTitle?: string;
    cuisineGuessName?: string | null;
    tagIds?: string[];
    flavorProfileIds?: string[];
    cuisineIds?: string[];
  },
): Promise<DishActionState> {
  if (!existing) {
    const clientDishId = generateClientId();
    const clientVersionId = generateClientId();
    const optimisticDoc: DishSnapshotDoc = {
      id: clientDishId,
      kind,
      stage: content.stage,
      archivedAt:
        content.stage === "ARCHIVED" ? new Date().toISOString() : null,
      currentVersionId: clientVersionId,
      defaultScale: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      currentStructuralSearchText: null,
      // Best-effort local preview — the guessed Cuisine name isn't
      // resolved to an id until this mutation syncs (see `dish.create`'s
      // sync-op handler), so it can't be reflected here yet; already-
      // resolved batch-mapped ids are shown immediately.
      tagIds: importMetadata?.tagIds ?? [],
      cuisineIds: [
        ...new Set([
          ...content.cuisineIds,
          ...(importMetadata?.cuisineIds ?? []),
        ]),
      ],
      flavorProfileValueIds: importMetadata?.flavorProfileIds ?? [],
      content,
      detail: null,
      cookableUnits: [],
      versions: [],
    };
    const result = await runOrQueueMutation({
      op: "dish.create",
      entityType: "dish",
      entityId: clientDishId,
      payload: {
        clientDishId,
        clientVersionId,
        kind,
        content,
        importSourceTitle: importMetadata?.sourceTitle,
        importCuisineGuessName: importMetadata?.cuisineGuessName,
        importTagIds: importMetadata?.tagIds,
        importFlavorProfileIds: importMetadata?.flavorProfileIds,
        importCuisineIds: importMetadata?.cuisineIds,
      },
      optimisticDoc,
      mutationId: clientDishId,
    });
    if (!result.ok) return { status: "error", message: result.message };
    return {
      status: "success",
      dishId: clientDishId,
      versionId: clientVersionId,
    };
  }

  // Coalesce multiple offline edits to the same Dish into one queued
  // mutation (a deterministic, dish-scoped id rather than a fresh one per
  // save) — the underlying IndexedDB `put` naturally replaces the pending
  // edit's payload with the latest content rather than queuing two edits
  // against the same `baseVersionId`, which the server's optimistic-
  // concurrency check would otherwise reject as a conflict the moment the
  // first one applied.
  const mutationId = `dish-edit:${existing.id}`;
  const current = await getEntity<DishSnapshotDoc>("dish", existing.id);
  const optimisticDoc: DishSnapshotDoc = current?.doc
    ? { ...current.doc, content }
    : {
        id: existing.id,
        kind,
        stage: content.stage,
        archivedAt: null,
        currentVersionId: existing.baseVersionId,
        defaultScale: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        currentStructuralSearchText: null,
        tagIds: [],
        cuisineIds: content.cuisineIds,
        flavorProfileValueIds: [],
        content,
        detail: null,
        cookableUnits: [],
        versions: [],
      };

  const result = await runOrQueueMutation({
    op: "dish.edit",
    entityType: "dish",
    entityId: existing.id,
    payload: {
      dishId: existing.id,
      baseVersionId: existing.baseVersionId,
      kind,
      content,
      versionChoice,
    },
    optimisticDoc,
    mutationId,
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", dishId: existing.id };
}
