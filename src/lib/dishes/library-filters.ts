import type { Prisma } from "@/generated/prisma/client";
import {
  stageValues,
  type DishKindValue,
  type StageValue,
} from "@/lib/dishes/schema";
import type { PrincipalRating } from "@/lib/reviews/queries";

/**
 * PRODUCT_SPEC.md §43-50 — search, filters, and sorting for the Recipe/Part
 * libraries. Kept as plain, DB-free functions so filter-combination, ranking,
 * and sort-order rules can be unit-tested directly against the spec's own
 * examples, independent of the actual Prisma query in dishes/queries.ts.
 */

export const librarySortValues = [
  "RECENTLY_UPDATED",
  "RECENTLY_CREATED",
  "ALPHABETICAL",
  "HIGHEST_RATED",
  "LOWEST_RATED",
  "RECENTLY_COOKED",
  "LEAST_RECENTLY_COOKED",
  "SHORTEST_DURATION",
] as const;
export type LibrarySortValue = (typeof librarySortValues)[number];

export const DEFAULT_LIBRARY_SORT: LibrarySortValue = "RECENTLY_UPDATED";

export const ratingFilterValues = [
  "UNRATED",
  "THREE_PLUS",
  "FOUR_PLUS",
  "FIVE",
] as const;
export type RatingFilterValue = (typeof ratingFilterValues)[number];

export type LibraryFilters = {
  search: string;
  stages: StageValue[];
  tagIds: string[];
  cuisines: string[];
  flavorProfileValueIds: string[];
  rating: RatingFilterValue | null;
  sort: LibrarySortValue;
  // Slice 10 correction: distinguishes "no sort param in the URL" (relevance
  // ranking wins while searching, §44.5) from "the user explicitly picked
  // this Sort from the dropdown" (that Sort wins, even if the picked value
  // happens to equal the default) — see `compareDishesForLibrary`.
  sortIsExplicit: boolean;
};

// ---------------------------------------------------------------------------
// URL query-state (de)serialization — §47.8's chips/clear controls read and
// write these same params, so parse/serialize round-trip exactly.
// ---------------------------------------------------------------------------

const SORT_PARAM_TO_VALUE: Record<string, LibrarySortValue> = {
  "recently-updated": "RECENTLY_UPDATED",
  "recently-created": "RECENTLY_CREATED",
  alphabetical: "ALPHABETICAL",
  "highest-rated": "HIGHEST_RATED",
  "lowest-rated": "LOWEST_RATED",
  "recently-cooked": "RECENTLY_COOKED",
  "least-recently-cooked": "LEAST_RECENTLY_COOKED",
  "shortest-duration": "SHORTEST_DURATION",
};
const SORT_VALUE_TO_PARAM: Record<LibrarySortValue, string> =
  Object.fromEntries(
    Object.entries(SORT_PARAM_TO_VALUE).map(([param, value]) => [value, param]),
  ) as Record<LibrarySortValue, string>;

const RATING_PARAM_TO_VALUE: Record<string, RatingFilterValue> = {
  unrated: "UNRATED",
  "3plus": "THREE_PLUS",
  "4plus": "FOUR_PLUS",
  "5": "FIVE",
};
const RATING_VALUE_TO_PARAM: Record<RatingFilterValue, string> =
  Object.fromEntries(
    Object.entries(RATING_PARAM_TO_VALUE).map(([param, value]) => [
      value,
      param,
    ]),
  ) as Record<RatingFilterValue, string>;

// View mode (grid/compact) is a client-only presentation choice — it never
// affects `buildLibraryWhere`/sorting, so it's tracked as its own param
// rather than folded into `LibraryFilters`. Exported here (rather than
// duplicated) so `LibraryFilterBar`'s filter navigations can preserve it
// alongside the filter params it does own.
export const DISPLAY_VIEW_PARAM = "display";
export type LibraryDisplayView = "grid" | "compact";

