import "server-only";
import {
  getOwnedDishOrThrow,
  getOwnedVersionDetailOrThrow,
} from "@/lib/dishes/queries";
import { buildShareGraph } from "@/lib/sharing/graph";
import {
  buildPublicShareContent,
  type PublicShareContent,
} from "@/lib/sharing/public-dto";
import { NotFoundError } from "@/lib/errors";
import type { DishKindValue } from "@/lib/dishes/schema";

export type OwnerPrintResult = {
  content: PublicShareContent;
  isCurrent: boolean;
};

/**
 * PRODUCT_SPEC.md §87: owner print reuses the exact-Version resolver
 * (ownership + Dish-scoping, `getOwnedDishOrThrow`/`getOwnedVersionDetailOrThrow`)
 * and the Slice 16 privacy-safe DTO (`buildShareGraph`/`buildPublicShareContent`)
 * — the same whitelist a public share renders through — rather than
 * serializing a broad Prisma model and removing private fields afterward.
 * `versionId` omitted prints the Dish's current Version; supplied, it must
 * belong to this exact Dish (enforced by `getOwnedVersionDetailOrThrow`)
 * and prints that exact historical Version, never the current one.
 */
export async function resolveOwnerPrintContent(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
  versionId?: string,
): Promise<OwnerPrintResult> {
  let targetDishId: string;
  let targetVersionId: string;
  let currentVersionId: string | null;

  if (versionId) {
    const { dish, version } = await getOwnedVersionDetailOrThrow(
      ownerId,
      dishId,
      versionId,
      kind,
    );
    targetDishId = dish.id;
    targetVersionId = version.id;
    currentVersionId = dish.currentVersionId;
  } else {
    const dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
    if (!dish.currentVersionId) {
      throw new NotFoundError(
        kind === "PART" ? "Part not found." : "Recipe not found.",
      );
    }
    targetDishId = dish.id;
    targetVersionId = dish.currentVersionId;
    currentVersionId = dish.currentVersionId;
  }

  const graph = await buildShareGraph(targetDishId, targetVersionId);
  const content = await buildPublicShareContent(graph);
  return { content, isCurrent: targetVersionId === currentVersionId };
}
