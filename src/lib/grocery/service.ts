import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ConflictError } from "@/lib/errors";
import { normalizeName } from "@/lib/account/defaults";
import { getOwnedGroceryCategoryOrThrow } from "@/lib/grocery/queries";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 */

const P2002_UNIQUE_CONSTRAINT = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === P2002_UNIQUE_CONSTRAINT
  );
}

export async function createGroceryCategory(ownerId: string, name: string) {
  const highestPosition = await prisma.groceryCategory.aggregate({
    where: { ownerId },
    _max: { position: true },
  });

  try {
    return await prisma.groceryCategory.create({
      data: {
        ownerId,
        normalizedName: normalizeName(name),
        displayName: name,
        position: (highestPosition._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(`"${name}" already exists.`);
    }
    throw error;
  }
}

export async function renameGroceryCategory(
  ownerId: string,
  id: string,
  name: string,
) {
  await getOwnedGroceryCategoryOrThrow(ownerId, id);

  try {
    return await prisma.groceryCategory.update({
      where: { id },
      data: { displayName: name, normalizedName: normalizeName(name) },
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new ConflictError(`"${name}" already exists.`);
    }
    throw error;
  }
}

export async function deleteGroceryCategory(ownerId: string, id: string) {
  await getOwnedGroceryCategoryOrThrow(ownerId, id);
  // GroceryListItem.category and IngredientCategoryMemory.groceryCategory
  // both react to this at the database level (SetNull / Cascade
  // respectively per prisma/schema.prisma) — deleted-category items fall
  // back to the "Other" display bucket (§63.4), never left dangling.
  return prisma.groceryCategory.delete({ where: { id } });
}

export async function reorderGroceryCategories(
  ownerId: string,
  orderedIds: string[],
) {
  const owned = await prisma.groceryCategory.findMany({
    where: { ownerId, id: { in: orderedIds } },
    select: { id: true },
  });
  if (owned.length !== orderedIds.length) {
    throw new ConflictError("One or more categories could not be found.");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.groceryCategory.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}
