import "server-only";
import { cache } from "react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { DishKindValue } from "@/lib/dishes/schema";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import {
  buildLibraryWhere,
  compareDishesForLibrary,
  computeSearchTier,
  matchesRatingFilter,
  ratingNumericValue,
  searchQueryTokens,
  type LibraryFilters,
} from "@/lib/dishes/library-filters";
import {
  getPrincipalRatingsForDishes,
  type PrincipalRating,
} from "@/lib/reviews/queries";
import { getLastCookedAtForDishes } from "@/lib/cooking/queries";
import type { PrimaryRatingDisplayValue } from "@/lib/preferences/schema";

/**
 * Ownership guard (ARCHITECTURE_PROPOSAL.md §K.6): every mutation walks up
 * to the owning row via a query scoped by both `id` and `ownerId` together,
 * rather than fetching by id alone and checking ownership after the fact.
 *
 * Wrapped in React's `cache()`: every detail-type route's `generateMetadata`
 * and its page component both call this with identical args, so without
 * request-level memoization each request ran the lookup twice.
 */
export const getOwnedDishOrThrow = cache(async function getOwnedDishOrThrow(
  ownerId: string,
  dishId: string,
  kind?: DishKindValue,
) {
  const dish = await prisma.dish.findFirst({
    where: { id: dishId, ownerId, ...(kind ? { kind } : {}) },
  });
  if (!dish) {
    throw new NotFoundError(
      kind === "PART" ? "Part not found." : "Recipe not found.",
    );
  }
  return dish;
});

// Reusable select/include shapes (ARCHITECTURE_PROPOSAL.md §K.7).
export const dishCardSelect = {
  id: true,
  kind: true,
  stage: true,
  archivedAt: true,
  currentTitle: true,
  currentVersionId: true,
  createdAt: true,
  updatedAt: true,
  // Slice 10: tier-7 search fallback (Section names + linked Part-Version
  // titles) — never denormalized further, read live like everything else.
  currentStructuralSearchText: true,
  // Design remediation pass: the library grid renders the current
  // Version's image, when set — fetched here so `listDishes` stays the
  // one query the library page needs, not a second per-card round trip.
  // Slice 10: prep/cook time ride along too, for the "Shortest estimated
  // duration" sort (§48.7) — no second query per card.
  currentVersion: {
    select: {
      imageAssetId: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
    },
  },
  // Slice 9: the duplication-time rating snapshot (§19.1), read alongside
  // everything else the card needs so the library page can batch-resolve
  // every card's principal rating in one extra query rather than N.
  sourceKind: true,
  sourceAggregateRating: true,
  sourceRatingCount: true,
  sourceTitle: true,
  sourceDishVersionLabel: true,
  // Slice 10: tags/Flavor profiles are queried live at search/filter time
  // (Arch round-3 Correction 6 — never denormalized), and the same join
  // also yields each card's Favorite state and searchable name lists at no
  // extra query cost.
  tags: {
    select: { tag: { select: { displayName: true, isFavorite: true } } },
  },
  flavorProfiles: {
    select: { flavorProfileValue: { select: { displayName: true } } },
  },
  cuisines: {
    select: { cuisine: { select: { displayName: true, position: true } } },
  },
} as const;

export const sectionContentInclude = {
  orderBy: { position: "asc" as const },
  include: {
    ingredients: {
      orderBy: { position: "asc" as const },
      include: { substitute: true },
    },
    instructions: { orderBy: { position: "asc" as const } },
  },
};

/**
 * Slice 6: `PartLink` has no Prisma relation to `Section` (raw-SQL
 * composite FK only, per schema.prisma's own comment on `Section.partLinks`
 * — the consistency check is enforced at the DB level, not surfaced as a
 * Prisma-navigable back-relation). A `DishVersion`'s linked Parts —
 * top-level (`sectionId: null`) and Section-nested alike — are fetched as
 * one flat, ordered list directly off `DishVersion.partLinks` and bucketed
 * by `sectionId` afterward (`mappers.ts`'s `versionContentToInput`), never
 * nested under `sections` in the Prisma include itself. Only `LIVE` rows —
 * a `MATERIALIZED` row (Part-deletion history, not exercised until
 * propagation/deletion-materialization work) has no live target to resolve.
 */
