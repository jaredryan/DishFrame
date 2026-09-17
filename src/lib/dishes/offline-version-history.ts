"use client";

import { runOrQueueMutation } from "@/lib/offline/mutate";
import { generateClientId } from "@/lib/offline/ids";
import { getEntity } from "@/lib/offline/db";
import type { DishKindValue, DishActionState } from "@/lib/dishes/schema";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { ReplicatedVersion } from "@/lib/dishes/version-history-snapshot";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";

export async function listReplicatedVersions(
  dishId: string,
): Promise<ReplicatedVersion[]> {
  const record = await getEntity<DishSnapshotDoc>("dish", dishId);
  return record?.doc.versions ?? [];
}

/** Offline equivalent of `listDishVersionOptions` — every field it needs
 * (`id`, `majorVersion`, `minorVersion`, `yieldQuantity`, `yieldUnit`) is
 * already part of the replicated `DishSnapshotDoc.versions`
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §2/§5). */
export async function listDishVersionOptionsOffline(dishId: string): Promise<
  | {
      status: "success";
      versions: Array<{
        id: string;
        majorVersion: number;
        minorVersion: number;
        yieldQuantity: number | null;
        yieldUnit: string | null;
      }>;
      currentVersionId: string | null;
    }
  | { status: "error"; message: string }
> {
  const record = await getEntity<DishSnapshotDoc>("dish", dishId);
  if (!record) {
    return {
      status: "error",
      message: "This item isn't available offline yet.",
    };
  }
  return {
    status: "success",
    versions: record.doc.versions.map((v) => ({
      id: v.id,
      majorVersion: v.majorVersion,
      minorVersion: v.minorVersion,
      yieldQuantity: v.yieldQuantity,
      yieldUnit: v.yieldUnit,
    })),
    currentVersionId: record.doc.currentVersionId,
  };
}

/**
 * Offline-capable replacement for `promoteHistoricalVersion` — mints a
 * `clientVersionId` the same way `saveDishOffline`'s create path does, so
 * the new Version's identity is known immediately rather than only once
 * the mutation syncs. Preserves the *promotion* semantics exactly
 * (`dish.promoteVersion`'s sync-op handler calls the same
 * `promoteHistoricalVersion` service function with this id — a verbatim
 * content copy, never a parallel "create" or "edit" path).
 *
 * The optimistic patch updates `currentVersionId` and rebuilds `detail`'s
 * ingredients/instructions/metadata from the replicated historical
 * Version immediately (docs/OFFLINE_IMPLEMENTATION_PLAN.md §2's "update
 * the local current Recipe/Part immediately"); nested PartLink content and
 * the editor's own `content`/`cookableUnits` fields stay at their
 * pre-promotion values until the mutation actually syncs and a fresh full
 * snapshot arrives — the same scoped fidelity gap `version-history-
 * snapshot.ts` documents for viewing.
 */
export async function promoteHistoricalVersionOffline(
  kind: DishKindValue,
  values: { dishId: string; versionId: string },
): Promise<DishActionState> {
  const clientVersionId = generateClientId();
  const existing = await getEntity<DishSnapshotDoc>("dish", values.dishId);
  const promoted = existing?.doc.versions.find(
    (v) => v.id === values.versionId,
  );

  const result = await runOrQueueMutation({
    op: "dish.promoteVersion",
    entityType: "dish",
    entityId: values.dishId,
    payload: { ...values, kind, clientVersionId },
    optimisticDoc: (current: unknown) => {
      const doc = current as DishSnapshotDoc | undefined;
      if (!doc || !promoted) return current;
      const priorDetail =
        doc.detail && (doc.detail as DishDetailViewProps).hasVersion
          ? (doc.detail as Extract<DishDetailViewProps, { hasVersion: true }>)
          : null;
      const highestMajor = doc.versions.reduce(
        (max, v) => Math.max(max, v.majorVersion),
        0,
      );
      // So Version History can navigate straight to the just-promoted
      // Version offline too, not only the Dish's own detail page — a
      // verbatim copy of the promoted content under the new id, matching
      // `promoteHistoricalVersion`'s actual semantics exactly.
      const newVersion: ReplicatedVersion = {
        ...promoted,
        id: clientVersionId,
        majorVersion: highestMajor + 1,
        minorVersion: 0,
        sourceVersionId: promoted.id,
        createdAt: new Date().toISOString(),
      };
      return {
        ...doc,
        currentVersionId: clientVersionId,
        versions: [...doc.versions, newVersion],
        detail: priorDetail
          ? {
              ...priorDetail,
              currentVersionId: clientVersionId,
              versionLabel: `V${highestMajor + 1}.0`,
              description: promoted.description,
              yieldQuantity: promoted.yieldQuantity,
              yieldUnit: promoted.yieldUnit,
              prepTimeMinutes: promoted.prepTimeMinutes,
              cookTimeMinutes: promoted.cookTimeMinutes,
              difficulty: promoted.difficulty,
              nutrition: promoted.nutrition,
              imageAssetId: promoted.imageAssetId,
              sections: promoted.sections.map((section) => ({
                id: section.id,
                position: section.position,
                name: section.name,
                guidanceNote: section.guidanceNote,
                ingredients: section.ingredients,
                instructions: section.instructions,
                // Nested Part content isn't resolved offline (plain
                // references only) — shown once the promotion syncs.
                partLinks: [],
              })),
              topLevelPartLinks: [],
            }
          : doc.detail,
      };
    },
    mutationId: clientVersionId,
  });
  if (!result.ok) return { status: "error", message: result.message };
  return {
    status: "success",
    dishId: values.dishId,
    versionId: clientVersionId,
  };
}
