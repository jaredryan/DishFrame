import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSession } from "@/lib/auth/session";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { FlavorProfileManager } from "@/components/app/flavor-profile-manager";

export const metadata: Metadata = {
  title: "Flavor Profiles",
};

export default async function FlavorProfilesPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const flavorProfiles = await listFlavorProfileValues(session.user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <Link
          href="/settings"
          className="text-muted-foreground mb-2 inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Settings
        </Link>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Flavor Profiles
        </h1>
        <p className="text-muted-foreground mt-2">
          A dedicated classification for how something tastes — separate from
          your ordinary tags.
        </p>
      </div>

      <FlavorProfileManager initialFlavorProfiles={flavorProfiles} />
    </div>
  );
}
