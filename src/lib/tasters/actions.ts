"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as tasterService from "@/lib/tasters/service";
import {
  createTasterSchema,
  renameTasterSchema,
  tasterIdSchema,
  type ActionState,
} from "@/lib/tasters/schema";

const TASTERS_PATH = "/tasters";

export async function createTaster(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { name } = createTasterSchema.parse({
      name: formData.get("name"),
    });

    await tasterService.createTaster(userId, name);

    revalidatePath(TASTERS_PATH);
    return { status: "success", message: `Added ${name}.` };
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

    revalidatePath(TASTERS_PATH);
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

    revalidatePath(TASTERS_PATH);
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

    revalidatePath(TASTERS_PATH);
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

    revalidatePath(TASTERS_PATH);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