export function readLibraryDisplayView(
  searchParams: URLSearchParams,
): LibraryDisplayView {
  return searchParams.get(DISPLAY_VIEW_PARAM) === "compact"
    ? "compact"
    : "grid";
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const stageValueSet: ReadonlySet<string> = new Set(stageValues);

export function parseLibrarySearchParams(
  params: Record<string, string | string[] | undefined>,
): LibraryFilters {
  const search = (firstParam(params.q) ?? "").trim();
  const stages = splitList(firstParam(params.stage)).filter(
    (value): value is StageValue => stageValueSet.has(value),
  );
  const tagIds = splitList(firstParam(params.tag));
  const cuisines = splitList(firstParam(params.cuisine));
  const flavorProfileValueIds = splitList(firstParam(params.flavor));
  const ratingParam = firstParam(params.rating);
  const rating = ratingParam
    ? (RATING_PARAM_TO_VALUE[ratingParam] ?? null)
    : null;
  const sortParam = firstParam(params.sort);
  const sortIsExplicit = Boolean(sortParam && SORT_PARAM_TO_VALUE[sortParam]);
  const sort =
    (sortParam && SORT_PARAM_TO_VALUE[sortParam]) || DEFAULT_LIBRARY_SORT;

  return {
    search,
    stages,
    tagIds,
    cuisines,
    flavorProfileValueIds,
    rating,
    sort,
    sortIsExplicit,
  };
}

export function libraryFiltersToSearchParams(
  filters: LibraryFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.stages.length) params.set("stage", filters.stages.join(","));
  if (filters.tagIds.length) params.set("tag", filters.tagIds.join(","));
  if (filters.cuisines.length)
    params.set("cuisine", filters.cuisines.join(","));
  if (filters.flavorProfileValueIds.length) {
    params.set("flavor", filters.flavorProfileValueIds.join(","));
  }
  if (filters.rating)
    params.set("rating", RATING_VALUE_TO_PARAM[filters.rating]);
  // Written whenever the Sort was explicitly chosen — even a choice that
  // happens to match the default value must round-trip as explicit, since
  // it changes ordering behavior while a search is active (see
  // `compareDishesForLibrary`).
  if (filters.sortIsExplicit || filters.sort !== DEFAULT_LIBRARY_SORT) {
    params.set("sort", SORT_VALUE_TO_PARAM[filters.sort]);
  }
  return params;
}

/**
 * §50.3's "no matching results" vs. an ordinarily empty library are
 * distinguished by whether any search/filter criterion is active — Sort
 * alone never counts, since it has no "no results" implication on its own.
 */
export function isDefaultLibraryFilters(filters: LibraryFilters): boolean {
  return (
    !filters.search &&
    filters.stages.length === 0 &&
    filters.tagIds.length === 0 &&
    filters.cuisines.length === 0 &&
    filters.flavorProfileValueIds.length === 0 &&
    !filters.rating
  );
}

// ---------------------------------------------------------------------------
// Filter-combination logic (§47.4-47.7): AND across categories, OR within
// Stage/cuisine, match-all (AND) for tags and Flavor profiles.
// ---------------------------------------------------------------------------

export function buildLibraryWhere(
  ownerId: string,
  kind: DishKindValue,
  filters: Pick<
    LibraryFilters,
    "stages" | "tagIds" | "cuisines" | "flavorProfileValueIds"
  >,
): Prisma.DishWhereInput {
  const where: Prisma.DishWhereInput = { ownerId, kind };

  // §43.3: archived items are excluded unless the Archived Stage is
  // explicitly selected — Stage's own value set already includes ARCHIVED,
  // so no separate archivedAt flag is needed.
  where.stage = filters.stages.length
    ? { in: filters.stages }
    : { not: "ARCHIVED" };

  if (filters.cuisines.length) {
    where.cuisine = { in: filters.cuisines };
  }

  const matchAllClauses: Prisma.DishWhereInput[] = [
    ...filters.tagIds.map((tagId): Prisma.DishWhereInput => ({
      tags: { some: { tagId } },
    })),
    ...filters.flavorProfileValueIds.map(
      (flavorProfileValueId): Prisma.DishWhereInput => ({
        flavorProfiles: { some: { flavorProfileValueId } },
      }),
    ),
  ];
  if (matchAllClauses.length) {
    where.AND = matchAllClauses;
  }

  return where;
}

// ---------------------------------------------------------------------------
// Search ranking (§44.5, Arch round-3 Correction 6): currentTitle exact/
// prefix/partial, then cuisine, then Flavor profiles, then tags, then
// structural search text — a pure ranking function over already-fetched
// candidate fields, so the DB layer only needs one broad OR pre-filter.
// ---------------------------------------------------------------------------

export type SearchableDish = {
  currentTitle: string | null;
  cuisine: string | null;
  currentStructuralSearchText: string | null;
  tagNames: string[];
  flavorProfileNames: string[];
};

/**
 * Slice 10 correction (§44.5's "tolerant of ordinary punctuation
 * differences"): lowercases, then collapses any run of characters that
 * isn't a letter or digit — hyphens, slashes, apostrophes, and plain
 * whitespace alike — into a single space, so `lemon-garlic`,
 * `lemon garlic`, and `lemon/garlic` all normalize identically. No
 * semantic substitution (e.g. `&` vs. the word "and") — only ordinary
 * punctuation-as-boundary tolerance, per §44.5's explicit "no aggressive
 * fuzzy guessing."
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Splits a raw search query into normalized, punctuation-tolerant tokens —
 * shared by the DB prefilter (`queryDishLibrary`) so it can OR across each
 * token rather than requiring the query's exact punctuation to appear
 * verbatim in the stored text, which would otherwise let the database
 * discard a candidate the JS ranking layer (via `computeSearchTier`, using
 * the same normalization) would have matched.
 */
export function searchQueryTokens(query: string): string[] {
  const normalized = normalizeForSearch(query);
  return normalized ? normalized.split(" ") : [];
}

/** Returns the matching tier (1 = best) or null when the query matches none
 * of the searchable fields at all. */
