import type { Metadata } from "next";
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
import { AppPageLayout } from "@/components/app/app-page-layout";

export const metadata: Metadata = {
  title: "Settings",
};

const JUMP_LINKS = [
  { label: "Appearance", href: "#appearance" },
  { label: "Preferences", href: "#preferences" },
  { label: "Tasters", href: "#tasters" },
  { label: "Tags", href: "#tags" },
  { label: "Flavor Profiles", href: "#flavor-profiles" },
  { label: "Grocery Categories", href: "#grocery-categories" },
];

export default async function SettingsPage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { user } = session;

  // Ordinarily seeded by initializeNewUser at sign-up (src/lib/account/init.ts)
  // and repaired by the (app) shell layout on any request where it's still
  // missing; upsert-on-read here is a defensive fallback only.
  const [preference, groceryCategories, tasters, flavorProfiles, tags] =
    await Promise.all([
      prisma.userPreference.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
      }),
      prisma.groceryCategory.findMany({
        where: { ownerId: user.id },
        orderBy: { position: "asc" },
        select: {
          id: true,
          displayName: true,
          position: true,
          isFallback: true,
        },
      }),
      listTasters(user.id),
      listFlavorProfileValues(user.id),
      listTagsWithUsageCount(user.id),
    ]);

  return (
    <AppPageLayout
      title="Settings"
      description="How DishFrame behaves for your account."
      descriptionClassName="text-muted-foreground mt-2"
      width="narrow"
    >
      <div>
        <h2 className="font-heading text-foreground text-lg font-semibold">
          Jump to
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {JUMP_LINKS.map(({ label, href }) => (
            <li key={href}>
              <a
                href={href}
                className="border-border bg-card hover:bg-muted text-foreground block rounded-lg border px-3 py-1.5 text-sm"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <section id="appearance" className="flex scroll-mt-6 flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Appearance</h2>
        <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-foreground text-sm font-medium">Theme</p>
            <p className="text-muted-foreground text-sm">
              Choose Light, Dark, or match your device.
            </p>
          </div>
          <ThemeToggle size="large" />
        </div>
      </section>

      <section id="preferences" className="flex scroll-mt-6 flex-col gap-4">
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

      <section id="tags" className="flex scroll-mt-6 flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">Tags</h2>
        <p className="text-muted-foreground -mt-2 text-sm">
          Your own organizing labels — used for filtering Recipes and Parts.
        </p>
        <div className="border-border bg-card rounded-xl border p-5">
          <TagManager initialTags={tags} />
        </div>
      </section>

      <section
        id="flavor-profiles"
        className="flex scroll-mt-6 flex-col gap-4"
      >
        <h2 className="text-foreground text-lg font-semibold">
          Flavor Profiles
        </h2>
        <p className="text-muted-foreground -mt-2 text-sm">
          A dedicated classification for how something tastes — separate from
          ordinary tags.
        </p>
        <div className="border-border bg-card rounded-xl border p-5">
          <FlavorProfileManager initialFlavorProfiles={flavorProfiles} />
        </div>
      </section>

      <section
        id="grocery-categories"
        className="flex scroll-mt-6 flex-col gap-4"
      >
        <h2 className="text-foreground text-lg font-semibold">
          Grocery Categories
        </h2>
        <div className="border-border bg-card rounded-xl border p-5">
          <GroceryCategoryManager initialCategories={groceryCategories} />
        </div>
      </section>
    </AppPageLayout>
  );
}
