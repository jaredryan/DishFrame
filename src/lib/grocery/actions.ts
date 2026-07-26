"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as groceryService from "@/lib/grocery/service";
import {
  createCategorySchema,
  renameCategorySchema,
  categoryIdSchema,
  reorderCategoriesSchema,
  type ActionState,
  type CreateCategoryActionState,
} from "@/lib/grocery/schema";

const SETTINGS_PATH = "/settings";

export async function createGroceryCategory(
  _prevState: CreateCategoryActionState,
  formData: FormData,
): Promise<CreateCategoryActionState> {
  try {
    const userId = await requireUserId();
    const { name } = createCategorySchema.parse({
      name: formData.get("name"),
    });

    const category = await groceryService.createGroceryCategory(userId, name);

    revalidatePath(SETTINGS_PATH);
    return {
      status: "success",
      message: `Added ${name}.`,
      category: {
        id: category.id,
        displayName: category.displayName,
        position: category.position,
        isFallback: category.isFallback,
      },
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameGroceryCategory(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id, name } = renameCategorySchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
    });

    await groceryService.renameGroceryCategory(userId, id, name);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Renamed." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteGroceryCategory(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = categoryIdSchema.parse({ id: formData.get("id") });

    await groceryService.deleteGroceryCategory(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reorderGroceryCategories(
  orderedIds: string[],
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { orderedIds: ids } = reorderCategoriesSchema.parse({ orderedIds });

    await groceryService.reorderGroceryCategories(userId, ids);

    revalidatePath(SETTINGS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
