import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { DishLibraryView } from "@/components/domain/dish/dish-library-view";

export const metadata: Metadata = {
  title: "Recipes",
};

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }

  const { archived } = await searchParams;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            Recipes
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Every recipe you organize in DishFrame lives here, built from
            sections you write or reuse.
          </p>
        </div>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus /> Create Recipe
          </Link>
        </Button>
      </div>

      <DishLibraryView
        ownerId={session.user.id}
        kind="RECIPE"
        includeArchived={archived === "1"}
      />
    </div>
  );
}
