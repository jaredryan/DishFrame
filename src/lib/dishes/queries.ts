import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { DishKindValue } from "@/lib/dishes/schema";
import { decimalToNumber } from "@/lib/dishes/format";
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
 */
export async function getOwnedDishOrThrow(
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
}

// Reusable select/include shapes (ARCHITECTURE_PROPOSAL.md §K.7).
export const dishCardSelect = {
  id: true,
  kind: true,
  stage: true,
  cuisine: true,
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
} as const;

const librarySortValueSet = new Set<string>([
  "RECENTLY_COOKED",
  "LEAST_RECENTLY_COOKED",
]);

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
            { cuisine: { contains: token, mode: "insensitive" } },
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
          cuisine: row.cuisine,
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
    ),
  );

  return decorated.map(({ row, rating }) => ({
    id: row.id,
    currentTitle: row.currentTitle,
    stage: row.stage,
    cuisine: row.cuisine,
    updatedAt: row.updatedAt,
    imageAssetId: row.currentVersion?.imageAssetId ?? null,
    isFavorite: row.tags.some((t) => t.tag.isFavorite),
    rating,
  }));
}

export async function getOwnedDishDetailOrThrow(
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
}

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
export async function getOwnedVersionDetailOrThrow(
  ownerId: string,
  dishId: string,
  versionId: string,
  kind?: DishKindValue,
) {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  const version = await getDishScopedVersionContentOrThrow(dish.id, versionId);
  return { dish, version };
}

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
export async function listAttachableParts(
  ownerId: string,
  excludeDishId?: string,
) {
  return prisma.dish.findMany({
    where: {
      ownerId,
      kind: "PART",
      archivedAt: null,
      currentVersionId: { not: null },
      ...(excludeDishId ? { id: { not: excludeDishId } } : {}),
    },
    select: { id: true, currentTitle: true, currentVersionId: true },
    orderBy: { currentTitle: "asc" },
  });
}
export type AttachablePart = Awaited<
  ReturnType<typeof listAttachableParts>
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

  return links.map((link) => ({
    id: link.id,
    lineageId: link.lineageId,
    containerDishId: link.containerVersion.dish.id,
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
  }));
}

/**
 * Every distinct cuisine this owner has already used on this Dish kind,
 * newest first — backs the editor's Cuisine combobox (Gate 2 remediation:
 * PRODUCT_SPEC.md §46.3's "free-text values with suggestions based on the
 * user's existing values", not a rigid taxonomy).
 */
export async function listDistinctCuisines(
  ownerId: string,
  kind: DishKindValue,
): Promise<string[]> {
  const rows = await prisma.dish.findMany({
    where: { ownerId, kind, cuisine: { not: null } },
    select: { cuisine: true },
    distinct: ["cuisine"],
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .map((row) => row.cuisine)
    .filter((cuisine): cuisine is string => !!cuisine);
}
