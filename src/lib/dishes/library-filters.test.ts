import { describe, expect, it } from "vitest";
import {
  buildLibraryWhere,
  compareDishesForLibrary,
  compareDishesForSort,
  computeSearchTier,
  isDefaultLibraryFilters,
  libraryFiltersToSearchParams,
  matchesRatingFilter,
  parseLibrarySearchParams,
  ratingNumericValue,
  type LibraryFilters,
} from "@/lib/dishes/library-filters";
import type { PrincipalRating } from "@/lib/reviews/queries";

function baseFilters(overrides: Partial<LibraryFilters> = {}): LibraryFilters {
  return {
    search: "",
    stages: [],
    tagIds: [],
    cuisines: [],
    flavorProfileValueIds: [],
    rating: null,
    sort: "RECENTLY_UPDATED",
    sortDirection: "desc",
    sortIsExplicit: false,
    ...overrides,
  };
}

describe("parseLibrarySearchParams / libraryFiltersToSearchParams", () => {
  it("defaults every field for an empty params object", () => {
    expect(parseLibrarySearchParams({})).toEqual(baseFilters());
  });

  it("parses each param and round-trips through serialization", () => {
    const filters = parseLibrarySearchParams({
      q: "  curry  ",
      stage: "ACTIVE,PROVEN",
      tag: "tag1,tag2",
      cuisine: "Vietnamese,Thai",
      flavor: "fp1",
      rating: "4plus",
      sort: "rating",
    });
    expect(filters).toEqual(
      baseFilters({
        search: "curry",
        stages: ["ACTIVE", "PROVEN"],
        tagIds: ["tag1", "tag2"],
        cuisines: ["Vietnamese", "Thai"],
        flavorProfileValueIds: ["fp1"],
        rating: "FOUR_PLUS",
        sort: "RATING",
        sortIsExplicit: true,
      }),
    );

    const params = libraryFiltersToSearchParams(filters);
    expect(parseLibrarySearchParams(Object.fromEntries(params))).toEqual(
      filters,
    );
  });

  it("ignores an invalid Stage/rating/sort value rather than throwing", () => {
    const filters = parseLibrarySearchParams({
      stage: "ACTIVE,NOT_A_STAGE",
      rating: "not-a-rating",
      sort: "not-a-sort",
    });
    expect(filters.stages).toEqual(["ACTIVE"]);
    expect(filters.rating).toBeNull();
    expect(filters.sort).toBe("RECENTLY_UPDATED");
    expect(filters.sortIsExplicit).toBe(false);
  });

  it("omits the default sort from the serialized query string when the sort param was absent", () => {
    const params = libraryFiltersToSearchParams(baseFilters({ search: "x" }));
    expect(params.has("sort")).toBe(false);
    expect(params.get("q")).toBe("x");
  });

  it("distinguishes an absent sort param from an explicitly selected default sort (Slice 10 correction)", () => {
    // A user who explicitly picks "Recently updated" from the Sort dropdown
    // must round-trip as explicit — even though the value matches the
    // default — since it changes ordering behavior while searching
    // (relevance tier is bypassed once a Sort is explicit).
    const explicitDefault = baseFilters({
      sort: "RECENTLY_UPDATED",
      sortIsExplicit: true,
    });
    const params = libraryFiltersToSearchParams(explicitDefault);
    expect(params.get("sort")).toBe("recently-updated");
    expect(parseLibrarySearchParams(Object.fromEntries(params))).toEqual(
      explicitDefault,
    );
  });

  it("round-trips a reversed sort direction and omits it when it matches the property's default", () => {
    const reversed = baseFilters({
      sort: "ALPHABETICAL",
      sortDirection: "desc",
      sortIsExplicit: true,
    });
    const params = libraryFiltersToSearchParams(reversed);
    expect(params.get("dir")).toBe("desc");
    expect(parseLibrarySearchParams(Object.fromEntries(params))).toEqual(
      reversed,
    );

    const natural = baseFilters({
      sort: "ALPHABETICAL",
      sortDirection: "asc",
      sortIsExplicit: true,
    });
    expect(libraryFiltersToSearchParams(natural).has("dir")).toBe(false);
  });
});

