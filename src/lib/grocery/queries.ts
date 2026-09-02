import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import { getPrincipalRatingsForDishes } from "@/lib/reviews/queries";

export function listGroceryCategories(ownerId: string) {
  return prisma.groceryCategory.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
  });
}

export async function getOwnedGroceryCategoryOrThrow(
  ownerId: string,
  id: string,
) {
  const category = await prisma.groceryCategory.findFirst({
    where: { id, ownerId },
  });
  if (!category) {
    throw new NotFoundError("Grocery category not found.");
  }
  return category;
}

/**
 * Every owned, non-archived Recipe/Part with a current Version — the
 * candidate list for the grocery-list source-selection screen
 * (PRODUCT_SPEC.md §60.1). Carries the current Version's own authored yield
 * so the picker can offer `ScaleControl`'s natural target-output scaling,
 * same convention as Cooking Setup (`cooking/queries.ts`). Also carries the
 * same rich picker-row fields (`stage`/`cuisine`/tags/rating/thumbnail/
 * Version label) as `listCookablePickerItems` so the Grocery List picker can
 * render the shared `SelectableDishRow` treatment rather than a simplified
 * one.
 */
export async function listGrocerySourceCandidates(ownerId: string) {
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
        cuisine: true,
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
            yieldQuantity: true,
            yieldUnit: true,
          },
        },
        tags: {
          select: { tag: { select: { displayName: true, isFavorite: true } } },
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

  return dishes.map((dish) => ({
    dishId: dish.id,
    kind: dish.kind,
    stage: dish.stage,
    cuisine: dish.cuisine,
    title: dish.currentTitle ?? "Untitled",
    versionLabel: dish.currentVersion
      ? versionLabel(
          dish.currentVersion.majorVersion,
          dish.currentVersion.minorVersion,
        )
      : "",
    imageAssetId: dish.currentVersion?.imageAssetId ?? null,
    tagNames: dish.tags
      .filter((t) => !t.tag.isFavorite)
      .map((t) => t.tag.displayName),
    rating: ratings.get(dish.id) ?? { kind: "none" as const },
    dishVersionId: dish.currentVersionId!,
    yieldQuantity: decimalToNumber(dish.currentVersion?.yieldQuantity ?? null),
    yieldUnit: dish.currentVersion?.yieldUnit ?? null,
  }));
}
export type GrocerySourceCandidate = Awaited<
  ReturnType<typeof listGrocerySourceCandidates>
>[number];

/**
 * Every saved Version of one owned Recipe/Part, with that Version's own
 * authored yield — feeds the Grocery List "Edit meal" modal's Version
 * selector, where the target-servings scaling field must react to
 * whichever Version is currently selected (each Version may have a
 * different authored yield).
 */
export async function listDishVersionYieldOptions(
  ownerId: string,
  dishId: string,
) {
  const dish = await prisma.dish.findFirst({
    where: { id: dishId, ownerId },
    select: { id: true },
  });
  if (!dish) throw new NotFoundError("Recipe or Part not found.");

  const versions = await prisma.dishVersion.findMany({
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

  return versions.map((version) => ({
    id: version.id,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    yieldQuantity: decimalToNumber(version.yieldQuantity),
    yieldUnit: version.yieldUnit,
  }));
}
export type DishVersionYieldOption = Awaited<
  ReturnType<typeof listDishVersionYieldOptions>
>[number];

// Full detail include for a Grocery List — sources, items (with category and
// contributions), everything the detail page and every mutating service
// function need in one shape.
const groceryListDetailInclude = {
  sources: { orderBy: { id: "asc" as const } },
  items: {
    orderBy: { position: "asc" as const },
    include: {
      category: true,
      contributions: {
        orderBy: { id: "asc" as const },
        include: {
          groceryListSource: { select: { sourceDishTitleSnapshot: true } },
          mealPlanEntry: { select: { sourceDishTitleSnapshot: true } },
        },
      },
    },
  },
  mealPlanEntryExclusions: { select: { mealPlanEntryId: true } },
} as const;

// Wrapped in React's `cache()`: the grocery list detail page's
// `generateMetadata` and page component both call this with identical args
// in one request.
export const getOwnedGroceryListOrThrow = cache(
  async function getOwnedGroceryListOrThrow(ownerId: string, id: string) {
    const list = await prisma.groceryList.findFirst({
      where: { id, ownerId },
      include: groceryListDetailInclude,
    });
    if (!list) {
      throw new NotFoundError("Grocery list not found.");
    }
    return list;
  },
);
export type OwnedGroceryList = Awaited<
  ReturnType<typeof getOwnedGroceryListOrThrow>
>;

// Ordered active-first, then most-recently-completed — no separate archive
// view exists for grocery lists (PRODUCT_SPEC.md §64: completed lists remain
// historical, not hidden).
export async function listGroceryListsForOwner(ownerId: string) {
  const lists = await prisma.groceryList.findMany({
    where: { ownerId },
    select: {
      id: true,
      title: true,
      createdAt: true,
      completedAt: true,
      linkedMealPlanId: true,
      linkedMealPlan: { select: { title: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
  });
  return {
    active: lists.filter((l) => l.completedAt == null),
    completed: lists
      .filter((l) => l.completedAt != null)
      .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime()),
  };
}
