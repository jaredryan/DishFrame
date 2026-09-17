import { listEntities, getEntity } from "@/lib/offline/db";
import type {
  DishSnapshotDoc,
  DishLibraryOptionsDoc,
} from "@/lib/offline-sync/dishes";
import type { DishDetailViewProps } from "@/lib/dishes/detail-view";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import type { DishKindValue, StageValue } from "@/lib/dishes/schema";
import {
  computeSearchTier,
  matchesRatingFilter,
  compareDishesForLibrary,
  ratingNumericValue,
  type LibraryFilters,
} from "@/lib/dishes/library-filters";
import type { PrincipalRating } from "@/lib/reviews/queries";

const EMPTY_OPTIONS: DishLibraryOptionsDoc = {
  tagOptions: [],
  cuisineOptions: [],
  flavorProfileOptions: [],
};

function matchesLibraryWhere(
  doc: DishSnapshotDoc,
  kind: DishKindValue,
  filters: Pick<
    LibraryFilters,
    "stages" | "tagIds" | "cuisineIds" | "flavorProfileValueIds"
  >,
): boolean {
  if (doc.kind !== kind) return false;

  // §43.3: archived items are excluded unless Archived is explicitly
  // selected — mirrors `buildLibraryWhere`'s Prisma equivalent.
  const stageOk = filters.stages.length
    ? filters.stages.includes(doc.stage as StageValue)
    : doc.stage !== "ARCHIVED";
  if (!stageOk) return false;

  // Cuisine: OR-within-category (matches any selected).
  if (
    filters.cuisineIds.length &&
    !filters.cuisineIds.some((id) => doc.cuisineIds.includes(id))
  ) {
    return false;
  }

  // Tags/Flavor profiles: match-all (AND).
  if (
    filters.tagIds.length &&
    !filters.tagIds.every((id) => doc.tagIds.includes(id))
  ) {
    return false;
  }
  if (
    filters.flavorProfileValueIds.length &&
    !filters.flavorProfileValueIds.every((id) =>
      doc.flavorProfileValueIds.includes(id),
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Offline equivalent of `queryDishLibrary` — reads the fully-replicated
 * `dish` entities instead of querying Postgres, then reuses the exact same
 * pure filter/rank/sort functions from `library-filters.ts` the server
 * query calls, so results match online behavior wherever the two sources
 * agree, including tier-7 `currentStructuralSearchText` (ingredient/
 * instruction text) matching — replicated on `DishSnapshotDoc` for exactly
 * this. One residual gap: a Dish created or edited *offline* and not yet
 * synced carries a stale or `null` `currentStructuralSearchText` (it's a
 * server-derived column, recomputed by `structuralSearchTextFor` only once
 * the edit actually syncs) — title/cuisine/tag/Flavor-profile matching
 * still works for it in the meantime.
 */
export async function listDishesOffline(
  kind: DishKindValue,
  filters: LibraryFilters,
): Promise<DishCardItem[]> {
  const [entities, optionsRecord] = await Promise.all([
    listEntities<DishSnapshotDoc>("dish"),
    getEntity<DishLibraryOptionsDoc>("referenceData", "dishLibraryOptions"),
  ]);
  const options = optionsRecord?.doc ?? EMPTY_OPTIONS;
  const tagById = new Map(options.tagOptions.map((t) => [t.id, t]));
  const cuisineNameById = new Map(
    options.cuisineOptions.map((c) => [c.id, c.displayName]),
  );
  const flavorProfileNameById = new Map(
    options.flavorProfileOptions.map((f) => [f.id, f.displayName]),
  );

  const searchActive = filters.search.trim().length > 0;

  const candidates = entities
    .map((record) => record.doc)
    .filter((doc) => matchesLibraryWhere(doc, kind, filters));

  const decorated = candidates
    .map((doc) => {
      const detail =
        doc.detail && (doc.detail as DishDetailViewProps).hasVersion
          ? (doc.detail as Extract<DishDetailViewProps, { hasVersion: true }>)
          : null;
      const rating: PrincipalRating = detail?.principalRating ?? {
        kind: "none",
      };
      const cuisineNames = doc.cuisineIds
        .map((id) => cuisineNameById.get(id))
        .filter((name): name is string => Boolean(name));
      const tagNames = doc.tagIds
        .map((id) => tagById.get(id)?.displayName)
        .filter((name): name is string => Boolean(name));
      const flavorProfileNames = doc.flavorProfileValueIds
        .map((id) => flavorProfileNameById.get(id))
        .filter((name): name is string => Boolean(name));
      const durationMinutes =
        detail &&
        (detail.prepTimeMinutes != null || detail.cookTimeMinutes != null)
          ? (detail.prepTimeMinutes ?? 0) + (detail.cookTimeMinutes ?? 0)
          : null;

      return {
        doc,
        detail,
        rating,
        cuisineNames,
        tagNames,
        flavorProfileNames,
        durationMinutes,
        searchTier: searchActive
          ? computeSearchTier(
              {
                currentTitle: detail?.displayTitle ?? null,
                cuisineNames,
                currentStructuralSearchText: doc.currentStructuralSearchText,
                tagNames,
                flavorProfileNames,
              },
              filters.search,
            )
          : null,
      };
    })
    .filter((entry) => (searchActive ? entry.searchTier != null : true))
    .filter((entry) => matchesRatingFilter(entry.rating, filters.rating));

  decorated.sort((a, b) =>
    compareDishesForLibrary(
      {
        currentTitle: a.detail?.displayTitle ?? null,
        updatedAt: new Date(a.doc.updatedAt),
        createdAt: new Date(a.doc.createdAt),
        ratingValue: ratingNumericValue(a.rating),
        lastCookedAt: a.detail?.lastCookedAt
          ? new Date(a.detail.lastCookedAt)
          : null,
        durationMinutes: a.durationMinutes,
        searchTier: a.searchTier,
      },
      {
        currentTitle: b.detail?.displayTitle ?? null,
        updatedAt: new Date(b.doc.updatedAt),
        createdAt: new Date(b.doc.createdAt),
        ratingValue: ratingNumericValue(b.rating),
        lastCookedAt: b.detail?.lastCookedAt
          ? new Date(b.detail.lastCookedAt)
          : null,
        durationMinutes: b.durationMinutes,
        searchTier: b.searchTier,
      },
      filters.sort,
      searchActive,
      filters.sortIsExplicit,
      filters.sortDirection,
    ),
  );

  return decorated.map(({ doc, detail, rating, cuisineNames }) => ({
    id: doc.id,
    currentTitle: detail?.displayTitle ?? null,
    stage: doc.stage as StageValue,
    cuisineNames,
    updatedAt: new Date(doc.updatedAt),
    imageAssetId: detail?.imageAssetId ?? null,
    isFavorite: doc.tagIds.some((id) => tagById.get(id)?.isFavorite),
    rating,
  }));
}

export async function listDishLibraryOptionsOffline(): Promise<DishLibraryOptionsDoc> {
  const record = await getEntity<DishLibraryOptionsDoc>(
    "referenceData",
    "dishLibraryOptions",
  );
  return record?.doc ?? EMPTY_OPTIONS;
}

/**
 * Offline equivalent of `listCookablePickerItems` — same "every Dish with
 * a saved Version" candidate set `StartCookingButton`'s picker needs, read
 * from the replica instead of a fresh query, so opening it never requires
 * a connection (docs/OFFLINE_IMPLEMENTATION_PLAN.md §5).
 */
export async function listCookablePickerItemsOffline(): Promise<
  Array<{
    id: string;
    kind: DishKindValue;
    stage: StageValue;
    cuisineNames: string[];
    currentTitle: string | null;
    versionLabel: string;
    imageAssetId: string | null;
    tags: string[];
    isFavorite: boolean;
    rating: PrincipalRating;
  }>
> {
  const [entities, optionsRecord] = await Promise.all([
    listEntities<DishSnapshotDoc>("dish"),
    getEntity<DishLibraryOptionsDoc>("referenceData", "dishLibraryOptions"),
  ]);
  const options = optionsRecord?.doc ?? EMPTY_OPTIONS;
  const tagById = new Map(options.tagOptions.map((t) => [t.id, t]));
  const cuisineNameById = new Map(
    options.cuisineOptions.map((c) => [c.id, c.displayName]),
  );

  return entities
    .map((record) => record.doc)
    .filter((doc) => !doc.archivedAt && doc.currentVersionId)
    .map((doc) => {
      const detail =
        doc.detail && (doc.detail as DishDetailViewProps).hasVersion
          ? (doc.detail as Extract<DishDetailViewProps, { hasVersion: true }>)
          : null;
      return {
        id: doc.id,
        kind: doc.kind,
        stage: doc.stage as StageValue,
        cuisineNames: doc.cuisineIds
          .map((id) => cuisineNameById.get(id))
          .filter((name): name is string => Boolean(name)),
        currentTitle: detail?.displayTitle ?? null,
        versionLabel: detail?.versionLabel ?? "",
        imageAssetId: detail?.imageAssetId ?? null,
        tags: doc.tagIds
          .map((id) => tagById.get(id))
          .filter(
            (
              t,
            ): t is { id: string; displayName: string; isFavorite: boolean } =>
              Boolean(t) && !t!.isFavorite,
          )
          .map((t) => t.displayName),
        isFavorite: doc.tagIds.some((id) => tagById.get(id)?.isFavorite),
        rating: detail?.principalRating ?? { kind: "none" },
      };
    })
    .sort((a, b) => (a.currentTitle ?? "").localeCompare(b.currentTitle ?? ""));
}