describe("isDefaultLibraryFilters", () => {
  it("is true only when no search/filter criterion is active", () => {
    expect(isDefaultLibraryFilters(baseFilters())).toBe(true);
    expect(isDefaultLibraryFilters(baseFilters({ sort: "ALPHABETICAL" }))).toBe(
      true,
    );
    expect(isDefaultLibraryFilters(baseFilters({ search: "x" }))).toBe(false);
    expect(isDefaultLibraryFilters(baseFilters({ rating: "UNRATED" }))).toBe(
      false,
    );
  });
});

describe("buildLibraryWhere", () => {
  it("excludes Archived by default and requires ownerId/kind", () => {
    const where = buildLibraryWhere("owner1", "RECIPE", baseFilters());
    expect(where).toEqual({
      ownerId: "owner1",
      kind: "RECIPE",
      stage: { not: "ARCHIVED" },
    });
  });

  it("uses OR (in) across multiple selected Stages, including Archived when chosen", () => {
    const where = buildLibraryWhere(
      "owner1",
      "RECIPE",
      baseFilters({ stages: ["ACTIVE", "ARCHIVED"] }),
    );
    expect(where.stage).toEqual({ in: ["ACTIVE", "ARCHIVED"] });
  });

  it("uses OR (in) across multiple selected cuisines", () => {
    const where = buildLibraryWhere(
      "owner1",
      "RECIPE",
      baseFilters({ cuisines: ["Vietnamese", "Thai"] }),
    );
    expect(where.cuisine).toEqual({ in: ["Vietnamese", "Thai"] });
  });

  it("uses match-all (AND) across multiple selected tags and Flavor profiles (§47.6/§47.7)", () => {
    const where = buildLibraryWhere(
      "owner1",
      "RECIPE",
      baseFilters({
        tagIds: ["highProtein", "quick"],
        flavorProfileValueIds: ["sweet", "spicy"],
      }),
    );
    expect(where.AND).toEqual([
      { tags: { some: { tagId: "highProtein" } } },
      { tags: { some: { tagId: "quick" } } },
      { flavorProfiles: { some: { flavorProfileValueId: "sweet" } } },
      { flavorProfiles: { some: { flavorProfileValueId: "spicy" } } },
    ]);
  });

  it("combines every category with AND (§47.4's example)", () => {
    const where = buildLibraryWhere(
      "owner1",
      "RECIPE",
      baseFilters({
        stages: ["ACTIVE"],
        cuisines: ["Vietnamese"],
        tagIds: ["highProtein"],
      }),
    );
    expect(where).toEqual({
      ownerId: "owner1",
      kind: "RECIPE",
      stage: { in: ["ACTIVE"] },
      cuisine: { in: ["Vietnamese"] },
      AND: [{ tags: { some: { tagId: "highProtein" } } }],
    });
  });
});

