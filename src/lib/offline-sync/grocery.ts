import { prisma } from "@/lib/db/prisma";
import * as listService from "@/lib/grocery/list-service";
import { getOwnedGroceryListOrThrow } from "@/lib/grocery/queries";
import { toJsonSafe } from "@/lib/offline-sync/serialize";
import {
  generateGroceryListSchema,
  updateGroceryListDetailsSchema,
  listIdSchema,
  itemIdSchema,
  addManualGroceryItemSchema,
  editGroceryItemSchema,
  recategorizeGroceryItemSchema,
  reorderGroceryListItemsSchema,
} from "@/lib/grocery/list-schema";
import { z } from "zod";
import type { SyncOpRegistry } from "@/lib/offline-sync/http";

export async function buildGroceryListSnapshot(userId: string, listId: string) {
  const list = await getOwnedGroceryListOrThrow(userId, listId);
  // GroceryList has no `updatedAt` column yet (see docs/
  // OFFLINE_IMPLEMENTATION_PLAN.md's account of the pre-existing, unrelated
  // pending schema work adding one) — no revision timestamp to expose here;
  // see this domain's conflict-handling section for the accepted scope.
  return { doc: toJsonSafe(list), serverRevision: null as string | null };
}

async function snapshotResult(userId: string, listId: string) {
  const { doc, serverRevision } = await buildGroceryListSnapshot(userId, listId);
  return { entityType: "groceryList", entityId: listId, snapshot: doc, serverRevision };
}

const createPayloadSchema = generateGroceryListSchema.extend({
  clientListId: z.string().min(1),
});
const addItemPayloadSchema = addManualGroceryItemSchema.extend({
  clientItemId: z.string().min(1),
});

export const grocerySyncOps: SyncOpRegistry = {
  "grocery.create": async (userId, _entityId, rawPayload) => {
    const { clientListId, ...input } = createPayloadSchema.parse(rawPayload);
    await listService.generateGroceryList(userId, input, clientListId);
    return snapshotResult(userId, clientListId);
  },

  "grocery.updateDetails": async (userId, _entityId, rawPayload) => {
    const { listId, ...input } = updateGroceryListDetailsSchema.parse(rawPayload);
    await listService.updateGroceryListDetails(userId, listId, input);
    return snapshotResult(userId, listId);
  },

  "grocery.complete": async (userId, _entityId, rawPayload) => {
    const { listId } = listIdSchema.parse(rawPayload);
    await listService.completeGroceryList(userId, listId);
    return snapshotResult(userId, listId);
  },

  "grocery.reopen": async (userId, _entityId, rawPayload) => {
    const { listId } = listIdSchema.parse(rawPayload);
    await listService.reopenGroceryList(userId, listId);
    return snapshotResult(userId, listId);
  },

  "grocery.delete": async (userId, _entityId, rawPayload) => {
    const { listId } = listIdSchema.parse(rawPayload);
    await listService.deleteGroceryList(userId, listId);
    return { entityType: "groceryList", entityId: listId, snapshot: null, serverRevision: null };
  },

  "grocery.toggleItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    await listService.toggleGroceryItem(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.addManualItem": async (userId, _entityId, rawPayload) => {
    const { listId, clientItemId, ...input } = addItemPayloadSchema.parse(rawPayload);
    await listService.addManualGroceryItem(userId, listId, input, clientItemId);
    return snapshotResult(userId, listId);
  },

  "grocery.editItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId, ...input } = editGroceryItemSchema.parse(rawPayload);
    await listService.editGroceryItem(userId, listId, itemId, input);
    return snapshotResult(userId, listId);
  },

  "grocery.removeItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    await listService.removeGroceryItem(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.recategorizeItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId, categoryId } = recategorizeGroceryItemSchema.parse(rawPayload);
    await listService.recategorizeGroceryItem(userId, listId, itemId, categoryId);
    return snapshotResult(userId, listId);
  },

  "grocery.reorderItems": async (userId, _entityId, rawPayload) => {
    const { listId, orderedItemIds } = reorderGroceryListItemsSchema.parse(rawPayload);
    await listService.reorderGroceryListItems(userId, listId, orderedItemIds);
    return snapshotResult(userId, listId);
  },
};

export async function listAllGroceryListSnapshots(userId: string) {
  const lists = await prisma.groceryList.findMany({ where: { ownerId: userId }, select: { id: true } });
  return Promise.all(lists.map((list) => buildGroceryListSnapshot(userId, list.id)));
}
