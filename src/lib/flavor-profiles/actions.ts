"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as flavorProfileService from "@/lib/flavor-profiles/service";
import {
  createFlavorProfileSchema,
  renameFlavorProfileSchema,
  flavorProfileIdSchema,
  reorderFlavorProfilesSchema,
  type ActionState,
  type CreateFlavorProfileActionState,
} from "@/lib/flavor-profiles/schema";

const SETTINGS_PATH = "/settings";

export async function createFlavorProfile(
  _prevState: CreateFlavorProfileActionState,
  formData: FormData,
): Promise<CreateFlavorProfileActionState> {
  try {
    const userId = await requireUserId();
    const { name } = createFlavorProfileSchema.parse({
      name: formData.get("name"),
    });

    const value = await flavorProfileService.createFlavorProfileValue(
      userId,
      name,
    );

    revalidatePath(SETTINGS_PATH);
    return {
      status: "success",
      message: `Added ${name}.`,
      flavorProfile: {
        id: value.id,
        displayName: value.displayName,
        position: value.position,
      },
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function renameFlavorProfile(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id, name } = renameFlavorProfileSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
    });

    await flavorProfileService.renameFlavorProfileValue(userId, id, name);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Renamed." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteFlavorProfile(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { id } = flavorProfileIdSchema.parse({ id: formData.get("id") });

    await flavorProfileService.deleteFlavorProfileValue(userId, id);

    revalidatePath(SETTINGS_PATH);
    return { status: "success", message: "Deleted." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reorderFlavorProfiles(
  orderedIds: string[],
): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { orderedIds: ids } = reorderFlavorProfilesSchema.parse({
      orderedIds,
    });

    await flavorProfileService.reorderFlavorProfileValues(userId, ids);

    revalidatePath(SETTINGS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