export const partLinkContentInclude = {
  where: { linkState: "LIVE" as const },
  orderBy: { position: "asc" as const },
  select: {
    id: true,
    lineageId: true,
    sectionId: true,
    position: true,
    multiplier: true,
    targetDishId: true,
    targetDishVersionId: true,
  },
} as const;

/**
 * Sibling of `partLinkContentInclude` above with no `linkState` filter, for
 * callers that must faithfully reproduce a Version's content rather than
 * show/diff only its live-editable surface — see
 * `getDishScopedVersionContentForReuseOrThrow`'s doc comment below.
 */
export const partLinkContentIncludeAllStates = {
  orderBy: { position: "asc" as const },
  select: {
    id: true,
    lineageId: true,
    sectionId: true,
    position: true,
    multiplier: true,
    linkState: true,
    targetDishId: true,
    targetDishVersionId: true,
    materializedTitle: true,
    materializedVersionLabel: true,
    materializedContent: true,
  },
} as const;

export const dishDetailInclude = {
  currentVersion: {
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  },
  // Slice 5, PRODUCT_SPEC.md §53.6: needed so the detail view can apply a
  // saved per-ingredient preferred unit consistently on load, not just
  // after an in-session "accept" action.
  preferredUnitOverrides: true,
  // Slice 10: current tag/Flavor-profile selections for the detail page's
  // one-tap Favorite toggle, tag/Flavor-profile editor popover, and their
  // read-only display chips.
  tags: {
    select: {
      tagId: true,
      tag: { select: { displayName: true, isFavorite: true } },
    },
  },
  flavorProfiles: {
    select: {
      flavorProfileValueId: true,
      flavorProfileValue: { select: { displayName: true } },
    },
  },
  // PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): same shape as
  // tags/Flavor profiles above — zero, one, or several per Dish.
  cuisines: {
    select: {
      cuisineId: true,
      cuisine: { select: { displayName: true, position: true } },
    },
  },
} as const;

const librarySortValueSet = new Set<string>(["RECENTLY_COOKED"]);

/**
 * BUILD_PLAN.md Slice 10 — the full search/filter/sort query builder shared
 * by `/recipes` and `/parts` (Arch §C.7). Runs one Dish query (base filters
 * AND, when searching, a broad OR pre-filter across every searchable field),
 * then applies the pure ranking/rating/sort logic from `library-filters.ts`
 * — proportionate to a personal library's scale rather than a second
 * database round trip per candidate.
 */
