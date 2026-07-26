"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as preferencesService from "@/lib/preferences/service";
import {
  preferencesFormSchema,
  type PreferencesFormState,
  type PreferencesFormValues,
} from "@/lib/preferences/schema";

export async function updatePreferences(
  values: PreferencesFormValues,
): Promise<PreferencesFormState> {
  try {
    const userId = await requireUserId();
    const data = preferencesFormSchema.parse(values);

    await preferencesService.updatePreferences(userId, data);

    revalidatePath("/profile");
    return { status: "success", message: "Preferences saved." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
