import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";
import type { DishKindValue } from "@/lib/dishes/schema";

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
  createdAt: true,
  updatedAt: true,
} as const;

const sectionContentInclude = {
  orderBy: { position: "asc" as const },
  include: {
    ingredients: {
      orderBy: { position: "asc" as const },
      include: { substitute: true },
    },
    instructions: { orderBy: { position: "asc" as const } },
  },
};

export const dishDetailInclude = {
  currentVersion: {
    include: {
      sections: sectionContentInclude,
    },
  },
} as const;

export function listDishes(
  ownerId: string,
  kind: DishKindValue,
  { includeArchived }: { includeArchived: boolean },
) {
  return prisma.dish.findMany({
    where: {
      ownerId,
      kind,
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    select: dishCardSelect,
    orderBy: { updatedAt: "desc" },
  });
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
    include: { sections: sectionContentInclude },
  });
}
