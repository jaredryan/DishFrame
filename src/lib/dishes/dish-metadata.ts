import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ValidationError } from "@/lib/errors";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §45.2/§79.2: tags and Flavor profiles belong to the stable
 * Recipe/Part, not an individual Version — these are direct join-table
 * writes on `Dish`, entirely outside `createDish`/`editDish`'s Version-
 * creation machinery (ARCHITECTURE_PROPOSAL.md §K.4), the same reasoning
 * that already gave Stage its own standalone `updateDishStage` (Slice 9).
 */

export async function setDishTags(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
  tagIds: string[],
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);

  const owned = await prisma.tag.findMany({
    where: { ownerId, id: { in: tagIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((tag) => tag.id));
  if (tagIds.some((id) => !ownedIds.has(id))) {
    throw new ValidationError("One or more tags are invalid.");
  }

  await prisma.$transaction([
    prisma.dishTag.deleteMany({
      where: {
        dishId: dish.id,
        ...(tagIds.length ? { tagId: { notIn: tagIds } } : {}),
      },
    }),
    ...tagIds.map((tagId) =>
      prisma.dishTag.upsert({
        where: { dishId_tagId: { dishId: dish.id, tagId } },
        update: {},
        create: { dishId: dish.id, tagId },
      }),
    ),
  ]);
}

export async function setDishFlavorProfiles(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
  flavorProfileValueIds: string[],
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);

  const owned = await prisma.flavorProfileValue.findMany({
    where: { ownerId, id: { in: flavorProfileValueIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((value) => value.id));
  if (flavorProfileValueIds.some((id) => !ownedIds.has(id))) {
    throw new ValidationError("One or more Flavor profiles are invalid.");
  }

  await prisma.$transaction([
    prisma.dishFlavorProfile.deleteMany({
      where: {
        dishId: dish.id,
        ...(flavorProfileValueIds.length
          ? { flavorProfileValueId: { notIn: flavorProfileValueIds } }
          : {}),
      },
    }),
    ...flavorProfileValueIds.map((flavorProfileValueId) =>
      prisma.dishFlavorProfile.upsert({
        where: {
          dishId_flavorProfileValueId: {
            dishId: dish.id,
            flavorProfileValueId,
          },
        },
        update: {},
        create: { dishId: dish.id, flavorProfileValueId },
      }),
    ),
  ]);
}

/**
 * PRODUCT_SPEC.md §45.9: the familiar one-tap Favorite action is "a design
 * optimization rather than a separate Favorite data model" — this just
 * toggles the account's single protected Favorite tag on the ordinary
 * `DishTag` join, the same relationship the general tag selector uses.
 */
export async function toggleFavorite(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
): Promise<{ isFavorite: boolean }> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  const favoriteTag = await prisma.tag.findFirst({
    where: { ownerId, isFavorite: true },
    select: { id: true },
  });
  if (!favoriteTag) {
    // Seeded unconditionally for every account (account/init.ts) — this
    // should be unreachable outside a corrupted account.
    throw new ValidationError("The Favorite tag is missing for this account.");
  }

  const existing = await prisma.dishTag.findUnique({
    where: { dishId_tagId: { dishId: dish.id, tagId: favoriteTag.id } },
  });
  if (existing) {
    await prisma.dishTag.delete({
      where: { dishId_tagId: { dishId: dish.id, tagId: favoriteTag.id } },
    });
    return { isFavorite: false };
  }
  await prisma.dishTag.create({
    data: { dishId: dish.id, tagId: favoriteTag.id },
  });
  return { isFavorite: true };
}

export async function getDishMetadataSelections(dishId: string): Promise<{
  tagIds: string[];
  flavorProfileValueIds: string[];
}> {
  const [tags, flavorProfiles] = await Promise.all([
    prisma.dishTag.findMany({ where: { dishId }, select: { tagId: true } }),
    prisma.dishFlavorProfile.findMany({
      where: { dishId },
      select: { flavorProfileValueId: true },
    }),
  ]);
  return {
    tagIds: tags.map((row) => row.tagId),
    flavorProfileValueIds: flavorProfiles.map(
      (row) => row.flavorProfileValueId,
    ),
  };
}