export async function queryDishLibrary(
  ownerId: string,
  kind: DishKindValue,
  filters: LibraryFilters,
  ratingPreference: PrimaryRatingDisplayValue,
) {
  const searchActive = filters.search.trim().length > 0;
  // Slice 10 correction (§44.5's punctuation tolerance): tokenizing the
  // query and OR-ing every field against each token — rather than a single
  // `contains: filters.search` — keeps this prefilter a strict superset of
  // what `computeSearchTier`'s punctuation-normalized matching will accept
  // below. A verbatim `contains` on "lemon garlic" would never match a
  // stored "Lemon-Garlic Chicken" (the hyphen breaks the substring), so the
  // JS ranking layer would never even see that candidate. Falls back to the
  // raw query when it normalizes to no tokens at all (e.g. punctuation-only
  // input) — harmless, since `computeSearchTier` will then rank everything
  // null anyway.
  const searchTokens = searchActive
    ? (() => {
        const tokens = searchQueryTokens(filters.search);
        return tokens.length ? tokens : [filters.search];
      })()
    : [];
  const where: Prisma.DishWhereInput = {
    ...buildLibraryWhere(ownerId, kind, filters),
    ...(searchActive
      ? {
          OR: searchTokens.flatMap((token): Prisma.DishWhereInput[] => [
            { currentTitle: { contains: token, mode: "insensitive" } },
            {
              cuisines: {
                some: {
                  cuisine: {
                    displayName: { contains: token, mode: "insensitive" },
                  },
                },
              },
            },
            {
              currentStructuralSearchText: {
                contains: token,
                mode: "insensitive",
              },
            },
            {
              tags: {
                some: {
                  tag: {
                    displayName: { contains: token, mode: "insensitive" },
                  },
                },
              },
            },
            {
              flavorProfiles: {
                some: {
                  flavorProfileValue: {
                    displayName: { contains: token, mode: "insensitive" },
                  },
                },
              },
            },
          ]),
        }
      : {}),
  };

  const rows = await prisma.dish.findMany({ where, select: dishCardSelect });

  let candidates = rows;
  const tierById = new Map<string, number>();
  if (searchActive) {
    candidates = rows.filter((row) => {
      const tier = computeSearchTier(
        {
          currentTitle: row.currentTitle,
          cuisineNames: row.cuisines
            .map((c) => c.cuisine)
            .sort((a, b) => a.position - b.position)
            .map((c) => c.displayName),
          currentStructuralSearchText: row.currentStructuralSearchText,
          tagNames: row.tags.map((t) => t.tag.displayName),
          flavorProfileNames: row.flavorProfiles.map(
            (f) => f.flavorProfileValue.displayName,
          ),
        },
        filters.search,
      );
      if (tier == null) return false;
      tierById.set(row.id, tier);
      return true;
    });
  }

  const ratingInputs = candidates.map((row) => ({
    id: row.id,
    currentVersionId: row.currentVersionId,
    sourceKind: row.sourceKind,
    sourceAggregateRating: decimalToNumber(row.sourceAggregateRating),
    sourceRatingCount: row.sourceRatingCount,
    sourceTitle: row.sourceTitle,
    sourceDishVersionLabel: row.sourceDishVersionLabel,
  }));
  const ratings = await getPrincipalRatingsForDishes(
    ratingInputs,
    ratingPreference,
  );

  const filtered = filters.rating
    ? candidates.filter((row) =>
        matchesRatingFilter(
          ratings.get(row.id) ?? ({ kind: "none" } as PrincipalRating),
          filters.rating,
        ),
      )
    : candidates;

  const lastCookedMap = librarySortValueSet.has(filters.sort)
    ? await getLastCookedAtForDishes(
        ownerId,
        filtered.map((row) => row.id),
        kind,
      )
    : null;

  const decorated = filtered.map((row) => {
    const rating = ratings.get(row.id) ?? ({ kind: "none" } as PrincipalRating);
    const prep = row.currentVersion?.prepTimeMinutes ?? null;
    const cook = row.currentVersion?.cookTimeMinutes ?? null;
    return {
      row,
      rating,
      searchTier: tierById.get(row.id) ?? null,
      ratingValue: ratingNumericValue(rating),
      lastCookedAt: lastCookedMap?.get(row.id) ?? null,
      durationMinutes:
        prep != null || cook != null ? (prep ?? 0) + (cook ?? 0) : null,
    };
  });

  decorated.sort((a, b) =>
    compareDishesForLibrary(
      {
        currentTitle: a.row.currentTitle,
        updatedAt: a.row.updatedAt,
        createdAt: a.row.createdAt,
        ratingValue: a.ratingValue,
        lastCookedAt: a.lastCookedAt,
        durationMinutes: a.durationMinutes,
        searchTier: a.searchTier,
      },
      {
        currentTitle: b.row.currentTitle,
        updatedAt: b.row.updatedAt,
        createdAt: b.row.createdAt,
        ratingValue: b.ratingValue,
        lastCookedAt: b.lastCookedAt,
        durationMinutes: b.durationMinutes,
        searchTier: b.searchTier,
      },
      filters.sort,
      searchActive,
      filters.sortIsExplicit,
      filters.sortDirection,
    ),
  );

  return decorated.map(({ row, rating }) => ({
    id: row.id,
    currentTitle: row.currentTitle,
    stage: row.stage,
    cuisineNames: row.cuisines
      .map((c) => c.cuisine)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.displayName),
    updatedAt: row.updatedAt,
    imageAssetId: row.currentVersion?.imageAssetId ?? null,
    isFavorite: row.tags.some((t) => t.tag.isFavorite),
    rating,
  }));
}

