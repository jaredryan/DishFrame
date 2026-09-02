"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as cuisineService from "@/lib/cuisines/service";
import {
  createCuisineSchema,
  renameCuisineSchema,
  cuisineIdSchema,
  reorderCuisinesSchema,
  type ActionState,
  type CreateCuisineActionState,
} from "@/lib/cuisines/schema";

const SETTINGS_PATH = "/settings";

export async function createCuisine(
  _prevState: CreateCuisineActionState,
  formData: FormData,
): Promise<CreateCuisineActionState> {
  try {
    const userId = await requireUserId();
    const { name } = createCuisineSchema.parse({ name: formData.get("name") });

    const cuisine = await cuisineService.createCuisine(userId, name);

    revalidatePath(SETTINGS_PATH);
    return {
      status: "success",
      message: `Added ${cuisine.displayName}.`,
      cuisine: {
        id: cuisine.id,
        displayName: cuisine.displayName,
        position: cuisine.position,
      },
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameCuisine(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id, name } = renameCuisineSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
    });

    await cuisineService.renameCuisine(userId, id, name);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Renamed." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteCuisine(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = cuisineIdSchema.parse({ id: formData.get("id") });

    await cuisineService.deleteCuisine(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reorderCuisines(
  orderedIds: string[],
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { orderedIds: ids } = reorderCuisinesSchema.parse({ orderedIds });

    await cuisineService.reorderCuisines(userId, ids);

    revalidatePath(SETTINGS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
