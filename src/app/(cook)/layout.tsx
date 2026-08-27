import type { Metadata } from "next";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import type { OnboardingState } from "@/lib/preferences/onboarding-guides";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

/**
 * No shell chrome here (cooking mode is intentionally full-bleed, unlike
 * the (app) group) — this layout exists only to seed onboarding progress
 * for the CoachMarks the Cooking Sessions and Session Review pages render.
 * `(cook)/cook/[sessionId]/layout.tsx` already owns the session
 * check/redirect for those routes (unchanged by this slice); an
 * unauthenticated request here simply gets an empty onboarding state, which
 * never renders a CoachMark.
 */
export default async function CookOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  let onboardingState: OnboardingState = {};
  if (session) {
    const preference = await prisma.userPreference.findUnique({
      where: { userId: session.user.id },
      select: { onboardingState: true },
    });
    onboardingState =
      (preference?.onboardingState as unknown as OnboardingState | null) ?? {};
  }

  return (
    <OnboardingProvider initialState={onboardingState}>
      {children}
    </OnboardingProvider>
  );
}
