import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ConflictError } from "@/lib/errors";
import { normalizeName } from "@/lib/account/defaults";
import { getOwnedTagOrThrow } from "@/lib/tags/queries";

/**
 * Framework-agnostic domain functions (ARCHITECTURE_PROPOSAL.md §K.4) — see
 * src/lib/tasters/service.ts for the same rationale.
 */

/**
 * Idempotent by identity (PRODUCT_SPEC.md §45.4): a name that normalizes to
 * an existing tag returns that tag rather than erroring or duplicating.
 */
export async function createTag(ownerId: string, name: string) {
  const normalizedName = normalizeName(name);
  return prisma.tag.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: { ownerId, normalizedName, displayName: name },
  });
}

/**
 * Renaming to a name that already belongs to a different tag merges the
 * source tag into that destination tag (PRODUCT_SPEC.md §45.6): every Dish
 * using the source tag ends up tagged with the destination instead, and the
 * source tag row is removed. The protected Favorite tag can never be the
 * source of a rename/merge (§45.9).
 */
export async function renameTag(ownerId: string, id: string, name: string) {
  const source = await getOwnedTagOrThrow(ownerId, id);
  if (source.isFavorite) {
    throw new ConflictError("The Favorite tag can't be renamed.");
  }

  const normalizedName = normalizeName(name);
  if (normalizedName === source.normalizedName) {
    return prisma.tag.update({ where: { id }, data: { displayName: name } });
  }

  const destination = await prisma.tag.findUnique({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
  });

  if (!destination) {
    return prisma.tag.update({
      where: { id },
      data: { displayName: name, normalizedName },
    });
  }

  return prisma.$transaction(async (tx) => {
    const sourceLinks = await tx.dishTag.findMany({ where: { tagId: id } });
    if (sourceLinks.length > 0) {
      await tx.dishTag.createMany({
        data: sourceLinks.map((link) => ({
          dishId: link.dishId,
          tagId: destination.id,
        })),
        skipDuplicates: true,
      });
      await tx.dishTag.deleteMany({ where: { tagId: id } });
    }
    await tx.tag.delete({ where: { id } });
    return destination;
  });
}

export async function deleteTag(ownerId: string, id: string) {
  const tag = await getOwnedTagOrThrow(ownerId, id);
  if (tag.isFavorite) {
    throw new ConflictError("The Favorite tag can't be deleted.");
  }

  // Cascades DishTag rows (schema onDelete: Cascade) — removes the tag from
  // every Recipe/Part without deleting those items (§45.7).
  return prisma.tag.delete({ where: { id } });
}
