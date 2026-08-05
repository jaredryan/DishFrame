import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { DishLibraryView } from "@/components/domain/dish/dish-library-view";
import { parseLibrarySearchParams } from "@/lib/dishes/library-filters";
import { CoachMark } from "@/components/onboarding/coach-mark";

export const metadata: Metadata = {
  title: "Parts",
};

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const filters = parseLibrarySearchParams(await searchParams);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Reusable Parts
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Save the sauces, sides, staples, and preparations you use across
            more than one recipe.
          </p>
        </div>
        <Button asChild>
          <Link href="/parts/new">
            <Plus /> Create Part
          </Link>
        </Button>
      </div>

      <CoachMark guideKey="parts-intro" title="Reusable Parts">
        A Part is a preparation you save on its own — a sauce, a side, a staple
        — and link into any Recipe. Edit the Part once, and every Recipe that
        links it can pull in the update (PRODUCT_SPEC.md §93.2).
      </CoachMark>

      <DishLibraryView
        ownerId={session.user.id}
        kind="PART"
        filters={filters}
      />
    </div>
  );
}