describe("computeSearchTier", () => {
  const dish = (
    over: Partial<Parameters<typeof computeSearchTier>[0]> = {},
  ) => ({
    currentTitle: "Vietnamese Pho",
    cuisine: "Vietnamese",
    currentStructuralSearchText: "Broth Section Garlic Paste",
    tagNames: ["Weeknight"],
    flavorProfileNames: ["Savory"],
    ...over,
  });

  it("ranks an exact title match above a cuisine match, even when the cuisine also substring-matches the title (Arch round-3 Correction 6)", () => {
    // Title itself contains "vietnamese" (the cuisine word) too — exact-title
    // tier must still win over a looser cuisine-only match on a different item.
    const exactTitleMatch = computeSearchTier(
      dish({ currentTitle: "Vietnamese" }),
      "Vietnamese",
    );
    const cuisineOnlyMatch = computeSearchTier(
      dish({ currentTitle: "Pho", cuisine: "Vietnamese" }),
      "Vietnamese",
    );
    expect(exactTitleMatch).toBe(1);
    expect(cuisineOnlyMatch).toBe(4);
    expect(exactTitleMatch!).toBeLessThan(cuisineOnlyMatch!);
  });

  it("ranks prefix above partial title matches", () => {
    expect(computeSearchTier(dish({ currentTitle: "Pho Ga" }), "Pho")).toBe(2);
    expect(
      computeSearchTier(dish({ currentTitle: "Chicken Pho" }), "Pho"),
    ).toBe(3);
  });

  it("ranks Flavor profile above tag, and tag above structural text", () => {
    expect(
      computeSearchTier(dish({ currentTitle: "X", cuisine: null }), "savory"),
    ).toBe(5);
    expect(
      computeSearchTier(
        dish({ currentTitle: "X", cuisine: null, flavorProfileNames: [] }),
        "weeknight",
      ),
    ).toBe(6);
    expect(
      computeSearchTier(
        dish({
          currentTitle: "X",
          cuisine: null,
          flavorProfileNames: [],
          tagNames: [],
        }),
        "garlic",
      ),
    ).toBe(7);
  });

  it("is case-insensitive and tolerant of surrounding whitespace", () => {
    expect(
      computeSearchTier(dish({ currentTitle: "Vietnamese Pho" }), "  PHO  "),
    ).toBe(3);
  });

  it("returns null (no match) when nothing matches, and for an empty query", () => {
    expect(computeSearchTier(dish(), "lasagna")).toBeNull();
    expect(computeSearchTier(dish(), "   ")).toBeNull();
  });

  it("excludes ingredient names entirely (§44.3) — not part of any searchable field", () => {
    // structuralSearchText only ever carries Section names/linked Part
    // titles (never ingredient names), so a query only an ingredient would
    // match finds nothing here.
    expect(
      computeSearchTier(
        dish({ currentStructuralSearchText: "Broth Section" }),
        "salt",
      ),
    ).toBeNull();
  });

  it("is tolerant of ordinary punctuation differences (§44.5)", () => {
    // Hyphen, space, and slash-separated forms of the same query must all
    // normalize identically, and match a title regardless of which
    // separator *it* uses too — "Lemon-Garlic Chicken" normalizes to
    // "lemon garlic chicken", which every query form below prefix-matches.
    const hyphenatedTitle = dish({ currentTitle: "Lemon-Garlic Chicken" });
    expect(computeSearchTier(hyphenatedTitle, "lemon garlic")).toBe(2);
    expect(computeSearchTier(hyphenatedTitle, "lemon-garlic")).toBe(2);
    expect(computeSearchTier(hyphenatedTitle, "lemon/garlic")).toBe(2);

    const spacedTitle = dish({ currentTitle: "Lemon Garlic Chicken" });
    expect(computeSearchTier(spacedTitle, "lemon-garlic")).toBe(2);
  });
});

describe("matchesRatingFilter / ratingNumericValue", () => {
  const actual = (value: number): PrincipalRating => ({
    kind: "actual",
    value,
    count: 3,
  });
  const provisional = (value: number): PrincipalRating => ({
    kind: "provisional",
    value,
    source: { type: "previous-version", versionLabel: "V1.0" },
  });
  const none: PrincipalRating = { kind: "none" };

  it("extracts a numeric value for both actual and provisional ratings, null for none", () => {
    expect(ratingNumericValue(actual(4.2))).toBe(4.2);
    expect(ratingNumericValue(provisional(4.2))).toBe(4.2);
    expect(ratingNumericValue(none)).toBeNull();
  });

  it("passes everything when no rating filter is selected", () => {
    expect(matchesRatingFilter(none, null)).toBe(true);
  });

  it("UNRATED matches only items with no rating value at all", () => {
    expect(matchesRatingFilter(none, "UNRATED")).toBe(true);
    expect(matchesRatingFilter(actual(1), "UNRATED")).toBe(false);
  });

  it("threshold filters include a provisional rating numerically (§48.4)", () => {
    expect(matchesRatingFilter(provisional(4.2), "FOUR_PLUS")).toBe(true);
    expect(matchesRatingFilter(provisional(3.9), "FOUR_PLUS")).toBe(false);
    expect(matchesRatingFilter(actual(3), "THREE_PLUS")).toBe(true);
    expect(matchesRatingFilter(actual(5), "FIVE")).toBe(true);
    expect(matchesRatingFilter(actual(4.9), "FIVE")).toBe(false);
  });
});

