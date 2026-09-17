"use client";

import { groceryMutate } from "@/lib/grocery/offline-mutate";
import { runOrQueueMutation } from "@/lib/offline/mutate";
import { getEntity, putEntity } from "@/lib/offline/db";
import { generateClientId } from "@/lib/offline/ids";
import {
  previewMealPlanGroceryListSyncOffline,
  resyncMealPlanGroceryListOffline,
} from "@/lib/grocery/offline-mealplan-resync";
import { previewMealPlanGroceryListSync as previewMealPlanGroceryListSyncOnline } from "@/lib/mealplans/actions";
import type {
  ActionState,
  GroceryListItemDto,
} from "@/lib/grocery/list-schema";
import type { ActionState as MealPlanActionState } from "@/lib/mealplans/schema";
import type { GroceryListDetailDto } from "@/lib/grocery/list-schema";
import type {
  GroceryListResyncSummary,
  GroceryListSyncReconciliationCandidate,
} from "@/lib/grocery/list-service";

/**
 * Drop-in, offline-capable replacements for `@/lib/grocery/list-actions`'
 * Server Actions — same names, same call signatures, same `ActionState`
 * return shape, so `<GroceryListDetailView>`'s existing call sites don't
 * need to change at all. Each routes through `groceryMutate`
 * (`runOrQueueMutation` under the hood), which tries `/api/sync/grocery`
 * online and falls back to the offline queue otherwise — see
 * docs/OFFLINE_IMPLEMENTATION_PLAN.md.
 *
 * Optimistic patches are best-effort: the common, high-frequency
 * interactions (toggle, add, edit, remove, recategorize, reorder) patch
 * the replicated list precisely; the rarer consolidation/source actions
 * (combine/uncombine/select-variant/add-remove-source) patch nothing
 * (return the doc unchanged) and rely on the real snapshot arriving once
 * synced — never a visual regression, just no instant update for an
 * infrequent action while offline.
 */

function noopPatch(list: GroceryListDetailDto): GroceryListDetailDto {
  return list;
}

export async function generateGroceryList(values: {
  title: string;
  plannedDate: Date;
  sources: Array<{
    dishId: string;
    dishVersionId?: string;
    scaleFactor: number;
  }>;
}): Promise<
  { status: "success"; listId: string } | { status: "error"; message: string }
