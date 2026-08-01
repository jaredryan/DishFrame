import "server-only";
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

export async function getOwnedMealPlanOrThrow(ownerId: string, id: string) {
  const mealPlan = await prisma.mealPlan.findFirst({
    where: { id, ownerId },
    include: mealPlanDetailInclude(),
  });
  if (!mealPlan) throw new NotFoundError("Meal Plan not found.");
  return mealPlan;
}
export type OwnedMealPlan = Awaited<ReturnType<typeof getOwnedMealPlanOrThrow>>;
export type OwnedMealPlanEntry = OwnedMealPlan["entries"][number];

// Ordered by start date, most-recently-started first — no separate
// active/past split in the index (§78: "Past Meal Plans remain accessible").
export function listMealPlansForOwner(ownerId: string) {
  return prisma.mealPlan.findMany({
    where: { ownerId },
    select: {
      id: true,
      title: true,
      startDate: true,
      endDate: true,
      _count: { select: { entries: true } },
    },
    orderBy: { startDate: "desc" },
  });
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
