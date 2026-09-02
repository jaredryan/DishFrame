import { prisma } from "@/lib/db/prisma";
import type {
  createDish as CreateDish,
  propagatePartUpdate as PropagatePartUpdate,
} from "@/lib/dishes/service";
import type { listCurrentPartUsages as ListCurrentPartUsages } from "@/lib/dishes/queries";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { PartFixtureIds } from "./parts";
import { section } from "./parts";
import { attachSeedTag } from "./owner";

export type DeletionServices = {
  createDish: typeof CreateDish;
  propagatePartUpdate: typeof PropagatePartUpdate;
  listCurrentPartUsages: typeof ListCurrentPartUsages;
};

export type ToastPlateFixture = {
  dishId: string;
  historicalVersionId: string;
  currentVersionId: string;
};

/**
 * "[QA] Confit Toast Plate" — a dedicated deletion-resolution parent. Its
 * V1 pins `deleteme`@V1.0; once `deleteme` has moved on to V1.1, this
 * function uses the real `propagatePartUpdate` (not a hand-authored
 * Version) to retarget it, which leaves V1 as a genuine historical
 * Version referencing the exact older `deleteme` Version — the fixture
 * the task asks for, produced entirely through real domain invariants.
 */
export async function buildToastPlateFixture(
  { createDish, propagatePartUpdate, listCurrentPartUsages }: DeletionServices,
  ownerId: string,
  tagId: string,
  parts: PartFixtureIds,
): Promise<ToastPlateFixture> {
  const content: DishContentInput = {
    title: "[QA] Confit Toast Plate",
    stage: "PROVEN",
    cuisineIds: [],
    description: "Toast points topped with garlic confit.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 10,
    cookTimeMinutes: 5,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        position: 1,
        name: "Toast",
        ingredients: [
          {
            name: "Sourdough bread",
            quantity: 4,
            unit: "slices",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Toast until golden." }],
      }),
    ],
    partLinks: [
      {
        targetDishId: parts.deleteme.dishId,
        targetDishVersionId: parts.deleteme.v1Id,
        position: 0,
        multiplier: 1,
      },
    ],
  };
  const dishId = await createDish(ownerId, "RECIPE", content);
  await attachSeedTag(dishId, tagId);

  const historicalVersionId = (
    await prisma.dish.findUniqueOrThrow({
      where: { id: dishId },
      select: { currentVersionId: true },
    })
  ).currentVersionId!;

  const usages = await listCurrentPartUsages(ownerId, parts.deleteme.dishId);
  const occurrence = usages.find((usage) => usage.containerDishId === dishId);
  if (!occurrence) {
    throw new Error(
      "[qa-seed] Expected a current deleteme usage on toastplate before propagating.",
    );
  }

  const [outcome] = await propagatePartUpdate(
    ownerId,
    parts.deleteme.dishId,
    parts.deleteme.currentId,
    [{ containerDishId: dishId, lineageId: occurrence.lineageId }],
    "MINOR",
  );
  if (outcome.status !== "updated") {
    const reason = "reason" in outcome ? outcome.reason : "";
    throw new Error(
      `[qa-seed] Expected toastplate propagation to succeed, got: ${outcome.status} (${reason})`,
    );
  }

  return {
    dishId,
    historicalVersionId,
    currentVersionId: outcome.newVersionId,
  };
}
