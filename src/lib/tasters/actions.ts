"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as tasterService from "@/lib/tasters/service";
import {
  createTasterSchema,
  renameTasterSchema,
  tasterIdSchema,
  reorderTastersSchema,
  type ActionState,
  type CreateTasterActionState,
} from "@/lib/tasters/schema";

const SETTINGS_PATH = "/settings";

export async function createTaster(
  _prevState: CreateTasterActionState,
  formData: FormData,
): Promise<CreateTasterActionState> {
  try {
    const userId = await requireUserId();
    const { name } = createTasterSchema.parse({
      name: formData.get("name"),
    });

    const taster = await tasterService.createTaster(userId, name);

    revalidatePath(SETTINGS_PATH);
    return {
      status: "success",
      message: `Added ${name}.`,
      taster: {
        id: taster.id,
        name: taster.name,
        position: taster.position,
        isOwner: taster.isOwner,
        archivedAt: taster.archivedAt,
      },
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameTaster(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id, name } = renameTasterSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
    });

    await tasterService.renameTaster(userId, id, name);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Renamed." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function archiveTaster(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = tasterIdSchema.parse({ id: formData.get("id") });

    await tasterService.archiveTaster(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Archived." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function restoreTaster(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = tasterIdSchema.parse({ id: formData.get("id") });

    await tasterService.restoreTaster(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Restored." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteTaster(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = tasterIdSchema.parse({ id: formData.get("id") });

    await tasterService.deleteTaster(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reorderTasters(
  orderedIds: string[],
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { orderedIds: ids } = reorderTastersSchema.parse({ orderedIds });

    await tasterService.reorderTasters(userId, ids);

    revalidatePath(SETTINGS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
