import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import {
  getPrincipalRatingsForDishes,
  type PrincipalRating,
} from "@/lib/reviews/queries";
import { getLastCookedAtForDishes } from "@/lib/cooking/queries";
import { ratingNumericValue } from "@/lib/dishes/library-filters";
import { listCuisines } from "@/lib/cuisines/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";

/**
 * Meal Plan domain queries (BUILD_PLAN.md Slice 15, ARCHITECTURE_PROPOSAL.md
 * §K.4). Framework-agnostic Prisma reads, mirroring `grocery/queries.ts`'s
 * shape for this module.
 */

function mealPlanDetailInclude() {
  return {
    entries: {
      orderBy: [{ cookDate: "asc" as const }, { id: "asc" as const }],
      include: {
        plannedMeals: {
          orderBy: [{ date: "asc" as const }, { sortOrder: "asc" as const }],
        },
      },
    },
    linkedGroceryLists: {
      orderBy: { createdAt: "desc" as const },
      select: {
        id: true,
        title: true,
        mode: true,
        completedAt: true,
        plannedDate: true,
        mealPlanEntryExclusions: { select: { mealPlanEntryId: true } },
      },
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

// Shared by the view, edit, and (implicitly, via `mode="create"`) new pages
// so the Prisma-row-to-DTO mapping lives in one place.
export function toMealPlanDetailDto(
  mealPlan: OwnedMealPlan,
): MealPlanDetailDto {
  return {
    id: mealPlan.id,
    title: mealPlan.title,
    startDate: mealPlan.startDate.toISOString(),
    endDate: mealPlan.endDate.toISOString(),
    notes: mealPlan.notes,
    completedAt: mealPlan.completedAt?.toISOString() ?? null,
    entries: mealPlan.entries.map((entry) => ({
      id: entry.id,
      dishId: entry.dishId,
      dishVersionId: entry.dishVersionId,
      dishKind: entry.sourceDishKindSnapshot,
      title: entry.sourceDishTitleSnapshot,
      versionLabel: entry.sourceDishVersionLabelSnapshot,
      cookDate: entry.cookDate.toISOString(),
      targetYieldQuantity: decimalToNumber(entry.targetYieldQuantity),
      targetYieldUnit: entry.targetYieldUnit,
      note: entry.note,
      status: entry.status,
      linkedSessionId: entry.linkedSessionId,
      plannedMeals: entry.plannedMeals.map((meal) => ({
        id: meal.id,
        label: meal.label,
        date: meal.date.toISOString(),
        servings: decimalToNumber(meal.servings) ?? 0,
        eaten: meal.eaten,
        sortOrder: meal.sortOrder,
      })),
    })),
    linkedGroceryLists: mealPlan.linkedGroceryLists.map((list) => ({
      id: list.id,
      title: list.title,
      mode: list.mode,
      completedAt: list.completedAt?.toISOString() ?? null,
      plannedDate: list.plannedDate.toISOString(),
      excludedEntryIds: list.mealPlanEntryExclusions.map(
        (exclusion) => exclusion.mealPlanEntryId,
      ),
    })),
  };
}

// Shared by the new/edit Meal Plan editor pages — the candidate pool plus
// filter option lists the editor's pickers need, fully mapped to the shapes
// `MealPlanEditor` expects.
export async function loadMealPlanEditorOptions(ownerId: string) {
  const [candidates, tags, cuisines, flavorProfiles] = await Promise.all([
    listMealPlanEntryCandidates(ownerId),
    listTags(ownerId),
    listCuisines(ownerId),
    listFlavorProfileValues(ownerId),
  ]);

  return {
    candidates,
    tagOptions: tags.map((tag) => ({
      id: tag.id,
      displayName: tag.displayName,
    })),
    cuisineOptions: cuisines.map((cuisine) => ({
      id: cuisine.id,
      displayName: cuisine.displayName,
    })),
    flavorProfileOptions: flavorProfiles.map((value) => ({
      id: value.id,
      displayName: value.displayName,
    })),
  };
}

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
 * the plan-entry picker (§76.2), and (Slice 24 redesign) the base data for
 * the Add/Edit-meal modal's unified result list: Stage/tags/Favorite/
 * cuisine/rating feed its filters and chips, and `updatedAt`/`lastCookedAt`/
 * `ratingValue` its Sort options, all without a further round trip. Carries
 * the current Version's own authored yield, the same convention
 * `grocery/queries.ts#listGrocerySourceCandidates` already established for
 * target-yield scaling.
 */
export async function listMealPlanEntryCandidates(ownerId: string) {
  const [preference, dishes] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: ownerId },
      select: { primaryRatingDisplay: true },
    }),
    prisma.dish.findMany({
      where: { ownerId, archivedAt: null, currentVersionId: { not: null } },
      select: {
        id: true,
        kind: true,
        stage: true,
        currentTitle: true,
        currentVersionId: true,
        updatedAt: true,
        sourceKind: true,
        sourceAggregateRating: true,
        sourceRatingCount: true,
        sourceTitle: true,
        sourceDishVersionLabel: true,
        currentVersion: {
          select: {
            imageAssetId: true,
            yieldQuantity: true,
            yieldUnit: true,
            majorVersion: true,
            minorVersion: true,
          },
        },
        tags: {
          select: {
            tagId: true,
            tag: { select: { displayName: true, isFavorite: true } },
          },
        },
        flavorProfiles: {
          select: { flavorProfileValueId: true },
        },
        cuisines: {
          select: {
            cuisineId: true,
            cuisine: { select: { displayName: true, position: true } },
          },
        },
      },
      orderBy: { currentTitle: "asc" },
    }),
  ]);

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

  // `getLastCookedAtForDishes` is scoped to one kind at a time (its Part
  // branch also walks `CookingSessionPartUsage`, which a mixed-kind call
  // can't express) — this candidate pool spans both, so it's resolved as
  // two batched calls and merged rather than N per-Dish round trips.
  const recipeIds = dishes.filter((d) => d.kind === "RECIPE").map((d) => d.id);
  const partIds = dishes.filter((d) => d.kind === "PART").map((d) => d.id);
  const [recipeLastCooked, partLastCooked] = await Promise.all([
    getLastCookedAtForDishes(ownerId, recipeIds, "RECIPE"),
    getLastCookedAtForDishes(ownerId, partIds, "PART"),
  ]);
  const lastCookedMap = new Map([...recipeLastCooked, ...partLastCooked]);

  return dishes.map((dish) => ({
    dishId: dish.id,
    kind: dish.kind,
    stage: dish.stage,
    cuisineIds: dish.cuisines.map((c) => c.cuisineId),
    cuisineNames: dish.cuisines
      .map((c) => c.cuisine)
      .sort((a, b) => a.position - b.position)
      .map((c) => c.displayName),
    title: dish.currentTitle ?? "Untitled",
    dishVersionId: dish.currentVersionId!,
    versionLabel: dish.currentVersion
      ? versionLabel(
          dish.currentVersion.majorVersion,
          dish.currentVersion.minorVersion,
        )
      : "",
    imageAssetId: dish.currentVersion?.imageAssetId ?? null,
    yieldQuantity: decimalToNumber(dish.currentVersion?.yieldQuantity ?? null),
    yieldUnit: dish.currentVersion?.yieldUnit ?? null,
    tagIds: dish.tags.filter((t) => !t.tag.isFavorite).map((t) => t.tagId),
    tagNames: dish.tags
      .filter((t) => !t.tag.isFavorite)
      .map((t) => t.tag.displayName),
    flavorProfileValueIds: dish.flavorProfiles.map(
      (f) => f.flavorProfileValueId,
    ),
    isFavorite: dish.tags.some((t) => t.tag.isFavorite),
    ratingValue: ratingNumericValue(
      ratings.get(dish.id) ?? ({ kind: "none" } as PrincipalRating),
    ),
    lastCookedAt: lastCookedMap.get(dish.id) ?? null,
    updatedAt: dish.updatedAt,
  }));
}
export type MealPlanEntryCandidate = Awaited<
  ReturnType<typeof listMealPlanEntryCandidates>
>[number];
