import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/empty-state";
import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import { listDishes } from "@/lib/dishes/queries";
import type { DishKindValue } from "@/lib/dishes/schema";

// Shared by /recipes and /parts (ARCHITECTURE_PROPOSAL.md §C.7) — differs
// only in `kind`; page-specific heading copy stays in each route's page.tsx
// so Recipe/Part terminology (BRANDING.md §14) stays distinct.
export async function DishLibraryView({
  ownerId,
  kind,
  includeArchived,
}: {
  ownerId: string;
  kind: DishKindValue;
  includeArchived: boolean;
}) {
  const rawDishes = await listDishes(ownerId, kind, { includeArchived });
  const dishes: DishCardItem[] = rawDishes.map((dish) => ({
    id: dish.id,
    currentTitle: dish.currentTitle,
    stage: dish.stage,
    cuisine: dish.cuisine,
    updatedAt: dish.updatedAt,
    imageAssetId: dish.currentVersion?.imageAssetId ?? null,
  }));
  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const label = kind === "PART" ? "part" : "recipe";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={includeArchived ? basePath : `${basePath}?archived=1`}
          className="text-muted-foreground text-sm hover:underline"
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
        <Button asChild>
          <Link href={`${basePath}/new`}>
            <Plus /> Create
          </Link>
        </Button>
      </div>

      {dishes.length === 0 ? (
        <EmptyState
          title={`No ${label}s yet`}
          description={
            includeArchived
              ? `No archived ${label}s.`
              : `${label === "part" ? "Parts" : "Recipes"} you create will show up here.`
          }
        />
      ) : (
        <DishLibraryDisplay dishes={dishes} kind={kind} label={label} />
      )}
    </div>
  );
}
