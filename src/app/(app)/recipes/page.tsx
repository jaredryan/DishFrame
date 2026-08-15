import type { Metadata } from "next";
import Link from "next/link";
import { NotebookPen } from "lucide-react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { AppPageLayout } from "@/components/app/app-page-layout";
import { DishLibraryView } from "@/components/domain/dish/dish-library-view";
import { parseLibrarySearchParams } from "@/lib/dishes/library-filters";

export const metadata: Metadata = {
  title: "Recipes",
};

export default async function RecipesPage({
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
    <AppPageLayout
      title="Recipes"
      description="Every recipe you organize in DishFrame lives here, built from sections you write or reuse."
      action={
        <>
          <Button asChild variant="outline">
            <Link href="/recipes/import">Import</Link>
          </Button>
          <Button asChild>
            <Link href="/recipes/new">
              <NotebookPen /> Create recipe
            </Link>
          </Button>
        </>
      }
    >
      <DishLibraryView
        ownerId={session.user.id}
        kind="RECIPE"
        filters={filters}
      />
    </AppPageLayout>
  );
}
