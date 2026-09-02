import "server-only";
import type { Prisma } from "@/generated/prisma/client";
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
 * PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): Cuisine is now the same
 * shape as tags/Flavor profiles above — a direct join-table write on the
 * stable Dish, with zero/one/several Cuisines allowed rather than one
 * primary value. Restoration pass: unlike tags/Flavor profiles, Cuisine is
 * also assignable directly from the Recipe/Part create/edit form — the two
 * helpers below (`assertOwnedCuisineIds`/`replaceDishCuisinesInTx`) are
 * `tx`-capable so `dishes/service.ts`'s `createDishWithVersion`/`editDish`
 * can persist the submitted `cuisineIds` in the very same transaction as
 * the Dish/Version write, rather than requiring a second save step. Cuisine
 * stays out of `DishVersion`/Version-creation itself either way — a
 * Cuisine-only change never allocates a new Version.
 */

/** Throws if any id isn't a Cuisine this owner actually owns. A no-op (and
 * no query) for an empty list, so a Part that intentionally has no Cuisine
 * costs nothing extra. */
export async function assertOwnedCuisineIds(
  client: Prisma.TransactionClient | typeof prisma,
  ownerId: string,
  cuisineIds: string[],
): Promise<void> {
  if (cuisineIds.length === 0) return;
  const owned = await client.cuisine.findMany({
    where: { ownerId, id: { in: cuisineIds } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((cuisine) => cuisine.id));
  if (cuisineIds.some((id) => !ownedIds.has(id))) {
    throw new ValidationError("One or more Cuisines are invalid.");
  }
}

/** Replaces a Dish's `DishCuisine` rows with exactly `cuisineIds` — the
 * caller (`setDishCuisines` below, or `dishes/service.ts` directly) is
 * responsible for having already validated ownership via
 * `assertOwnedCuisineIds` and for `dishId` being a real, owned Dish.
 * Sequential awaits (not a `$transaction([...])` array) so this also works
 * unchanged when `client` is already an outer `tx`, where a nested
 * transaction isn't valid. */
export async function replaceDishCuisinesInTx(
  client: Prisma.TransactionClient | typeof prisma,
  dishId: string,
  cuisineIds: string[],
): Promise<void> {
  await client.dishCuisine.deleteMany({
    where: {
      dishId,
      ...(cuisineIds.length ? { cuisineId: { notIn: cuisineIds } } : {}),
    },
  });
  for (const cuisineId of cuisineIds) {
    await client.dishCuisine.upsert({
      where: { dishId_cuisineId: { dishId, cuisineId } },
      update: {},
      create: { dishId, cuisineId },
    });
  }
}

/** Standalone entry point for the post-save `DishTagFlavorEditor` popover,
 * which still isn't operating inside the create/edit form's own
 * transaction — wraps ownership resolution, id validation, and the replace
 * in one atomic transaction. */
export async function setDishCuisines(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
  cuisineIds: string[],
): Promise<void> {
  const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  await prisma.$transaction(async (tx) => {
    await assertOwnedCuisineIds(tx, ownerId, cuisineIds);
    await replaceDishCuisinesInTx(tx, dish.id, cuisineIds);
  });
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
  cuisineIds: string[];
}> {
  const [tags, flavorProfiles, cuisines] = await Promise.all([
    prisma.dishTag.findMany({ where: { dishId }, select: { tagId: true } }),
    prisma.dishFlavorProfile.findMany({
      where: { dishId },
      select: { flavorProfileValueId: true },
    }),
    prisma.dishCuisine.findMany({
      where: { dishId },
      select: { cuisineId: true },
    }),
  ]);
  return {
    tagIds: tags.map((row) => row.tagId),
    flavorProfileValueIds: flavorProfiles.map(
      (row) => row.flavorProfileValueId,
    ),
    cuisineIds: cuisines.map((row) => row.cuisineId),
  };
}
