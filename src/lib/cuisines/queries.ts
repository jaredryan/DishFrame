import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

export function listCuisines(ownerId: string) {
  return prisma.cuisine.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
  });
}

export async function getOwnedCuisineOrThrow(ownerId: string, id: string) {
  const cuisine = await prisma.cuisine.findFirst({
    where: { id, ownerId },
  });
  if (!cuisine) {
    throw new NotFoundError("Cuisine not found.");
  }
  return cuisine;
}

/** A Dish's currently assigned Cuisine ids — restoration pass: feeds the
 * create/edit form's initial selection (`dishToFormValues`), same shape as
 * `dish-metadata.ts`'s `getDishMetadataSelections` but scoped to just
 * Cuisine, since the edit page doesn't otherwise need tag/Flavor-profile
 * selections. */
export async function listSelectedCuisineIds(
  dishId: string,
): Promise<string[]> {
  const rows = await prisma.dishCuisine.findMany({
    where: { dishId },
    select: { cuisineId: true },
  });
  return rows.map((row) => row.cuisineId);
}
