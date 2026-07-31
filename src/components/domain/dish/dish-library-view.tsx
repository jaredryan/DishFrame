import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import { listDishes } from "@/lib/dishes/queries";
import type { DishKindValue } from "@/lib/dishes/schema";

// Shared by /recipes and /parts (ARCHITECTURE_PROPOSAL.md §C.7) — differs
// only in `kind`; page-specific heading copy and the Create action stay in
// each route's page.tsx (Slice 6A: Create moved up beside the page title),
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
    <DishLibraryDisplay
      dishes={dishes}
      kind={kind}
      label={label}
      basePath={basePath}
      includeArchived={includeArchived}
    />
  );
}