// Wrapped in React's `cache()` for the same reason as getOwnedDishOrThrow
// above — the recipe/part detail page's `generateMetadata` and page
// component both call this with identical args in one request.
export const getOwnedDishDetailOrThrow = cache(
  async function getOwnedDishDetailOrThrow(
    ownerId: string,
    dishId: string,
    kind: DishKindValue,
  ) {
    const dish = await prisma.dish.findFirst({
      where: { id: dishId, ownerId, kind },
      include: dishDetailInclude,
    });
    if (!dish) {
      throw new NotFoundError(
        kind === "PART" ? "Part not found." : "Recipe not found.",
      );
    }
    return dish;
  },
);

export function getVersionContent(dishVersionId: string) {
  return prisma.dishVersion.findUniqueOrThrow({
    where: { id: dishVersionId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
}

/**
 * A specific Version's full content, scoped by `dishId` (not just its own
 * `id`) so a versionId from one Dish can never resolve against another —
 * the actual ownership guard, shared by every Slice 4 caller that needs a
 * *specific* (not necessarily current) Version: `editDish`'s base-version
 * resolution (service.ts) and the version-detail/compare routes below.
 */
export async function getDishScopedVersionContentOrThrow(
  dishId: string,
  versionId: string,
) {
  const version = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }
  return version;
}

/**
 * Code-audit fidelity fix (2026-08-27): the `LIVE`-only sibling above exists
 * for callers that only ever show/diff *editable* content (the editor, the
 * comparison views) — a MATERIALIZED occurrence isn't user-editable, so it's
 * correctly invisible there. But a caller whose whole purpose is to
 * *faithfully reproduce* a Version's actual content (duplicate, promote,
 * re-materialize, propagate/resolve-around-one-occurrence) must not treat
 * "LIVE-only" as "the real content" — doing so silently drops a legitimately
 * frozen historical snapshot. This variant includes both `linkState`s plus
 * the MATERIALIZED-only fields; see `dishes/service.ts`'s
 * `toInsertablePartLinkInput`/`versionContentToInsertableInput` for how a
 * MATERIALIZED row is carried through unchanged (never re-walked — it's
 * already frozen JSON) rather than dropped.
 */
export async function getDishScopedVersionContentForReuseOrThrow(
  dishId: string,
  versionId: string,
) {
  const version = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentIncludeAllStates,
    },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }
  return version;
}

/**
 * Version-trigger correction pass, extended by the Slice 13 metadata-
 * classification correction pass: a lighter-weight sibling of
 * `getDishScopedVersionContentOrThrow` for callers that only need to read
 * or update a Version's own mutable metadata (description/image/yield/prep
 * time/cook time/difficulty/nutrition) — `updateVersionMetadata`
 * (service.ts) doesn't need that Version's full Section/Ingredient/
 * Instruction/linked-Part content just to validate it belongs to this Dish
 * and read its current metadata values.
 */
export async function getDishScopedVersionMetaOrThrow(
  dishId: string,
  versionId: string,
) {
  const version = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId },
    select: {
      id: true,
      description: true,
      imageAssetId: true,
      yieldQuantity: true,
      yieldUnit: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
      difficulty: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      nutritionBasis: true,
      nutritionBasisQuantity: true,
      nutritionBasisUnit: true,
      moreNutrients: true,
      nutritionSourceProvider: true,
      nutritionSourceId: true,
      nutritionSourceName: true,
    },
  });
  if (!version) {
    throw new NotFoundError("Version not found.");
  }
  return version;
}

/**
 * Combines the ownership guard (§K.6) with the dish-scoped version lookup
 * above — used by the version-detail and comparison routes, which need
 * both the owning Dish (stage, currentVersionId, cuisine) and one specific
 * Version's full content.
 */
// Wrapped in React's `cache()` for the same reason as getOwnedDishOrThrow
// above — the version-detail page's `generateMetadata` and page component
// both call this with identical args in one request.
export const getOwnedVersionDetailOrThrow = cache(
  async function getOwnedVersionDetailOrThrow(
    ownerId: string,
    dishId: string,
    versionId: string,
    kind?: DishKindValue,
  ) {
    const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
    const version = await getDishScopedVersionContentOrThrow(
      dish.id,
      versionId,
    );
    return { dish, version };
  },
);

