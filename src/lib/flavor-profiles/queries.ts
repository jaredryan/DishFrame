import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

export function listFlavorProfileValues(ownerId: string) {
  return prisma.flavorProfileValue.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
  });
}

export async function getOwnedFlavorProfileValueOrThrow(
  ownerId: string,
  id: string,
) {
  const value = await prisma.flavorProfileValue.findFirst({
    where: { id, ownerId },
  });
  if (!value) {
    throw new NotFoundError("Flavor profile not found.");
  }
  return value;
}