describe("compareDishesForSort", () => {
  const dish = (over: Partial<Parameters<typeof compareDishesForSort>[0]>) => ({
    currentTitle: "A",
    updatedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    ratingValue: null,
    lastCookedAt: null,
    durationMinutes: null,
    ...over,
  });

  it("Recently updated: newest updatedAt first", () => {
    const a = dish({ updatedAt: new Date("2026-01-02") });
    const b = dish({ updatedAt: new Date("2026-01-01") });
    expect(compareDishesForSort(a, b, "RECENTLY_UPDATED")).toBeLessThan(0);
  });

  it("Alphabetical: case-insensitive", () => {
    const a = dish({ currentTitle: "apple" });
    const b = dish({ currentTitle: "Banana" });
    expect(compareDishesForSort(a, b, "ALPHABETICAL")).toBeLessThan(0);
  });

  it("Rating: unrated always sorts last, both directions (§48.4)", () => {
    const rated = dish({ ratingValue: 4.5 });
    const unrated = dish({ ratingValue: null });
    expect(
      compareDishesForSort(unrated, rated, "RATING", "desc"),
    ).toBeGreaterThan(0);
    expect(
      compareDishesForSort(unrated, rated, "RATING", "asc"),
    ).toBeGreaterThan(0);
  });

  it("Rating desc orders highest-first, asc orders lowest-first, among rated items", () => {
    const high = dish({ ratingValue: 4.8 });
    const low = dish({ ratingValue: 3.1 });
    expect(compareDishesForSort(high, low, "RATING", "desc")).toBeLessThan(0);
    expect(compareDishesForSort(high, low, "RATING", "asc")).toBeGreaterThan(0);
  });

  it("a provisional (~) rating participates numerically between adjacent actual ratings (§48.4 example)", () => {
    const items = [
      dish({ currentTitle: "4.3", ratingValue: 4.3 }),
      dish({ currentTitle: "4.2-provisional", ratingValue: 4.2 }),
      dish({ currentTitle: "4.1", ratingValue: 4.1 }),
    ];
    const sorted = [...items].sort((a, b) =>
      compareDishesForSort(a, b, "RATING", "desc"),
    );
    expect(sorted.map((d) => d.currentTitle)).toEqual([
      "4.3",
      "4.2-provisional",
      "4.1",
    ]);
  });

  it("Recently cooked desc: never-cooked last (§48.5)", () => {
    const cooked = dish({ lastCookedAt: new Date("2026-01-01") });
    const neverCooked = dish({ lastCookedAt: null });
    expect(
      compareDishesForSort(neverCooked, cooked, "RECENTLY_COOKED", "desc"),
    ).toBeGreaterThan(0);
  });

  it("Recently cooked asc (least recently cooked): never-cooked first, then oldest-to-newest (§48.6)", () => {
    const neverCooked = dish({ lastCookedAt: null });
    const older = dish({ lastCookedAt: new Date("2025-01-01") });
    const newer = dish({ lastCookedAt: new Date("2026-01-01") });
    expect(
      compareDishesForSort(neverCooked, older, "RECENTLY_COOKED", "asc"),
    ).toBeLessThan(0);
    expect(
      compareDishesForSort(older, newer, "RECENTLY_COOKED", "asc"),
    ).toBeLessThan(0);
  });

  it("Duration: no-estimate items last, both directions (§48.7)", () => {
    const withEstimate = dish({ durationMinutes: 30 });
    const withoutEstimate = dish({ durationMinutes: null });
    expect(
      compareDishesForSort(withoutEstimate, withEstimate, "DURATION", "asc"),
    ).toBeGreaterThan(0);
    const shorter = dish({ durationMinutes: 15 });
    const longer = dish({ durationMinutes: 45 });
    expect(
      compareDishesForSort(shorter, longer, "DURATION", "asc"),
    ).toBeLessThan(0);
    expect(
      compareDishesForSort(shorter, longer, "DURATION", "desc"),
    ).toBeGreaterThan(0);
  });
});

