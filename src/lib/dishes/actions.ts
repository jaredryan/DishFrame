"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as dishService from "@/lib/dishes/service";
import {
  dishContentSchema,
  duplicateDishSchema,
  restoreDishSchema,
  versionChoiceSchema,
  type DishActionState,
  type DishContentInput,
  type DishKindValue,
  type VersionChoiceValue,
} from "@/lib/dishes/schema";

function basePath(kind: DishKindValue): "/recipes" | "/parts" {
  return kind === "PART" ? "/parts" : "/recipes";
}

function revalidateDish(kind: DishKindValue, dishId?: string) {
  revalidatePath(basePath(kind));
  if (dishId) {
    revalidatePath(`${basePath(kind)}/${dishId}`);
    revalidatePath(`${basePath(kind)}/${dishId}/edit`);
  }
}

export async function createDish(
  kind: DishKindValue,
  values: DishContentInput,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const input = dishContentSchema.parse(values);

    const dishId = await dishService.createDish(userId, kind, input);

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function editDish(
  kind: DishKindValue,
  dishId: string,
  baseVersionId: string,
  values: DishContentInput,
  versionChoice?: VersionChoiceValue,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const input = dishContentSchema.parse(values);
    const parsedVersionChoice = versionChoice
      ? versionChoiceSchema.parse(versionChoice)
      : undefined;

    await dishService.editDish(
      userId,
      dishId,
      baseVersionId,
      input,
      parsedVersionChoice,
      kind,
    );

    revalidateDish(kind, dishId);
    return { status: "success", dishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function archiveDish(
  kind: DishKindValue,
  dishId: string,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    await dishService.archiveDish(userId, dishId, kind);

    revalidateDish(kind, dishId);
    return { status: "success", dishId, message: "Archived." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function restoreDish(
  kind: DishKindValue,
  values: { dishId: string; stage: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, stage } = restoreDishSchema.parse(values);

    await dishService.restoreDish(userId, dishId, stage, kind);

    revalidateDish(kind, dishId);
    return { status: "success", dishId, message: "Restored." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function duplicateDish(
  kind: DishKindValue,
  values: { dishId: string; sourceVersionId?: string },
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    const { dishId, sourceVersionId } = duplicateDishSchema.parse(values);

    const newDishId = await dishService.duplicateDish(
      userId,
      dishId,
      sourceVersionId,
      kind,
    );

    revalidateDish(kind, newDishId);
    return { status: "success", dishId: newDishId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteDish(
  kind: DishKindValue,
  dishId: string,
): Promise<DishActionState> {
  try {
    const userId = await requireUserId();
    await dishService.deleteDish(userId, dishId, kind);

    revalidateDish(kind);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
