import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  getPrincipalRatingsForDishes,
  type PrincipalRating,
} from "@/lib/reviews/queries";
import { getLastCookedAtForDishes } from "@/lib/cooking/queries";
import { ratingNumericValue } from "@/lib/dishes/library-filters";
import type { RecommendationCandidate } from "@/lib/mealplans/recommendations";

/**
 * Meal Plan domain queries (BUILD_PLAN.md Slice 15, ARCHITECTURE_PROPOSAL.md
 * §K.4). Framework-agnostic Prisma reads, mirroring `grocery/queries.ts`'s
 * shape for this module.
 */

function mealPlanDetailInclude() {
  return {
    entries: {
      orderBy: [{ cookDate: "asc" as const }, { id: "asc" as const }],
      include: { plannedMeals: { orderBy: { date: "asc" as const } } },
    },
    linkedGroceryLists: {
      orderBy: { createdAt: "desc" as const },
      select: { id: true, title: true, mode: true, completedAt: true },
    },
  };
}

// Wrapped in React's `cache()`: the meal plan detail page's
// `generateMetadata` and page component both call this with identical args
// in one request.
export const getOwnedMealPlanOrThrow = cache(
  async function getOwnedMealPlanOrThrow(ownerId: string, id: string) {
    const mealPlan = await prisma.mealPlan.findFirst({
      where: { id, ownerId },
      include: mealPlanDetailInclude(),
    });
    if (!mealPlan) throw new NotFoundError("Meal Plan not found.");
    return mealPlan;
  },
);
export type OwnedMealPlan = Awaited<ReturnType<typeof getOwnedMealPlanOrThrow>>;
export type OwnedMealPlanEntry = OwnedMealPlan["entries"][number];

// Slice 22 logged-in polish pass — split into Active/Completed (mirroring
// `grocery/queries.ts#listGroceryListsForOwner`'s shape), reusing
// PRODUCT_SPEC.md §78's "Past Meal Plans remain accessible" via the
// Completed column rather than a single undifferentiated list.
export async function listMealPlansForOwner(ownerId: string) {
  const mealPlans = await prisma.mealPlan.findMany({
    where: { ownerId },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      completedAt: true,
      _count: { select: { entries: true } },
    },
    orderBy: { startDate: "desc" },
  });
  return {
    active: mealPlans.filter((p) => p.completedAt == null),
    completed: mealPlans
      .filter((p) => p.completedAt != null)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime()),
  };
}

/**
 * Every owned Recipe/Part with a current Version — the candidate pool for
 * the plan-entry picker (§76.2). Carries the current Version's own authored
 * yield, the same convention `grocery/queries.ts#listGrocerySourceCandidates`
 * already established for target-yield scaling.
 */
export async function listMealPlanEntryCandidates(ownerId: string) {
  const dishes = await prisma.dish.findMany({
    where: { ownerId, archivedAt: null, currentVersionId: { not: null } },
    select: {
      id: true,
      kind: true,
      currentTitle: true,
      currentVersionId: true,
      currentVersion: { select: { yieldQuantity: true, yieldUnit: true } },
    },
    orderBy: { currentTitle: "asc" },
  });
  return dishes.map((dish) => ({
    dishId: dish.id,
    kind: dish.kind,
    title: dish.currentTitle ?? "Untitled",
    dishVersionId: dish.currentVersionId!,
    yieldQuantity: decimalToNumber(dish.currentVersion?.yieldQuantity ?? null),
    yieldUnit: dish.currentVersion?.yieldUnit ?? null,
  }));
}
export type MealPlanEntryCandidate = Awaited<
  ReturnType<typeof listMealPlanEntryCandidates>
>[number];

