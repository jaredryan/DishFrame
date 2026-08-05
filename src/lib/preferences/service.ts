import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { PreferencesFormValues } from "@/lib/preferences/schema";
import type {
  OnboardingGuideKey,
  OnboardingGuideStatus,
  OnboardingState,
} from "@/lib/preferences/onboarding-guides";

/**
 * Framework-agnostic domain function (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale. Preferences are a
 * stable per-user row, not Version content — a plain update, never a
 * Recipe/Part Version-creating path (PRODUCT_SPEC.md §88.1).
 */
export async function updatePreferences(
  ownerId: string,
  data: PreferencesFormValues,
) {
  return prisma.userPreference.upsert({
    where: { userId: ownerId },
    update: data,
    create: { userId: ownerId, ...data },
  });
}

/**
 * PRODUCT_SPEC.md §92.5: merges one guide's status into the existing JSON
 * map rather than replacing it, so marking one guide never clobbers another
 * guide's already-recorded progress.
 */
export async function markOnboardingGuideState(
  ownerId: string,
  guideKey: OnboardingGuideKey,
  status: OnboardingGuideStatus,
) {
  const existing = await prisma.userPreference.findUnique({
    where: { userId: ownerId },
    select: { onboardingState: true },
  });
  const current =
    (existing?.onboardingState as unknown as OnboardingState | null) ?? {};
  const next: OnboardingState = { ...current, [guideKey]: status };

  return prisma.userPreference.upsert({
    where: { userId: ownerId },
    update: { onboardingState: next as unknown as Prisma.InputJsonValue },
    create: {
      userId: ownerId,
      onboardingState: next as unknown as Prisma.InputJsonValue,
    },
  });
}

/**
 * Help's "replayable interactive guides" (PRODUCT_SPEC.md §93.4): clears one
 * guide's recorded status back to incomplete/absent so its CoachMark (or the
 * initial introduction) renders again, without touching any other guide's
 * progress.
 */
export async function resetOnboardingGuideState(
  ownerId: string,
  guideKey: OnboardingGuideKey,
) {
  const existing = await prisma.userPreference.findUnique({
    where: { userId: ownerId },
    select: { onboardingState: true },
  });
  const current =
    (existing?.onboardingState as unknown as OnboardingState | null) ?? {};
  const next: OnboardingState = { ...current };
  delete next[guideKey];

  return prisma.userPreference.upsert({
    where: { userId: ownerId },
    update: { onboardingState: next as unknown as Prisma.InputJsonValue },
    create: {
      userId: ownerId,
      onboardingState: next as unknown as Prisma.InputJsonValue,
    },
  });
}
