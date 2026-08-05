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
import type {
  OnboardingGuideKey,
  OnboardingGuideStatus,
} from "@/lib/preferences/onboarding-guides";

export async function updatePreferences(
  values: PreferencesFormValues,
): Promise<PreferencesFormState> {
  try {
    const userId = await requireUserId();
    const data = preferencesFormSchema.parse(values);

    await preferencesService.updatePreferences(userId, data);

    revalidatePath("/settings");
    return { status: "success", message: "Preferences saved." };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type OnboardingActionState = {
  status: "success" | "error";
  message?: string;
};

export async function markOnboardingGuideState(
  guideKey: OnboardingGuideKey,
  guideStatus: OnboardingGuideStatus,
): Promise<OnboardingActionState> {
  try {
    const userId = await requireUserId();
    await preferencesService.markOnboardingGuideState(
      userId,
      guideKey,
      guideStatus,
    );
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function resetOnboardingGuideState(
  guideKey: OnboardingGuideKey,
): Promise<OnboardingActionState> {
  try {
    const userId = await requireUserId();
    await preferencesService.resetOnboardingGuideState(userId, guideKey);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