// Ordered ascending by version number (chronological, since major/minor only
// ever increase) — backs the Version selector/pager (PRODUCT_SPEC.md §13.8)
// and the comparison picker's version lists.
export function listDishVersionSummaries(dishId: string) {
  return prisma.dishVersion.findMany({
    where: { dishId },
    select: {
      id: true,
      majorVersion: true,
      minorVersion: true,
      title: true,
      versionNote: true,
      sourceVersionId: true,
      createdAt: true,
    },
    orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
  });
}
export type DishVersionSummary = Awaited<
  ReturnType<typeof listDishVersionSummaries>
>[number];

const EXPORT_VERSION_PAGE_SIZE = 25;

export type ExportableVersionOption = {
  id: string;
  majorVersion: number;
  minorVersion: number;
};

/**
 * Code-audit fix (2026-08-27, second follow-up): lean, paginated sibling of
 * `listDishVersionSummaries` for the Export dialog's Version-selection
 * dropdown (`DishDetailActions`) only — that dropdown only ever needs
 * {id, majorVersion, minorVersion}, and unlike the general Version History
 * pager/comparison picker (which intentionally load a Dish's complete
 * Version list via `listDishVersionSummaries`, left untouched), it must not
 * eagerly fetch/render a heavily-edited Dish's unbounded history. Fetched
 * newest-first internally so a bounded page always captures the current
 * Version and its most recent history first, then reversed to this
 * codebase's usual ascending display order before returning — callers never
 * see the internal ordering. `cursor` (the oldest version id already
 * loaded) fetches the next, older page; `hasMore` tells the caller whether
 * an even-older page still exists.
 */