describe("compareDishesForLibrary", () => {
  const item = (
    tier: number | null,
    over: Partial<Parameters<typeof compareDishesForSort>[0]> = {},
  ) => ({
    currentTitle: "A",
    updatedAt: new Date("2026-01-01"),
    createdAt: new Date("2026-01-01"),
    ratingValue: null,
    lastCookedAt: null,
    durationMinutes: null,
    searchTier: tier,
    ...over,
  });

  it("orders by search tier first when no Sort was explicitly chosen (relevance default)", () => {
    const tier1 = item(1, { updatedAt: new Date("2020-01-01") });
    const tier4 = item(4, { updatedAt: new Date("2026-01-01") });
    // Even though tier4 is "more recently updated", tier1 (exact title) wins
    // while a search query is active and no Sort was explicitly selected.
    expect(
      compareDishesForLibrary(tier1, tier4, "RECENTLY_UPDATED", true, false),
    ).toBeLessThan(0);
  });

  it("falls back to Recently updated as the deterministic tiebreaker within the same tier, absent an explicit Sort", () => {
    const older = item(3, { updatedAt: new Date("2020-01-01") });
    const newer = item(3, { updatedAt: new Date("2026-01-01") });
    expect(
      compareDishesForLibrary(newer, older, "RECENTLY_UPDATED", true, false),
    ).toBeLessThan(0);
  });

  it("ignores search tier entirely when no search is active", () => {
    const tier1ButOlder = item(1, { updatedAt: new Date("2020-01-01") });
    const noTierButNewer = item(null, { updatedAt: new Date("2026-01-01") });
    expect(
      compareDishesForLibrary(
        noTierButNewer,
        tier1ButOlder,
        "RECENTLY_UPDATED",
        false,
        false,
      ),
    ).toBeLessThan(0);
  });

  // Slice 10 correction: an explicitly selected Sort must control primary
  // order for every matching Dish while searching — relevance tier only
  // constrains which Dishes match, never how an explicit Sort orders them.
  it("Rating, explicitly selected, overrides relevance tier entirely", () => {
    const tier4HighRated = item(4, { ratingValue: 4.8 });
    const tier1LowRated = item(1, { ratingValue: 3.0 });
    expect(
      compareDishesForLibrary(
        tier4HighRated,
        tier1LowRated,
        "RATING",
        true,
        true,
        "desc",
      ),
    ).toBeLessThan(0);
  });

  it("Alphabetical, explicitly selected, overrides relevance tier entirely", () => {
    const tier4Later = item(4, { currentTitle: "Zucchini" });
    const tier1Earlier = item(1, { currentTitle: "Apple" });
    expect(
      compareDishesForLibrary(
        tier4Later,
        tier1Earlier,
        "ALPHABETICAL",
        true,
        true,
      ),
    ).toBeGreaterThan(0);
  });

  it("Last cooked (Recently cooked), explicitly selected, overrides relevance tier entirely", () => {
    const tier4RecentlyCooked = item(4, {
      lastCookedAt: new Date("2026-01-01"),
    });
    const tier1NeverCooked = item(1, { lastCookedAt: null });
    expect(
      compareDishesForLibrary(
        tier4RecentlyCooked,
        tier1NeverCooked,
        "RECENTLY_COOKED",
        true,
        true,
      ),
    ).toBeLessThan(0);
  });
});
