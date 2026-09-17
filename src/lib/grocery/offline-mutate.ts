"use client";

import { runOrQueueMutation } from "@/lib/offline/mutate";
import { generateClientId } from "@/lib/offline/ids";
import { getEntity } from "@/lib/offline/db";
import type { GroceryListViewProps } from "@/lib/grocery/list-view";
import type { GroceryListDetailDto } from "@/lib/grocery/list-schema";

/** Thin, grocery-domain-specific wrapper around `runOrQueueMutation` — every
 * grocery mutation patches only the nested `list` field of the replicated
 * `GroceryListViewProps` doc, so callers supply a patcher for `list` alone
 * rather than repeating the `{...props, list: ...}` wrapping each time.
 *
 * Also threads `baseRevision` into every payload automatically — the
 * specific item's `updatedAt` when `payload` names one (`itemId`),
 * otherwise the whole list's — same conflict-detection contract as
 * `mealplans/offline-mutate.ts#mealPlanMutate`. */
export async function groceryMutate(
  op: string,
  listId: string,
  payload: unknown,
  patchList: (list: GroceryListDetailDto) => GroceryListDetailDto,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await getEntity<GroceryListViewProps>("groceryList", listId);
  const itemId = (payload as { itemId?: string } | undefined)?.itemId;
  const item = itemId
    ? existing?.doc.list.items.find((i) => i.id === itemId)
    : undefined;
  const baseRevision = item?.updatedAt ?? existing?.doc.list.updatedAt;

  const result = await runOrQueueMutation({
    op,
    entityType: "groceryList",
    entityId: listId,
    payload: { ...(payload as object), baseRevision },
    optimisticDoc: (current: unknown) => {
      const props = current as GroceryListViewProps | undefined;
      return props ? { ...props, list: patchList(props.list) } : current;
    },
    mutationId: generateClientId(),
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}
