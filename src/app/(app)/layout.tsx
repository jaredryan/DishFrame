import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { initializeNewUser } from "@/lib/account/init";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { MobileTopbar } from "@/components/app/mobile-topbar";
import { AccountMenu } from "@/components/app/account-menu";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { InitialIntro } from "@/components/onboarding/initial-intro";
import { ReceivedShareNotifier } from "@/components/domain/sharing/received-share-notifier";
import { countNewReceivedShares } from "@/lib/sharing/collections";
import type { OnboardingState } from "@/lib/preferences/onboarding-guides";
import { OfflineAccountBoot } from "@/components/offline/account-boot";
import { OfflineStatusBanner } from "@/components/offline/offline-status-banner";
import { ConflictResolutionDialog } from "@/components/offline/conflict-resolution-dialog";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/sign-in");
  }

  // Recovery path for interrupted account initialization (Slice 2
  // follow-up): Better Auth's `user.create.after` hook only ever fires
  // once, at sign-up, so a crash partway through that run would otherwise
  // leave the account half-seeded forever. Every request through the
  // protected app shell checks the completion marker and retries
  // initializeNewUser if it's still unset — cheap (one indexed lookup) once
  // initialization has actually completed.
  let preference = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
  });
  if (!preference?.defaultsInitializedAt) {
    await initializeNewUser(session.user.id);
    preference = await prisma.userPreference.findUnique({
      where: { userId: session.user.id },
    });
  }

  const accountUser = {
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };

  const onboardingState =
    (preference?.onboardingState as unknown as OnboardingState | null) ?? {};

  const newShareCount = await countNewReceivedShares(
    session.user.id,
    preference?.shareNotificationSeenAt ?? null,
  );

  return (
    <OnboardingProvider initialState={onboardingState}>
      <OfflineAccountBoot authenticatedUserId={session.user.id} />
      <ConflictResolutionDialog />
      <ReceivedShareNotifier newShareCount={newShareCount} />
      <div className="flex min-h-screen">
        <SidebarNav user={accountUser} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopbar>
            <AccountMenu user={accountUser} />
          </MobileTopbar>
          <OfflineStatusBanner />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
      <InitialIntro
        initialPreferences={{
          measurementSystem: preference?.measurementSystem ?? "US",
          fractionOrDecimal: preference?.fractionOrDecimal ?? "FRACTIONS",
          primaryRatingDisplay:
            preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
          timerSoundEnabled: preference?.timerSoundEnabled ?? true,
          reviewPromptEnabled: preference?.reviewPromptEnabled ?? true,
        }}
      />
    </OnboardingProvider>
  );
}
