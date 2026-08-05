import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import {
  markOnboardingGuideState,
  resetOnboardingGuideState,
} from "@/lib/preferences/service";
import type { OnboardingState } from "@/lib/preferences/onboarding-guides";

describe("onboarding guide state", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("merges a guide's status without clobbering another guide's recorded progress", async () => {
    const user = await createTestUser();
    userId = user.id;

    await markOnboardingGuideState(userId, "intro", "completed");
    await markOnboardingGuideState(userId, "parts-intro", "dismissed");

    const preference = await prisma.userPreference.findUnique({
      where: { userId },
      select: { onboardingState: true },
    });
    const state = preference?.onboardingState as unknown as OnboardingState;
    expect(state).toEqual({ intro: "completed", "parts-intro": "dismissed" });
  });

  it("resetOnboardingGuideState clears only the targeted guide", async () => {
    const user = await createTestUser();
    userId = user.id;

    await markOnboardingGuideState(userId, "intro", "completed");
    await markOnboardingGuideState(userId, "cooking-session", "completed");
    await resetOnboardingGuideState(userId, "intro");

    const preference = await prisma.userPreference.findUnique({
      where: { userId },
      select: { onboardingState: true },
    });
    const state = preference?.onboardingState as unknown as OnboardingState;
    expect(state).toEqual({ "cooking-session": "completed" });
  });
});
