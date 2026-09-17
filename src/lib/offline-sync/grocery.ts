import { prisma } from "@/lib/db/prisma";
import * as listService from "@/lib/grocery/list-service";
import * as mealPlanService from "@/lib/mealplans/service";
import { buildGroceryListViewProps } from "@/lib/grocery/list-view";
import {
  toJsonSafe,
  assertRevisionOrThrow,
} from "@/lib/offline-sync/serialize";
import {
  generateGroceryListSchema,
  updateGroceryListDetailsSchema,
  listIdSchema,
  itemIdSchema,
  addManualGroceryItemSchema,
  editGroceryItemSchema,
  recategorizeGroceryItemSchema,
  reorderGroceryListItemsSchema,
  selectGroceryItemVariantSchema,
  addGroceryListSourceSchema,
  removeGroceryListSourceSchema,
  updateGroceryListSourceSchema,
} from "@/lib/grocery/list-schema";
import { z } from "zod";
import type { SyncOpRegistry } from "@/lib/offline-sync/http";

/** Ships exactly `<GroceryListDetailView>`'s prop shape (`list-view.ts`'s
 * `buildGroceryListViewProps`, the same assembly the live page calls) so
 * the offline boundary renders with no second mapping step. */
export async function buildGroceryListSnapshot(userId: string, listId: string) {
  const props = await buildGroceryListViewProps(userId, listId);
  return { doc: toJsonSafe(props), serverRevision: props.list.updatedAt };
}

async function snapshotResult(userId: string, listId: string) {
  const { doc, serverRevision } = await buildGroceryListSnapshot(
    userId,
    listId,
  );
  return {
    entityType: "groceryList",
    entityId: listId,
    snapshot: doc,
    serverRevision,
  };
}

const baseRevisionSchema = z.object({ baseRevision: z.string().optional() });

/** Whole-list optimistic-concurrency check — see `offline-sync/mealplans.ts`'s
 * `assertMealPlanRevision` doc comment for the shared reasoning. */
async function assertGroceryListRevision(
  listId: string,
  baseRevision?: string,
) {
  if (baseRevision == null) return;
  const list = await prisma.groceryList.findUnique({
    where: { id: listId },
    select: { updatedAt: true },
  });
  if (!list) return;
  await assertRevisionOrThrow(list.updatedAt, baseRevision);
}