> {
  const clientListId = generateClientId();
  const result = await runOrQueueMutation({
    op: "grocery.create",
    entityType: "groceryList",
    entityId: clientListId,
    payload: { ...values, clientListId },
    optimisticDoc: (current: unknown) => current,
    mutationId: generateClientId(),
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", listId: clientListId };
}

function patchItem(
  list: GroceryListDetailDto,
  itemId: string,
  patch: Partial<GroceryListItemDto>,
): GroceryListDetailDto {
  return {
    ...list,
    items: list.items.map((item) =>
      item.id === itemId ? { ...item, ...patch } : item,
    ),
  };
}

export async function toggleGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.toggleItem",
    values.listId,
    values,
    (list) => {
      const item = list.items.find((i) => i.id === values.itemId);
      const nowChecked = !item?.checkedAt;
      return patchItem(list, values.itemId, {
        checkedAt: nowChecked ? new Date().toISOString() : null,
      });
    },
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function addManualGroceryItem(values: {
  listId: string;
  name: string;
  quantityText?: string | null;
  unit?: string | null;
  categoryId?: string | null;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.addManualItem",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function editGroceryItem(values: {
  listId: string;
  itemId: string;
  name?: string;
  quantityText?: string | null;
  unit?: string | null;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.editItem",
    values.listId,
    values,
    (list) =>
      patchItem(list, values.itemId, {
        ...(values.name !== undefined ? { name: values.name } : {}),
        ...(values.quantityText !== undefined
          ? { quantityText: values.quantityText }
          : {}),
        ...(values.unit !== undefined ? { unit: values.unit } : {}),
      }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function removeGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.removeItem",
    values.listId,
    values,
    (list) => ({
      ...list,
      items: list.items.filter((item) => item.id !== values.itemId),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function recategorizeGroceryItem(values: {
  listId: string;
  itemId: string;
  categoryId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.recategorizeItem",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function reorderGroceryListItems(values: {
  listId: string;
  orderedItemIds: string[];
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.reorderItems",
    values.listId,
    values,
    (list) => {
      const positionById = new Map(
        values.orderedItemIds.map((id, index) => [id, index]),
      );
      return {
        ...list,
        items: list.items.map((item) =>
          positionById.has(item.id)
            ? { ...item, position: positionById.get(item.id)! }
            : item,
        ),
      };
    },
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function uncombineGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.uncombineItem",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function combineGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.combineItem",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function selectGroceryItemVariant(values: {
  listId: string;
  itemId: string;
  variant: "PRIMARY" | "SUBSTITUTE";
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.selectItemVariant",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function acknowledgeGroceryItemSync(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.acknowledgeItemSync",
    values.listId,
    values,
    (list) => {
      const now = new Date().toISOString();
      return {
        ...list,
        items: list.items.map((item) => {
          if (item.id !== values.itemId) return item;
          return {
            ...item,
            syncFlag: "UNCHANGED" as const,
            flagAcknowledgedAt: now,
            // Mirrors `acknowledgeGroceryItemSync`'s own per-contribution
            // write (list-service.ts): every CHANGED/REMOVED contribution
            // still unacknowledged is stamped `now` too, not just the
            // item's own `flagAcknowledgedAt` — otherwise an offline
            // Meal-Plan resync run immediately after this still sees the
            // contribution as sticky unacknowledged
            // (`mealplan-resync-core.ts`'s `resetPreviousSnapshot` check)
            // and wrongly keeps it pinned CHANGED.
            contributions: item.contributions.map((c) =>
              (c.syncState === "CHANGED" || c.syncState === "REMOVED") &&
              c.acknowledgedAt === null
                ? { ...c, acknowledgedAt: now }
                : c,
            ),
          };
        }),
      };
    },
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function updateGroceryListDetails(values: {
  listId: string;
  title: string;
  plannedDate: Date;
  isActive: boolean;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.updateDetails",
    values.listId,
    values,
    (list) => ({
      ...list,
      title: values.title,
      plannedDate: values.plannedDate.toISOString(),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function completeGroceryList(values: {
  listId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.complete",
    values.listId,
    values,
    (list) => ({
      ...list,
      completedAt: new Date().toISOString(),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function reopenGroceryList(values: {
  listId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.reopen",
    values.listId,
    values,
    (list) => ({
      ...list,
      completedAt: null,
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function deleteGroceryList(values: {
  listId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.delete",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function duplicateGroceryList(values: {
  listId: string;
}): Promise<
  { status: "success"; listId: string } | { status: "error"; message: string }
> {
  const { generateClientId } = await import("@/lib/offline/ids");
  const clientListId = generateClientId();
  const result = await groceryMutate(
    "grocery.duplicate",
    values.listId,
    { ...values, clientListId },
    noopPatch,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", listId: clientListId };
}

export async function addGroceryListSource(values: {
  listId: string;
  dishId: string;
  dishVersionId?: string;
  scaleFactor: number;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.addSource",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function removeGroceryListSource(values: {
  listId: string;
  sourceId: string;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.removeSource",
    values.listId,
    values,
    (list) => ({
      ...list,
      sources: list.sources.filter((s) => s.id !== values.sourceId),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function updateGroceryListSource(values: {
  listId: string;
  sourceId: string;
  targetVersionId: string;
  scaleFactor: number;
}): Promise<ActionState> {
  const result = await groceryMutate(
    "grocery.updateSource",
    values.listId,
    values,
    noopPatch,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function resyncMealPlanGroceryLists(values: {
  mealPlanId: string;
  listId?: string;
  reconciliation?: {
    discardManualItemIds?: string[];
    discardRemovedContributionIds?: string[];
  };
}): Promise<
  | {
      status: "success";
      summary: { added: number; removed: number; changed: number } | null;
    }
  | { status: "error"; message: string }
> {
  if (!values.listId) return { status: "error", message: "No list to sync." };

  // Offline: the same shared decision core (`mealplan-resync-core.ts`) as
  // the online path, computed against the replica and applied to the
  // grocery list's own local doc immediately — a genuinely different
  // entity than the one this mutation targets below, so it's written
  // directly rather than through `optimisticDoc` (which only ever patches
  // the mutation's own `entityType`/`entityId`).
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const result = await resyncMealPlanGroceryListOffline(
      values.mealPlanId,
      values.listId,
      values.reconciliation,
    );
    if (!result.ok) return { status: "error", message: result.error };
    const existing = await getEntity("groceryList", values.listId);
    await putEntity({
      entityType: "groceryList",
      id: values.listId,
      doc: result.nextDoc,
      serverRevision: existing?.serverRevision ?? null,
      localUpdatedAt: new Date().toISOString(),
      dirty: true,
      conflict: null,
    });
    const queued = await runOrQueueMutation({
      op: "mealplan.resyncGroceryLists",
      entityType: "mealPlan",
      entityId: values.mealPlanId,
      payload: values,
      optimisticDoc: (current: unknown) => current,
      mutationId: generateClientId(),
    });
    if (!queued.ok) return { status: "error", message: queued.message };
    return { status: "success", summary: result.summary };
  }

  // Targets the Meal Plan entity (not the Grocery List) — the sync
  // registry's `mealplan.resyncGroceryLists` handler snapshots the plan,
  // per `offline-sync/mealplans.ts` — so this bypasses `groceryMutate`
  // (which always tags its entity as `groceryList`) and calls the generic
  // mutation helper directly with the correct entity type.
  const result = await runOrQueueMutation({
    op: "mealplan.resyncGroceryLists",
    entityType: "mealPlan",
    entityId: values.mealPlanId,
    payload: values,
    optimisticDoc: (current: unknown) => current,
    mutationId: generateClientId(),
  });
  if (!result.ok) return { status: "error", message: result.message };
  // A real online call that fell through to the offline queue (a genuine
  // network failure mid-request, not the `navigator.onLine === false`
  // branch above) has no computed summary yet — `meta` is only populated
  // by the immediate `/api/sync/mealplans` response
  // (`mealplan.resyncGroceryLists`'s handler), never by a queued mutation.
  // The caller treats a missing summary as "nothing to report" rather than
  // a false "already up to date."
  return {
    status: "success",
    summary:
      (result.queued
        ? null
        : (result.meta as GroceryListResyncSummary | null | undefined)) ?? null,
  };
}

export async function previewMealPlanGroceryListSync(values: {
  mealPlanId: string;
  listId: string;
}): Promise<
  | { status: "success"; preview: GroceryListSyncReconciliationCandidate }
  | { status: "error"; message: string }
> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const result = await previewMealPlanGroceryListSyncOffline(
      values.mealPlanId,
      values.listId,
    );
    if ("error" in result) return { status: "error", message: result.error };
    return { status: "success", preview: result };
  }
  return previewMealPlanGroceryListSyncOnline(values);
}

export async function setMealPlanGroceryListEntryIncluded(values: {
  mealPlanId: string;
  entryId: string;
  listId: string;
  included: boolean;
}): Promise<MealPlanActionState> {
  const result = await groceryMutate(
    "grocery.setMealPlanEntryIncluded",
    values.listId,
    values,
    (list) => ({
      ...list,
      mealPlanEntries: list.mealPlanEntries.map((entry) =>
        entry.id === values.entryId
          ? { ...entry, included: values.included }
          : entry,
      ),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}
