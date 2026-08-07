import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { PreferencesForm } from "@/components/app/preferences-form";
import { GroceryCategoryManager } from "@/components/app/grocery-category-manager";
import { TasterManager } from "@/components/app/taster-manager";
import { FlavorProfileManager } from "@/components/app/flavor-profile-manager";
import { TagManager } from "@/components/app/tag-manager";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { listTasters } from "@/lib/tasters/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { listTagsWithUsageCount } from "@/lib/tags/queries";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { user } = session;

  // Ordinarily seeded by initializeNewUser at sign-up (src/lib/account/init.ts)
  // and repaired by the (app) shell layout on any request where it's still
  // missing; upsert-on-read here is a defensive fallback only.
  const preference = await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  const groceryCategories = await prisma.groceryCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { position: "asc" },
    select: { id: true, displayName: true, position: true, isFallback: true },
  });
  const tasters = await listTasters(user.id);
  const flavorProfiles = await listFlavorProfileValues(user.id);
  const tags = await listTagsWithUsageCount(user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Settings
        </h1>
        <p className="text-muted-foreground mt-2">
          How DishFrame behaves for your account.
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Appearance</h2>
        <div className="border-border bg-card flex items-center justify-between gap-4 rounded-xl border p-5">
          <div>
            <p className="text-foreground text-sm font-medium">Theme</p>
            <p className="text-muted-foreground text-sm">
              Choose Light, Dark, or match your device.
            </p>
          </div>
          <ThemeToggle size="large" />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Preferences</h2>
        <div className="border-border bg-card rounded-xl border p-5">
          <PreferencesForm
            initialValues={{
              measurementSystem: preference.measurementSystem,
              fractionOrDecimal: preference.fractionOrDecimal,
              primaryRatingDisplay: preference.primaryRatingDisplay,
              timerSoundEnabled: preference.timerSoundEnabled,
              reviewPromptEnabled: preference.reviewPromptEnabled,
            }}
          />
        </div>
      </section>

      <section id="tasters" className="flex scroll-mt-6 flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Tasters</h2>
        <p className="text-muted-foreground -mt-2 text-sm">
          Who tried it? Add the people whose ratings you want to remember.
        </p>
        <div className="border-border bg-card rounded-xl border p-5">
          <TasterManager initialTasters={tasters} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-lg font-semibold">Tags</h2>
          <Link
            href="/tags"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm hover:underline"
          >
            Open full view
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <p className="text-muted-foreground -mt-2 text-sm">
          Your own organizing labels — used for filtering Recipes and Parts.
        </p>
        <div className="border-border bg-card rounded-xl border p-5">
          <TagManager initialTags={tags} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-lg font-semibold">
            Flavor Profiles
          </h2>
          <Link
            href="/flavor-profiles"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm hover:underline"
          >
            Open full view
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
        <p className="text-muted-foreground -mt-2 text-sm">
          A dedicated classification for how something tastes — separate from
          ordinary tags.
        </p>
        <div className="border-border bg-card rounded-xl border p-5">
          <FlavorProfileManager initialFlavorProfiles={flavorProfiles} />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">
          Grocery Categories
        </h2>
        <div className="border-border bg-card rounded-xl border p-5">
          <GroceryCategoryManager initialCategories={groceryCategories} />
        </div>
      </section>
    </div>
  );
}