async function assertGroceryItemRevision(
  itemId: string,
  baseRevision?: string,
) {
  if (baseRevision == null) return;
  const item = await prisma.groceryListItem.findUnique({
    where: { id: itemId },
    select: { updatedAt: true },
  });
  if (!item) return;
  await assertRevisionOrThrow(item.updatedAt, baseRevision);
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
    const { listId, ...input } =
      updateGroceryListDetailsSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryListRevision(listId, baseRevision);
    await listService.updateGroceryListDetails(userId, listId, input);
    return snapshotResult(userId, listId);
  },

  "grocery.complete": async (userId, _entityId, rawPayload) => {
    const { listId } = listIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryListRevision(listId, baseRevision);
    await listService.completeGroceryList(userId, listId);
    return snapshotResult(userId, listId);
  },

  "grocery.reopen": async (userId, _entityId, rawPayload) => {
    const { listId } = listIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryListRevision(listId, baseRevision);
    await listService.reopenGroceryList(userId, listId);
    return snapshotResult(userId, listId);
  },

  "grocery.delete": async (userId, _entityId, rawPayload) => {
    const { listId } = listIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryListRevision(listId, baseRevision);
    await listService.deleteGroceryList(userId, listId);
    return {
      entityType: "groceryList",
      entityId: listId,
      snapshot: null,
      serverRevision: null,
    };
  },

  "grocery.toggleItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryItemRevision(itemId, baseRevision);
    await listService.toggleGroceryItem(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.addManualItem": async (userId, _entityId, rawPayload) => {
    const { listId, clientItemId, ...input } =
      addItemPayloadSchema.parse(rawPayload);
    await listService.addManualGroceryItem(userId, listId, input, clientItemId);
    return snapshotResult(userId, listId);
  },

  "grocery.editItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId, ...input } =
      editGroceryItemSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryItemRevision(itemId, baseRevision);
    await listService.editGroceryItem(userId, listId, itemId, input);
    return snapshotResult(userId, listId);
  },

  "grocery.removeItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryItemRevision(itemId, baseRevision);
    await listService.removeGroceryItem(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.recategorizeItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId, categoryId } =
      recategorizeGroceryItemSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertGroceryItemRevision(itemId, baseRevision);
    await listService.recategorizeGroceryItem(
      userId,
      listId,
      itemId,
      categoryId,
    );
    return snapshotResult(userId, listId);
  },

  "grocery.reorderItems": async (userId, _entityId, rawPayload) => {
    const { listId, orderedItemIds } =
      reorderGroceryListItemsSchema.parse(rawPayload);
    await listService.reorderGroceryListItems(userId, listId, orderedItemIds);
    return snapshotResult(userId, listId);
  },

  "grocery.uncombineItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    await listService.uncombineGroceryItem(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.combineItem": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    await listService.combineGroceryItems(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.selectItemVariant": async (userId, _entityId, rawPayload) => {
    const { listId, itemId, variant } =
      selectGroceryItemVariantSchema.parse(rawPayload);
    await listService.selectGroceryItemVariant(userId, listId, itemId, variant);
    return snapshotResult(userId, listId);
  },

  "grocery.acknowledgeItemSync": async (userId, _entityId, rawPayload) => {
    const { listId, itemId } = itemIdSchema.parse(rawPayload);
    await listService.acknowledgeGroceryItemSync(userId, listId, itemId);
    return snapshotResult(userId, listId);
  },

  "grocery.addSource": async (userId, _entityId, rawPayload) => {
    const { listId, dishId, dishVersionId, scaleFactor } =
      addGroceryListSourceSchema.parse(rawPayload);
    await listService.addGroceryListSource(
      userId,
      listId,
      dishId,
      dishVersionId,
      scaleFactor,
    );
    return snapshotResult(userId, listId);
  },

  "grocery.removeSource": async (userId, _entityId, rawPayload) => {
    const { listId, sourceId } =
      removeGroceryListSourceSchema.parse(rawPayload);
    await listService.removeGroceryListSource(userId, listId, sourceId);
    return snapshotResult(userId, listId);
  },

  // "Edit meal"'s direct Version + scale change — distinct from the
  // Sync/refresh preview flow (`previewGroceryListSourceRefresh`, a
  // read-only preview deliberately not queued here; see the offline plan's
  // Grocery Lists section for the "requires connection" boundary this and
  // the preview step share).
  "grocery.updateSource": async (userId, _entityId, rawPayload) => {
    const { listId, sourceId, targetVersionId, scaleFactor } =
      updateGroceryListSourceSchema.parse(rawPayload);
    await listService.applyGroceryListSourceRefresh(
      userId,
      listId,
      sourceId,
      targetVersionId,
      scaleFactor,
    );
    return snapshotResult(userId, listId);
  },

  "grocery.setMealPlanEntryIncluded": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, listId, entryId, included } = z
      .object({
        mealPlanId: z.string().min(1),
        listId: z.string().min(1),
        entryId: z.string().min(1),
        included: z.boolean(),
      })
      .parse(rawPayload);
    await mealPlanService.setMealPlanGroceryListEntryIncluded(
      userId,
      mealPlanId,
      listId,
      entryId,
      included,
    );
    return snapshotResult(userId, listId);
  },

  "grocery.duplicate": async (userId, _entityId, rawPayload) => {
    const { listId, clientListId } = z
      .object({ listId: z.string().min(1), clientListId: z.string().min(1) })
      .parse(rawPayload);
    await listService.duplicateGroceryList(userId, listId, clientListId);
    return snapshotResult(userId, clientListId);
  },
};

export async function listAllGroceryListSnapshots(userId: string) {
  const lists = await prisma.groceryList.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  return Promise.all(
    lists.map((list) => buildGroceryListSnapshot(userId, list.id)),
  );
}
