"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as tagService from "@/lib/tags/service";
import {
  createTagSchema,
  renameTagSchema,
  tagIdSchema,
  type ActionState,
  type CreateTagActionState,
  type RenameTagActionState,
} from "@/lib/tags/schema";

const SETTINGS_PATH = "/settings";

export async function createTag(
  _prevState: CreateTagActionState,
  formData: FormData,
): Promise<CreateTagActionState> {
  try {
    const userId = await requireUserId();
    const { name } = createTagSchema.parse({ name: formData.get("name") });

    const tag = await tagService.createTag(userId, name);

    revalidatePath(SETTINGS_PATH);
    return {
      status: "success",
      message: `Added ${tag.displayName}.`,
      tag: {
        id: tag.id,
        displayName: tag.displayName,
        isFavorite: tag.isFavorite,
        dishCount: 0,
      },
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameTag(
  _prevState: RenameTagActionState,
  formData: FormData,
): Promise<RenameTagActionState> {
  try {
    const userId = await requireUserId();
    const { id, name } = renameTagSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
    });

    const result = await tagService.renameTag(userId, id, name);

    revalidatePath(SETTINGS_PATH);
    if (result.id !== id) {
      return {
        status: "success",
        message: `Merged into ${result.displayName}.`,
        merged: {
          destinationId: result.id,
          destinationName: result.displayName,
        },
      };
    }
    return { status: "success", message: "Renamed." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteTag(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = tagIdSchema.parse({ id: formData.get("id") });

    await tagService.deleteTag(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
