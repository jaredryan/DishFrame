import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

export function listTags(ownerId: string) {
  return prisma.tag.findMany({
    where: { ownerId },
    orderBy: [{ isFavorite: "desc" }, { displayName: "asc" }],
  });
}

export async function getOwnedTagOrThrow(ownerId: string, id: string) {
  const tag = await prisma.tag.findFirst({ where: { id, ownerId } });
  if (!tag) {
    throw new NotFoundError("Tag not found.");
  }
  return tag;
}
