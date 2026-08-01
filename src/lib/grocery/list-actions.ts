"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as listService from "@/lib/grocery/list-service";
import {
  generateGroceryListSchema,
  renameGroceryListSchema,
  addManualGroceryItemSchema,
  editGroceryItemSchema,
  recategorizeGroceryItemSchema,
  reorderGroceryListItemsSchema,
  combineGroceryItemsSchema,
  refreshSourceSchema,
  listIdSchema,
  itemIdSchema,
  type ActionState,
} from "@/lib/grocery/list-schema";
import type { GroceryListSourceRefreshPreview } from "@/lib/grocery/list-service";

const LISTS_PATH = "/grocery-lists";

function revalidateList(listId?: string) {
  revalidatePath(LISTS_PATH);
  if (listId) revalidatePath(`${LISTS_PATH}/${listId}`);
}

export type GenerateGroceryListActionState =
  { status: "success"; listId: string } | { status: "error"; message: string };

export async function generateGroceryList(values: {
  title: string;
  sources: Array<{ dishId: string; scaleFactor: number }>;
}): Promise<GenerateGroceryListActionState> {
  try {
    const userId = await requireUserId();
    const input = generateGroceryListSchema.parse(values);
    const listId = await listService.generateGroceryList(userId, input);
    revalidateList(listId);
    return { status: "success", listId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameGroceryList(values: {
  listId: string;
  title: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, title } = renameGroceryListSchema.parse(values);
    await listService.renameGroceryList(userId, listId, title);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function completeGroceryList(values: {
  listId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId } = listIdSchema.parse(values);
    await listService.completeGroceryList(userId, listId);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reopenGroceryList(values: {
  listId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId } = listIdSchema.parse(values);
    await listService.reopenGroceryList(userId, listId);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteGroceryList(values: {
  listId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId } = listIdSchema.parse(values);
    await listService.deleteGroceryList(userId, listId);
    revalidateList();
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type DuplicateGroceryListActionState =
  { status: "success"; listId: string } | { status: "error"; message: string };

export async function duplicateGroceryList(values: {
  listId: string;
}): Promise<DuplicateGroceryListActionState> {
  try {
    const userId = await requireUserId();
    const { listId } = listIdSchema.parse(values);
    const newListId = await listService.duplicateGroceryList(userId, listId);
    revalidateList(newListId);
    return { status: "success", listId: newListId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function toggleGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemId } = itemIdSchema.parse(values);
    await listService.toggleGroceryItem(userId, listId, itemId);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function addManualGroceryItem(values: {
  listId: string;
  name: string;
  quantityText?: string | null;
  unit?: string | null;
  categoryId?: string | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, ...input } = addManualGroceryItemSchema.parse(values);
    await listService.addManualGroceryItem(userId, listId, input);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function editGroceryItem(values: {
  listId: string;
  itemId: string;
  name?: string;
  quantityText?: string | null;
  unit?: string | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemId, ...input } = editGroceryItemSchema.parse(values);
    await listService.editGroceryItem(userId, listId, itemId, input);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function removeGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemId } = itemIdSchema.parse(values);
    await listService.removeGroceryItem(userId, listId, itemId);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function recategorizeGroceryItem(values: {
  listId: string;
  itemId: string;
  categoryId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemId, categoryId } =
      recategorizeGroceryItemSchema.parse(values);
    await listService.recategorizeGroceryItem(
      userId,
      listId,
      itemId,
      categoryId,
    );
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reorderGroceryListItems(values: {
  listId: string;
  orderedItemIds: string[];
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, orderedItemIds } =
      reorderGroceryListItemsSchema.parse(values);
    await listService.reorderGroceryListItems(userId, listId, orderedItemIds);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function combineGroceryItems(values: {
  listId: string;
  itemIds: string[];
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemIds } = combineGroceryItemsSchema.parse(values);
    await listService.combineGroceryItems(userId, listId, itemIds);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function uncombineGroceryItem(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemId } = itemIdSchema.parse(values);
    await listService.uncombineGroceryItem(userId, listId, itemId);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function switchGroceryItemToSubstitute(values: {
  listId: string;
  itemId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, itemId } = itemIdSchema.parse(values);
    await listService.switchGroceryItemToSubstitute(userId, listId, itemId);
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type PreviewRefreshActionState =
  | { status: "success"; preview: GroceryListSourceRefreshPreview }
  | { status: "error"; message: string };

export async function previewGroceryListSourceRefresh(values: {
  listId: string;
  sourceId: string;
  targetVersionId?: string;
}): Promise<PreviewRefreshActionState> {
  try {
    const userId = await requireUserId();
    const { listId, sourceId, targetVersionId } =
      refreshSourceSchema.parse(values);
    const preview = await listService.previewGroceryListSourceRefresh(
      userId,
      listId,
      sourceId,
      targetVersionId,
    );
    return { status: "success", preview };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function applyGroceryListSourceRefresh(values: {
  listId: string;
  sourceId: string;
  targetVersionId?: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { listId, sourceId, targetVersionId } =
      refreshSourceSchema.parse(values);
    await listService.applyGroceryListSourceRefresh(
      userId,
      listId,
      sourceId,
      targetVersionId,
    );
    revalidateList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
