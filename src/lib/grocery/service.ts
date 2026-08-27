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
  // The fallback category (isFallback: true) can be renamed — protection
  // only blocks deletion, per PRODUCT_SPEC.md §63.4.
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
  const category = await getOwnedGroceryCategoryOrThrow(ownerId, id);
  if (category.isFallback) {
    throw new ConflictError("The fallback Grocery Category can't be deleted.");
  }

  // Guaranteed to exist by initializeNewUser (repaired on every call,
  // regardless of the account's defaultsInitializedAt marker) — see
  // src/lib/account/init.ts.
  const fallback = await prisma.groceryCategory.findFirstOrThrow({
    where: { ownerId, isFallback: true },
  });

  await prisma.$transaction([
    // Move existing GroceryListItem rows to the fallback category rather
    // than relying on the schema's onDelete: SetNull, which would instead
    // leave them uncategorized (PRODUCT_SPEC.md §63.4 — deleted-category
    // items must land in the fallback bucket, not go dangling/null).
    prisma.groceryListItem.updateMany({
      where: { categoryId: id },
      data: { categoryId: fallback.id },
    }),
    // IngredientCategoryMemory rows for this category cascade-delete at the
    // database level (onDelete: Cascade, prisma/schema.prisma) as part of
    // this same delete, so remembered categorizations for those ingredients
    // can be relearned rather than silently pointing at the fallback.
    prisma.groceryCategory.delete({ where: { id } }),
  ]);
}

export async function reorderGroceryCategories(
  ownerId: string,
  orderedIds: string[],
) {
  const owned = await prisma.groceryCategory.findMany({
    where: { ownerId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((category) => category.id));
  const submittedIds = new Set(orderedIds);

  const isExactlyTheOwnedSet =
    orderedIds.length === submittedIds.size && // no duplicate ids submitted
    submittedIds.size === ownedIds.size && // nothing omitted, nothing extra
    orderedIds.every((id) => ownedIds.has(id)); // no foreign/nonexistent ids

  if (!isExactlyTheOwnedSet) {
    throw new ConflictError(
      "The submitted order does not match your current Grocery Categories.",
    );
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