export async function listExportableVersionsPage(
  dishId: string,
  cursor?: string,
): Promise<{ versions: ExportableVersionOption[]; hasMore: boolean }> {
  const rows = await prisma.dishVersion.findMany({
    where: { dishId },
    select: { id: true, majorVersion: true, minorVersion: true },
    orderBy: [{ majorVersion: "desc" }, { minorVersion: "desc" }],
    take: EXPORT_VERSION_PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > EXPORT_VERSION_PAGE_SIZE;
  return {
    versions: rows.slice(0, EXPORT_VERSION_PAGE_SIZE).reverse(),
    hasMore,
  };
}

// Same ordering/scope as `listDishVersionSummaries` above, but with each
// Version's own authored yield instead of title/note metadata — backs the
// Send/Publish/Add-Edit-meal Version pickers, whose `DishYieldScalingField`-
// driven callers need the chosen Version's own yield, not just its label.
export function listDishVersionYieldOptions(dishId: string) {
  return prisma.dishVersion.findMany({
    where: { dishId },
    select: {
      id: true,
      majorVersion: true,
      minorVersion: true,
      yieldQuantity: true,
      yieldUnit: true,
    },
    orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
  });
}

// PRODUCT_SPEC.md §13.5: current = highest major, then highest minor within
// it — the highest existing majorVersion alone tells the editor which line
// is current, needed to label "Start a new version" correctly regardless of
// which major line is being edited (Arch §F.5).
export async function getHighestMajorVersion(dishId: string): Promise<number> {
  const result = await prisma.dishVersion.aggregate({
    where: { dishId },
    _max: { majorVersion: true },
  });
  return result._max.majorVersion ?? 0;
}

/**
 * Slice 4 correction pass §1: the editor's "Saves as VX.Y" projected label
 * must reflect `MAX(minorVersion) + 1` within the selected base's major
 * line — not `base.minorVersion + 1` — since branching from an older saved
 * minor (when later ones already exist) still allocates the line's next
 * overall minor, never renumbering or colliding with an existing one.
 */
export async function getHighestMinorVersion(
  dishId: string,
  majorVersion: number,
): Promise<number> {
  const result = await prisma.dishVersion.aggregate({
    where: { dishId, majorVersion },
    _max: { minorVersion: true },
  });
  return result._max.minorVersion ?? 0;
}

/**
 * PRODUCT_SPEC.md §39.5 — the editor's "you're editing a historical Version"
 * banner needs the *current* Version's own label, not just the base being
 * edited. Returns null when there's no current Version to compare against.
 */
export async function getDishVersionMajorMinor(
  dishId: string,
  versionId: string | null,
): Promise<{ majorVersion: number; minorVersion: number } | null> {
  if (!versionId) return null;
  return prisma.dishVersion.findFirst({
    where: { id: versionId, dishId },
    select: { majorVersion: true, minorVersion: true },
  });
}

/**
 * Slice 6, PRODUCT_SPEC.md §68: candidate Parts an owner may attach —
 * every owned, non-archived Part, excluding the Part currently being
 * edited itself when one is given (a cheap self-attach guard on top of
 * the real identity-level cycle check, which rejects indirect self-
 * composition too).
 */
/**
 * Design pass (rich selection-row unification): resolves the same Stage/
 * cuisine/rating/image data `listCookablePickerItems` does, so the
 * Attach-a-Part picker's rows share the exact same rich treatment as every
 * other Recipe/Part picker instead of showing a thinner subset.
 */
export async function listAttachableParts(
  ownerId: string,
  excludeDishId?: string,
) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId: ownerId },
    select: { primaryRatingDisplay: true },
  });

  const parts = await prisma.dish.findMany({
    where: {
      ownerId,
      kind: "PART",
      archivedAt: null,
      currentVersionId: { not: null },
      ...(excludeDishId ? { id: { not: excludeDishId } } : {}),
    },
    select: {
      id: true,
      stage: true,
      currentTitle: true,
      currentVersionId: true,
      sourceKind: true,
      sourceAggregateRating: true,
      sourceRatingCount: true,
      sourceTitle: true,
      sourceDishVersionLabel: true,
      currentVersion: {
        select: {
          imageAssetId: true,
          majorVersion: true,
          minorVersion: true,
        },
      },
      // Slice 23 Start-cooking picker pass: the same restrained tag
      // treatment as the cooking picker's result rows — Favorite is its own
      // star elsewhere, never listed as an ordinary tag.
      tags: {
        select: { tag: { select: { displayName: true, isFavorite: true } } },
      },
      cuisines: {
        select: { cuisine: { select: { displayName: true, position: true } } },
      },
    },
    orderBy: { currentTitle: "asc" },
  });

  const ratings = await getPrincipalRatingsForDishes(
    parts.map((part) => ({
      id: part.id,
      currentVersionId: part.currentVersionId,
      sourceKind: part.sourceKind,
      sourceAggregateRating: decimalToNumber(part.sourceAggregateRating),
      sourceRatingCount: part.sourceRatingCount,
      sourceTitle: part.sourceTitle,
      sourceDishVersionLabel: part.sourceDishVersionLabel,
    })),
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
  );

  return parts.map((part) => ({
    id: part.id,
    stage: part.stage,
    cuisineNames: part.cuisines
      .map((c) => c.cuisine)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.displayName),
    currentTitle: part.currentTitle,
    currentVersionId: part.currentVersionId,
    versionLabel: part.currentVersion
      ? versionLabel(
          part.currentVersion.majorVersion,
          part.currentVersion.minorVersion,
        )
      : "",
    imageAssetId: part.currentVersion?.imageAssetId ?? null,
    tags: part.tags
      .filter((t) => !t.tag.isFavorite)
      .map((t) => t.tag.displayName),
    rating: ratings.get(part.id) ?? ({ kind: "none" } as PrincipalRating),
  }));
}
export type AttachablePart = Awaited<
  ReturnType<typeof listAttachableParts>
>[number];

/**
 * Slice 23 — candidate list for the "What will you cook?" picker
 * (Home dashboard / Cook page): every owned, non-archived Recipe and Part
 * with a current Version, combined so the picker's All/Recipes/Parts tabs
 * can filter client-side. Design pass (rich selection-row unification):
 * resolves the same Version/Stage/cuisine/rating data
 * `listShareableItemsForSender` does, so this picker's rows share the exact
 * same rich treatment.
 */