export function computeSearchTier(
  dish: SearchableDish,
  query: string,
): number | null {
  const q = normalizeForSearch(query);
  if (!q) return null;

  const title = normalizeForSearch(dish.currentTitle ?? "");
  if (title === q) return 1;
  if (title.startsWith(q)) return 2;
  if (title.includes(q)) return 3;
  if (normalizeForSearch(dish.cuisine ?? "").includes(q)) return 4;
  if (
    dish.flavorProfileNames.some((name) => normalizeForSearch(name).includes(q))
  ) {
    return 5;
  }
  if (dish.tagNames.some((name) => normalizeForSearch(name).includes(q)))
    return 6;
  if (normalizeForSearch(dish.currentStructuralSearchText ?? "").includes(q)) {
    return 7;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rating filter (§47.3, §48.4) — a provisional rating participates
// numerically, exactly like a genuine one.
// ---------------------------------------------------------------------------

export function ratingNumericValue(rating: PrincipalRating): number | null {
  return rating.kind === "none" ? null : rating.value;
}

export function matchesRatingFilter(
  rating: PrincipalRating,
  filter: RatingFilterValue | null,
): boolean {
  if (!filter) return true;
  const value = ratingNumericValue(rating);
  if (filter === "UNRATED") return value == null;
  if (value == null) return false;
  if (filter === "THREE_PLUS") return value >= 3;
  if (filter === "FOUR_PLUS") return value >= 4;
  return value >= 5; // FIVE
}

// ---------------------------------------------------------------------------
// Sorting (§48) — unrated/never-cooked/no-estimate items are ordered last in
// every direction except Least-recently-cooked, where never-cooked is first.
// ---------------------------------------------------------------------------

export type SortableDish = {
  currentTitle: string | null;
  updatedAt: Date;
  createdAt: Date;
  ratingValue: number | null;
  lastCookedAt: Date | null;
  durationMinutes: number | null;
};

function compareRating(
  a: number | null,
  b: number | null,
  direction: "asc" | "desc",
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // unrated always sorts last, both directions
  if (b == null) return -1;
  return direction === "desc" ? b - a : a - b;
}

function compareLastCooked(
  a: Date | null,
  b: Date | null,
  direction: "asc" | "desc",
): number {
  if (a == null && b == null) return 0;
  if (direction === "desc") {
    // Recently cooked (§48.5): never-cooked last.
    if (a == null) return 1;
    if (b == null) return -1;
    return b.getTime() - a.getTime();
  }
  // Least recently cooked (§48.6): never-cooked first.
  if (a == null) return -1;
  if (b == null) return 1;
  return a.getTime() - b.getTime();
}

function compareDuration(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function compareDishesForSort(
  a: SortableDish,
  b: SortableDish,
  sort: LibrarySortValue,
): number {
  switch (sort) {
    case "RECENTLY_UPDATED":
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    case "RECENTLY_CREATED":
      return b.createdAt.getTime() - a.createdAt.getTime();
    case "ALPHABETICAL":
      return (a.currentTitle ?? "").localeCompare(
        b.currentTitle ?? "",
        undefined,
        {
          sensitivity: "base",
        },
      );
    case "HIGHEST_RATED":
      return compareRating(a.ratingValue, b.ratingValue, "desc");
    case "LOWEST_RATED":
      return compareRating(a.ratingValue, b.ratingValue, "asc");
    case "RECENTLY_COOKED":
      return compareLastCooked(a.lastCookedAt, b.lastCookedAt, "desc");
    case "LEAST_RECENTLY_COOKED":
      return compareLastCooked(a.lastCookedAt, b.lastCookedAt, "asc");
    case "SHORTEST_DURATION":
      return compareDuration(a.durationMinutes, b.durationMinutes);
    default:
      return 0;
  }
}

/**
 * Slice 10 correction: when a search query is active and no Sort was
 * explicitly chosen, relevance tier is the primary key and "Recently
 * updated" (the default Sort) is the deterministic tiebreaker — an exact
 * title match always ranks above a cuisine match (Arch round-3 Correction
 * 6's acceptance case). But once the user has explicitly picked a Sort
 * (`sortIsExplicit`), that choice controls primary order for every matching
 * Dish — search text still constrains *which* Dishes match, but relevance
 * tier must never override an explicit Sort. Without a query, Sort alone
 * decides order either way.
 */
export function compareDishesForLibrary(
  a: SortableDish & { searchTier: number | null },
  b: SortableDish & { searchTier: number | null },
  sort: LibrarySortValue,
  searchActive: boolean,
  sortIsExplicit: boolean,
): number {
  if (searchActive && !sortIsExplicit) {
    const tierA = a.searchTier ?? Number.POSITIVE_INFINITY;
    const tierB = b.searchTier ?? Number.POSITIVE_INFINITY;
    if (tierA !== tierB) return tierA - tierB;
  }
  return compareDishesForSort(a, b, sort);
}
