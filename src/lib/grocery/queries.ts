import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";

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
 * same convention as Cooking Setup (`cooking/queries.ts`).
 */
export async function listGrocerySourceCandidates(ownerId: string) {
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
export type GrocerySourceCandidate = Awaited<
  ReturnType<typeof listGrocerySourceCandidates>
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
      contributions: { orderBy: { id: "asc" as const } },
    },
  },
} as const;

export async function getOwnedGroceryListOrThrow(ownerId: string, id: string) {
  const list = await prisma.groceryList.findFirst({
    where: { id, ownerId },
    include: groceryListDetailInclude,
  });
  if (!list) {
    throw new NotFoundError("Grocery list not found.");
  }
  return list;
}
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
