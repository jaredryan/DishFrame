"use client";

import { runOrQueueMutation } from "@/lib/offline/mutate";
import { generateClientId } from "@/lib/offline/ids";
import { runIncrementalPull } from "@/lib/offline/sync-engine";
import type { VersionChoiceValue } from "@/lib/dishes/schema";
import type {
  PropagationSelection,
  PropagationOutcome,
} from "@/lib/dishes/service";
import type { PartUsage } from "@/lib/dishes/queries";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";

export type PropagatePartUpdateActionState =
  | { status: "success"; outcomes: PropagationOutcome[] }
  | { status: "error"; message: string };

/**
 * Offline-capable replacement for `propagatePartUpdate` — reproduces the
 * exact online "Update everywhere"/"Choose Recipes and Parts to update"
 * semantics rather than a parallel path
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §1): each selected container still
 * goes through `propagateToOneContainer`'s real version-creation
 * transaction once this mutation syncs, just with a client-generated
 * Version id per container (mirroring `promoteHistoricalVersionOffline`)
 * so its identity is known immediately.
 *
 * Optimistic update, immediately, before sync: the Part's own replicated
 * `detail.usages` entries for the selected containers are patched to the
 * new `targetDishVersionId`, so `<PartUsagePanel>`'s `outOfDateUsages`
 * check (`usage.targetDishVersionId !== currentVersionId`) stops flagging
 * them right away — this *is* "resolving the pending update" from the
 * Part's own page. Each affected container's *own* `content`/`detail`/
 * `cookableUnits` are deliberately left at their pre-propagation values
 * until the mutation actually syncs and a fresh snapshot arrives (a real
 * `buildCookableUnits` re-derivation needs the server) — `runIncrementalPull`
 * is triggered right after a successful sync so that catch-up happens as
 * soon as connectivity allows, without waiting for the next natural pull.
 * Cooking Mode itself is never at risk of starting from this stale preview
 * regardless: `startCookingSession` always re-derives the real checklist
 * server-side from the live DishVersion (§22.4), ignoring whatever the
 * client showed.
 */
export async function propagatePartUpdateOffline(values: {
  partDishId: string;
  newTargetVersionId: string;
  selections: PropagationSelection[];
  bump?: VersionChoiceValue;
}): Promise<PropagatePartUpdateActionState> {
  const selectionsWithClientIds = values.selections.map((selection) => ({
    ...selection,
    clientVersionId: generateClientId(),
  }));

  const result = await runOrQueueMutation({
    op: "dish.propagatePartUpdate",
    entityType: "dish",
    entityId: values.partDishId,
    payload: { ...values, selections: selectionsWithClientIds },
    optimisticDoc: (current: unknown) => {
      const doc = current as DishSnapshotDoc | undefined;
      if (!doc?.detail || !(doc.detail as DishDetailViewProps).hasVersion)
        return current;
      const detail = doc.detail as Extract<
        DishDetailViewProps,
        { hasVersion: true }
      >;
      const selectedContainerIds = new Set(
        selectionsWithClientIds.map((s) => s.containerDishId),
      );
      const usages = (detail.usages ?? []) as PartUsage[];
      return {
        ...doc,
        detail: {
          ...detail,
          usages: usages.map((usage) =>
            selectedContainerIds.has(usage.containerDishId)
              ? { ...usage, targetDishVersionId: values.newTargetVersionId }
              : usage,
          ),
        },
      };
    },
    mutationId: generateClientId(),
  });

  if (!result.ok) return { status: "error", message: result.message };

  void runIncrementalPull().catch(() => {});

  return {
    status: "success",
    outcomes: selectionsWithClientIds.map((selection) => ({
      containerDishId: selection.containerDishId,
      status: "updated" as const,
      newVersionId: selection.clientVersionId,
    })),
  };
}
