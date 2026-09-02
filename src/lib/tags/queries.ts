import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

export function listTags(ownerId: string) {
  return prisma.tag.findMany({
    where: { ownerId },
    orderBy: [{ isFavorite: "desc" }, { position: "asc" }],
  });
}

/**
 * PRODUCT_SPEC.md §45.7: deleting a tag requires confirmation showing the
 * number of affected items — the tag-management UI's only use for a usage
 * count, so it lives alongside `listTags` rather than as a per-tag query.
 * Ordered by the protected Favorite tag first, then each owner's own
 * drag-reorder position (Settings QA pass — matches
 * FlavorProfileValue/GroceryCategory ordering).
 */
export async function listTagsWithUsageCount(ownerId: string) {
  const tags = await prisma.tag.findMany({
    where: { ownerId },
    orderBy: [{ isFavorite: "desc" }, { position: "asc" }],
    include: { _count: { select: { dishes: true } } },
  });
  return tags.map((tag) => ({
    id: tag.id,
    displayName: tag.displayName,
    isFavorite: tag.isFavorite,
    dishCount: tag._count.dishes,
    position: tag.position,
  }));
}

export async function getOwnedTagOrThrow(ownerId: string, id: string) {
  const tag = await prisma.tag.findFirst({ where: { id, ownerId } });
  if (!tag) {
    throw new NotFoundError("Tag not found.");
  }
  return tag;
}
