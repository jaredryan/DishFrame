import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

export function listTasters(ownerId: string) {
  return prisma.taster.findMany({
    where: { ownerId },
    orderBy: [{ isOwner: "desc" }, { archivedAt: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * Ownership guard (ARCHITECTURE_PROPOSAL.md §K.6): every mutation walks up
 * to the owning row via a query scoped by both `id` and `ownerId` together,
 * rather than fetching by id alone and checking ownership after the fact.
 */
export async function getOwnedTasterOrThrow(ownerId: string, id: string) {
  const taster = await prisma.taster.findFirst({ where: { id, ownerId } });
  if (!taster) {
    throw new NotFoundError("Taster not found.");
  }
  return taster;
}
