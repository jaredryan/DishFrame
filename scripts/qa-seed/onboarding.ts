import type { markOnboardingGuideState as MarkOnboardingGuideState } from "@/lib/preferences/service";
import { ONBOARDING_GUIDE_KEYS } from "@/lib/preferences/onboarding-guides";

/**
 * Slice 20: the ordinary QA review should begin unobstructed by the
 * initial-intro overlay or any of the nine contextual CoachMarks — marks
 * every registered guide `completed` for the given account. The real
 * replay/reset flow (`resetOnboardingGuideState`, reachable from `/help`)
 * is untouched, so every guide remains independently reviewable on demand;
 * this only sets the *default* starting state, never a second onboarding
 * mode or a local-storage shortcut.
 */
export async function markAllOnboardingGuidesCompleted(
  markOnboardingGuideState: typeof MarkOnboardingGuideState,
  ownerId: string,
): Promise<void> {
  for (const guideKey of ONBOARDING_GUIDE_KEYS) {
    await markOnboardingGuideState(ownerId, guideKey, "completed");
  }
}
