import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import { queryDishLibrary, listDistinctCuisines } from "@/lib/dishes/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { prisma } from "@/lib/db/prisma";
import type { DishKindValue } from "@/lib/dishes/schema";
import type { LibraryFilters } from "@/lib/dishes/library-filters";

// Shared by /recipes and /parts (ARCHITECTURE_PROPOSAL.md §C.7) — differs
// only in `kind`; page-specific heading copy and the Create action stay in
// each route's page.tsx.
export async function DishLibraryView({
  ownerId,
  kind,
  filters,
}: {
  ownerId: string;
  kind: DishKindValue;
  filters: LibraryFilters;
}) {
  const [preference, tags, cuisines, flavorProfiles] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: ownerId },
      select: { primaryRatingDisplay: true },
    }),
    listTags(ownerId),
    listDistinctCuisines(ownerId, kind),
    listFlavorProfileValues(ownerId),
  ]);
  const dishes = await queryDishLibrary(
    ownerId,
    kind,
    filters,
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
  );

  const basePath = kind === "PART" ? "/parts" : "/recipes";
  const label = kind === "PART" ? "part" : "recipe";

  return (
    <DishLibraryDisplay
      dishes={dishes}
      kind={kind}
      label={label}
      basePath={basePath}
      filters={filters}
      tagOptions={tags.map((tag) => ({
        id: tag.id,
        displayName: tag.displayName,
      }))}
      cuisineOptions={cuisines}
      flavorProfileOptions={flavorProfiles.map((value) => ({
        id: value.id,
        displayName: value.displayName,
      }))}
    />
  );
}