export async function listCookablePickerItems(ownerId: string) {
  const preference = await prisma.userPreference.findUnique({
    where: { userId: ownerId },
    select: { primaryRatingDisplay: true },
  });

  const dishes = await prisma.dish.findMany({
    where: { ownerId, archivedAt: null, currentVersionId: { not: null } },
    select: {
      id: true,
      kind: true,
      stage: true,
      currentTitle: true,
      currentVersionId: true,
      sourceKind: true,
      sourceAggregateRating: true,
      sourceRatingCount: true,
      sourceTitle: true,
      sourceDishVersionLabel: true,
      currentVersion: {
        select: {
          imageAssetId: true,
          majorVersion: true,
          minorVersion: true,
        },
      },
      tags: {
        select: { tag: { select: { displayName: true, isFavorite: true } } },
      },
      cuisines: {
        select: { cuisine: { select: { displayName: true, position: true } } },
      },
    },
    orderBy: { currentTitle: "asc" },
  });

  const ratings = await getPrincipalRatingsForDishes(
    dishes.map((dish) => ({
      id: dish.id,
      currentVersionId: dish.currentVersionId,
      sourceKind: dish.sourceKind,
      sourceAggregateRating: decimalToNumber(dish.sourceAggregateRating),
      sourceRatingCount: dish.sourceRatingCount,
      sourceTitle: dish.sourceTitle,
      sourceDishVersionLabel: dish.sourceDishVersionLabel,
    })),
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
  );

  return dishes.map((dish) => ({
    id: dish.id,
    kind: dish.kind,
    stage: dish.stage,
    cuisineNames: dish.cuisines
      .map((c) => c.cuisine)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.displayName),
    currentTitle: dish.currentTitle,
    versionLabel: dish.currentVersion
      ? versionLabel(
          dish.currentVersion.majorVersion,
          dish.currentVersion.minorVersion,
        )
      : "",
    imageAssetId: dish.currentVersion?.imageAssetId ?? null,
    tags: dish.tags
      .filter((t) => !t.tag.isFavorite)
      .map((t) => t.tag.displayName),
    isFavorite: dish.tags.some((t) => t.tag.isFavorite),
    rating: ratings.get(dish.id) ?? ({ kind: "none" } as PrincipalRating),
  }));
}
export type CookablePickerItem = Awaited<
  ReturnType<typeof listCookablePickerItems>
>[number];

/**
 * PRODUCT_SPEC.md §71 "Recipes using this Part" — current usages only
 * (historical usages remain discoverable through Version history, per
 * §71's "primary view emphasizes current Recipe Versions"). Scoped to
 * `LIVE` links whose container is some Dish's *current* Version, owned by
 * the same owner as the Part itself (no cross-account linking exists yet).
 */
export type PartUsage = {
  id: string;
  lineageId: string;
  containerDishId: string;
  containerKind: DishKindValue;
  containerTitle: string;
  containerVersionId: string;
  containerMajorVersion: number;
  containerMinorVersion: number;
  targetDishVersionId: string;
  sectionName: string | null; // null = top-level occurrence
};

