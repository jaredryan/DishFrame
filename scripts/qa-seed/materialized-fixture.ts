import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { Services } from "./parts";
import { section } from "./parts";
import { attachSeedTag } from "./owner";

export type GarnishFixture = { dishId: string; v1Id: string };

/**
 * A throwaway Part attached to "[QA] Sunday Ramen Project"'s V2.0
 * (scripts/qa-seed/ramen.ts) and later converted, by
 * `materializeAndDeleteGarnish` below, into the already-materialized
 * historical-snapshot fixture — without ever running the real destructive
 * deletePart flow. Its own Dish row is deleted once materialization is
 * done, so it never lingers as a live, attachable Part anywhere in the app.
 */
export async function createThrowawayGarnishPart(
  { createDish }: Pick<Services, "createDish">,
  ownerId: string,
  tagId: string,
): Promise<GarnishFixture> {
  const content: DishContentInput = {
    title: "[QA] Pickled Ginger Garnish",
    stage: "PROVEN",
    cuisine: null,
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Pickled ginger",
            quantity: 2,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Slice thin before serving." }],
      }),
    ],
    partLinks: [],
  };
  const dishId = await createDish(ownerId, "PART", content);
  await attachSeedTag(dishId, tagId);
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  return { dishId, v1Id: dish.currentVersionId! };
}

/**
 * Hand-authors a `MATERIALIZED` PartLink row in exactly the shape
 * `deletePart` itself writes (service.ts's `resolveMaterializedSnapshot` +
 * its five-field update, confirmed by reading both), targeting the
 * Garnish occurrence recorded on "[QA] Sunday Ramen Project"'s historical
 * V2.0 — never a currently-live occurrence, matching the real invariant
 * that only historical rows ever get materialized. Deletes the Garnish
 * Part's own Dish row afterward, mirroring deletePart's real end state.
 */
export async function materializeAndDeleteGarnish(
  garnish: GarnishFixture,
  garnishOccurrenceLineageId: string,
  ramenV2_0Id: string,
): Promise<void> {
  const occurrence = await prisma.partLink.findFirstOrThrow({
    where: {
      containerVersionId: ramenV2_0Id,
      lineageId: garnishOccurrenceLineageId,
      linkState: "LIVE",
    },
  });

  const content = {
    sections: [
      {
        lineageId: randomUUID(),
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            lineageId: randomUUID(),
            name: "Pickled ginger",
            quantity: 2,
            quantityEnd: null,
            isApproximate: false,
            unit: "tbsp",
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [
          { lineageId: randomUUID(), text: "Slice thin before serving." },
        ],
        partLinks: [],
      },
    ],
    partLinks: [],
  };

  await prisma.partLink.update({
    where: { id: occurrence.id },
    data: {
      linkState: "MATERIALIZED",
      targetDishId: null,
      targetDishVersionId: null,
      materializedTitle: "Pickled Ginger Garnish",
      materializedVersionLabel: "V1.0",
      materializedContent: content,
      // multiplier (1.5, set when this occurrence was created) is
      // deliberately left untouched — deletePart's own behavior, and
      // exactly what this fixture is meant to preserve.
    },
  });

  // Mirrors deletePart's real end state: the retired Part's own Dish row
  // is gone, so it can never show up as a live, attachable Part anywhere
  // else in the app.
  await prisma.dish.delete({ where: { id: garnish.dishId } });
}
