import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getServerSession } from "@/lib/auth/session";
import { ProfileActions } from "@/components/app/profile-actions";
import { PreferencesForm } from "@/components/app/preferences-form";
import { GroceryCategoryManager } from "@/components/app/grocery-category-manager";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = {
  title: "Profile",
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export default async function ProfilePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { user } = session;

  // Ordinarily seeded by initializeNewUser at sign-up (src/lib/account/init.ts);
  // upsert-on-read here is a defensive fallback only, e.g. for accounts
  // created before this preference row existed.
  const preference = await prisma.userPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  const groceryCategories = await prisma.groceryCategory.findMany({
    where: { ownerId: user.id },
    orderBy: { position: "asc" },
    select: { id: true, displayName: true, position: true },
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Profile
        </h1>
        <p className="text-muted-foreground mt-2">
          Your account details and preferences.
        </p>
      </div>

      <div className="border-border bg-card flex items-center gap-4 rounded-xl border p-5">
        <Avatar size="lg">
          <AvatarImage src={user.image ?? undefined} alt="" />
          <AvatarFallback>{initials(user.name)}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-foreground font-medium">{user.name}</p>
          <p className="text-muted-foreground text-sm">{user.email}</p>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground text-lg font-semibold">Preferences</h2>
          <Link
            href="/tasters"
            className="text-primary text-sm hover:underline"
          >
            Manage Tasters
          </Link>
        </div>
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

      <section className="flex flex-col gap-4">
        <h2 className="text-foreground text-lg font-semibold">
          Grocery Categories
        </h2>
        <div className="border-border bg-card rounded-xl border p-5">
          <GroceryCategoryManager initialCategories={groceryCategories} />
        </div>
      </section>

      <ProfileActions />
    </div>
  );
}
