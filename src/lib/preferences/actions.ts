"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as preferencesService from "@/lib/preferences/service";
import {
  preferencesFormSchema,
  type PreferencesFormState,
  type PreferencesFormValues,
} from "@/lib/preferences/schema";
import {
  ONBOARDING_GUIDE_KEYS,
  ONBOARDING_GUIDE_STATUSES,
  type OnboardingGuideKey,
  type OnboardingGuideStatus,
} from "@/lib/preferences/onboarding-guides";

const onboardingGuideKeySchema = z.enum(ONBOARDING_GUIDE_KEYS);
const onboardingGuideStatusSchema = z.enum(ONBOARDING_GUIDE_STATUSES);

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
    const key = onboardingGuideKeySchema.parse(guideKey);
    const status = onboardingGuideStatusSchema.parse(guideStatus);
    await preferencesService.markOnboardingGuideState(userId, key, status);
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
    const key = onboardingGuideKeySchema.parse(guideKey);
    await preferencesService.resetOnboardingGuideState(userId, key);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