/**
 * Recommendation-eligibility counts (§80) — two cheap counts (not a full
 * candidate load) distinguishing "the account owns no Recipes at all" from
 * "the account owns Recipes, but every one is currently ineligible for
 * recommendations." `eligibleRecipeCount`'s `where` is deliberately the
 * exact same clause `listRecommendationCandidates` below uses (RECIPE,
 * `archivedAt: null`, has a current Version) — not a hand-rewritten
 * equivalent — so the two can't silently drift apart. Archiving a Dish
 * *is* setting its Stage to `ARCHIVED` (`dishes/service.ts#archiveDish`
 * calls `updateDishStage(..., "ARCHIVED", ...)`, which derives
 * `archivedAt` from that Stage via `nextArchivedAt`) — one fact, not two —
 * so `archivedAt: null` alone already excludes Stage-`ARCHIVED` Recipes;
 * `rankMealPlanRecommendations`'s own unconditional `stage !== "ARCHIVED"`
 * filter is just defense-in-depth on the same fact, never reachable as a
 * *further* exclusion once `archivedAt: null` has already applied.
 * Deliberately Recipe-only, unlike `listMealPlanEntryCandidates` above
 * (which also includes Parts and every non-archived Dish, since it feeds
 * the plan-entry picker, not recommendations) — that mixed pool cannot
 * answer either of this function's questions on its own.
 */
export async function countRecipeRecommendationEligibility(
  ownerId: string,
): Promise<{ totalRecipeCount: number; eligibleRecipeCount: number }> {
  const [totalRecipeCount, eligibleRecipeCount] = await Promise.all([
    prisma.dish.count({ where: { ownerId, kind: "RECIPE" } }),
    prisma.dish.count({
      where: {
        ownerId,
        kind: "RECIPE",
        archivedAt: null,
        currentVersionId: { not: null },
      },
    }),
  ]);
  return { totalRecipeCount, eligibleRecipeCount };
}

/**
 * Recommendation candidates (§80) — owned, non-archived RECIPE Dishes only
 * (§80's priority list and every one of its examples speak exclusively of
 * Recipes; standalone Part-preparation entries are added directly from the
 * picker, not recommended). Batches the same rating/last-cooked lookups
 * `dishes/queries.ts#queryDishLibrary` already uses for the library grid.
 */
export async function listRecommendationCandidates(
  ownerId: string,
): Promise<RecommendationCandidate[]> {
  const preference = await prisma.userPreference.findUnique({
    where: { userId: ownerId },
    select: { primaryRatingDisplay: true },
  });

  const dishes = await prisma.dish.findMany({
    where: {
      ownerId,
      kind: "RECIPE",
      archivedAt: null,
      currentVersionId: { not: null },
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
      tags: { select: { tag: { select: { isFavorite: true } } } },
      flavorProfiles: {
        select: { flavorProfileValue: { select: { displayName: true } } },
      },
    },
  });
  if (dishes.length === 0) return [];

  const ratings = await getPrincipalRatingsForDishes(
    dishes.map((d) => ({
      id: d.id,
      currentVersionId: d.currentVersionId,
      sourceKind: d.sourceKind,
      sourceAggregateRating: decimalToNumber(d.sourceAggregateRating),
      sourceRatingCount: d.sourceRatingCount,
      sourceTitle: d.sourceTitle,
      sourceDishVersionLabel: d.sourceDishVersionLabel,
    })),
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
  );
  const lastCookedMap = await getLastCookedAtForDishes(
    ownerId,
    dishes.map((d) => d.id),
    "RECIPE",
  );

  return dishes.map((dish) => ({
    dishId: dish.id,
    title: dish.currentTitle ?? "Untitled",
    stage: dish.stage,
    lastCookedAt: lastCookedMap.get(dish.id) ?? null,
    ratingValue: ratingNumericValue(
      ratings.get(dish.id) ?? ({ kind: "none" } as PrincipalRating),
    ),
    isFavorite: dish.tags.some((t) => t.tag.isFavorite),
    flavorProfiles: dish.flavorProfiles.map(
      (f) => f.flavorProfileValue.displayName,
    ),
  }));
}