export async function listCurrentPartUsages(
  ownerId: string,
  partDishId: string,
): Promise<PartUsage[]> {
  const links = await prisma.partLink.findMany({
    where: {
      targetDishId: partDishId,
      linkState: "LIVE",
      containerVersion: { currentFor: { isNot: null }, dish: { ownerId } },
    },
    select: {
      id: true,
      lineageId: true,
      sectionId: true,
      targetDishVersionId: true,
      containerVersion: {
        select: {
          id: true,
          majorVersion: true,
          minorVersion: true,
          dish: { select: { id: true, kind: true, currentTitle: true } },
        },
      },
    },
    // Top-level occurrences (`sectionId: null`) first — Postgres sorts NULL
    // first on an ascending order by default — so when a container has more
    // than one live direct occurrence (see the dedupe below), the top-level
    // one is the one kept, matching how `sectionName: null` already reads
    // as "the" occurrence rather than one of several.
    orderBy: [{ sectionId: "asc" }, { id: "asc" }],
  });

  const sectionIds = links
    .map((link) => link.sectionId)
    .filter((id): id is string => !!id);
  const sections = sectionIds.length
    ? await prisma.section.findMany({
        where: { id: { in: sectionIds } },
        select: { id: true, name: true },
      })
    : [];
  const sectionNameById = new Map(sections.map((s) => [s.id, s.name]));

  // §71: "Recipes using this Part," not "occurrences" — a container Dish
  // that links this Part more than once (top-level and Section-nested, or
  // in two different Sections) still surfaces as exactly one row. The
  // direct-duplicate invariant (`findDuplicatePartTargets`) prevents this
  // for content saved through the ordinary editor, but isn't a DB
  // constraint (schema.ts's own doc comment) and predates Slice 6 post-gate
  // — this dedupe is the defensive backstop for any container whose extra
  // direct occurrence(s) got here some other way (legacy data, a path that
  // doesn't call that validation), so this view — and the propagation
  // picker/"Update everywhere" that reads it — never shows or acts on more
  // than one row per container Dish.
  const seenContainerDishIds = new Set<string>();
  const usages: PartUsage[] = [];
  for (const link of links) {
    const containerDishId = link.containerVersion.dish.id;
    if (seenContainerDishIds.has(containerDishId)) continue;
    seenContainerDishIds.add(containerDishId);
    usages.push({
      id: link.id,
      lineageId: link.lineageId,
      containerDishId,
      containerKind: link.containerVersion.dish.kind,
      containerTitle: link.containerVersion.dish.currentTitle ?? "Untitled",
      containerVersionId: link.containerVersion.id,
      containerMajorVersion: link.containerVersion.majorVersion,
      containerMinorVersion: link.containerVersion.minorVersion,
      // Guaranteed non-null: the CHECK constraint requires both target
      // fields whenever `linkState = LIVE` (schema.prisma §D.6).
      targetDishVersionId: link.targetDishVersionId!,
      sectionName: link.sectionId
        ? (sectionNameById.get(link.sectionId) ?? null)
        : null,
    });
  }
  return usages;
}

/**
 * Slice 22 logged-in polish pass — the Home dashboard's "Recently updated"
 * section: the most recently changed Recipes and Parts combined into one
 * list, newest first. Archived items are excluded, matching the library's
 * own default filter (`buildLibraryWhere`) — this is a "return to current
 * work" surface, not a full history. Returns `DishCardItem`-shaped rows
 * (`imageAssetId` hardcoded null — the Home list renders `DishCompactCard`,
 * which never shows an image, so it isn't queried) so Home can render the
 * exact same compact-list card `/recipes` and `/parts` use.
 */
export async function listRecentlyUpdatedDishes(
  ownerId: string,
  limit: number,
  ratingPreference: PrimaryRatingDisplayValue,
) {
  const dishes = await prisma.dish.findMany({
    where: { ownerId, stage: { not: "ARCHIVED" } },
    select: {
      id: true,
      kind: true,
      currentTitle: true,
      stage: true,
      updatedAt: true,
      currentVersionId: true,
      sourceKind: true,
      sourceAggregateRating: true,
      sourceRatingCount: true,
      sourceTitle: true,
      sourceDishVersionLabel: true,
      tags: { select: { tag: { select: { isFavorite: true } } } },
      cuisines: {
        select: { cuisine: { select: { displayName: true, position: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  const ratingInputs = dishes.map((dish) => ({
    id: dish.id,
    currentVersionId: dish.currentVersionId,
    sourceKind: dish.sourceKind,
    sourceAggregateRating: decimalToNumber(dish.sourceAggregateRating),
    sourceRatingCount: dish.sourceRatingCount,
    sourceTitle: dish.sourceTitle,
    sourceDishVersionLabel: dish.sourceDishVersionLabel,
  }));
  const ratings = await getPrincipalRatingsForDishes(
    ratingInputs,
    ratingPreference,
  );
  return dishes.map((dish) => ({
    id: dish.id,
    kind: dish.kind,
    currentTitle: dish.currentTitle,
    stage: dish.stage,
    cuisineNames: dish.cuisines
      .map((c) => c.cuisine)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.displayName),
    updatedAt: dish.updatedAt,
    imageAssetId: null,
    isFavorite: dish.tags.some((t) => t.tag.isFavorite),
    rating: ratings.get(dish.id) ?? { kind: "none" as const },
  }));
}
