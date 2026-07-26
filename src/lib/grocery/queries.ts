import "server-only";
import { prisma } from "@/lib/db/prisma";
import { NotFoundError } from "@/lib/errors";

export function listGroceryCategories(ownerId: string) {
  return prisma.groceryCategory.findMany({
    where: { ownerId },
    orderBy: { position: "asc" },
  });
}

export async function getOwnedGroceryCategoryOrThrow(
  ownerId: string,
  id: string,
) {
  const category = await prisma.groceryCategory.findFirst({
    where: { id, ownerId },
  });
  if (!category) {
    throw new NotFoundError("Grocery category not found.");
  }
  return category;
}
