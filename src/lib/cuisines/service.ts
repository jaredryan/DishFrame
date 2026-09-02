import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/errors";
import { normalizeName } from "@/lib/account/defaults";
import { getOwnedCuisineOrThrow } from "@/lib/cuisines/queries";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4), same
 * shape as `flavor-profiles/service.ts` — a user-owned, normalized
 * classification with create/rename/reorder/delete and no archive state.
 * PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): a Recipe/Part may carry
 * zero, one, or several Cuisines via `DishCuisine` — there is no "primary
 * Cuisine" concept.
 */

export async function createCuisine(ownerId: string, name: string) {
  const normalizedName = normalizeName(name);
  return prisma.cuisine.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: {
      ownerId,
      normalizedName,
      displayName: name,
      position:
        ((
          await prisma.cuisine.aggregate({
            where: { ownerId },
            _max: { position: true },
          })
        )._max.position ?? -1) + 1,
    },
  });
}

/**
 * Same identity-collision handling as `tags/service.ts`'s `renameTag`: a
 * rename that collides with an existing Cuisine merges into it (every Dish
 * carrying the source Cuisine ends up carrying the destination instead)
 * rather than throwing a raw uniqueness violation.
 */
export async function renameCuisine(ownerId: string, id: string, name: string) {
  const source = await getOwnedCuisineOrThrow(ownerId, id);
  const normalizedName = normalizeName(name);
  if (normalizedName === source.normalizedName) {
    return prisma.cuisine.update({
      where: { id },
      data: { displayName: name },
    });
  }

  const destination = await prisma.cuisine.findUnique({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
  });

  if (!destination) {
    return prisma.cuisine.update({
      where: { id },
      data: { displayName: name, normalizedName },
    });
  }

  return prisma.$transaction(async (tx) => {
    const sourceLinks = await tx.dishCuisine.findMany({
      where: { cuisineId: id },
    });
    if (sourceLinks.length > 0) {
      await tx.dishCuisine.createMany({
        data: sourceLinks.map((link) => ({
          dishId: link.dishId,
          cuisineId: destination.id,
        })),
        skipDuplicates: true,
      });
      await tx.dishCuisine.deleteMany({ where: { cuisineId: id } });
    }
    await tx.cuisine.delete({ where: { id } });
    return destination;
  });
}

export async function deleteCuisine(ownerId: string, id: string) {
  await getOwnedCuisineOrThrow(ownerId, id);
  // Cascades DishCuisine rows (schema onDelete: Cascade) — removes the
  // Cuisine from every Recipe/Part without deleting those items.
  return prisma.cuisine.delete({ where: { id } });
}

/** Same pattern as `flavor-profiles/service.ts`'s
 * `reorderFlavorProfileValues` — the submitted order must represent the
 * caller's complete owned set. */
export async function reorderCuisines(ownerId: string, orderedIds: string[]) {
  const owned = await prisma.cuisine.findMany({
    where: { ownerId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((cuisine) => cuisine.id));
  const submittedIds = new Set(orderedIds);

  const isExactlyTheOwnedSet =
    orderedIds.length === submittedIds.size &&
    submittedIds.size === ownedIds.size &&
    orderedIds.every((id) => ownedIds.has(id));

  if (!isExactlyTheOwnedSet) {
    throw new ConflictError(
      "The submitted order does not match your current Cuisines.",
    );
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.cuisine.update({ where: { id }, data: { position: index } }),
    ),
  );
}
