"use client";

import { getEntity } from "@/lib/offline/db";
import {
  gatherSlotsFrom,
  resolveIngredientOccurrences,
  type ContentLookup,
  type GatherableContent,
  type IngredientSlot,
} from "@/lib/grocery/ingredient-gather-core";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { ReplicatedVersion } from "@/lib/dishes/version-history-snapshot";

export { resolveIngredientOccurrences };
export type { IngredientSlot };

/**
 * Offline mirror of `ingredient-gather.ts#gatherIngredientSlots` — same
 * shared `ingredient-gather-core.ts` walk, sourced from the local replica
 * instead of Postgres (docs/OFFLINE_IMPLEMENTATION_PLAN.md §4). Every
 * targeted Dish+Version (the top-level source and every nested Part
 * reached by walking PartLinks) is looked up in `DishSnapshotDoc.versions`
 * — replicated for *every* saved Version of *every* Dish, not only current
 * ones, so a PartLink pinned to an older Version of a nested Part resolves
 * correctly offline too, exactly like online.
 *
 * Returns `null` (rather than throwing) when the top-level Dish+Version
 * itself isn't replicated — the caller decides whether that means "stay
 * online-only for this one" or "nothing to generate."
 */
export async function gatherIngredientSlotsOffline(
  dishId: string,
  dishVersionId: string,
): Promise<IngredientSlot[] | null> {
  const cache = new Map<string, Promise<GatherableContent | null>>();

  async function lookupVersion(
    targetDishId: string,
    targetVersionId: string,
  ): Promise<GatherableContent | null> {
    const key = `${targetDishId}:${targetVersionId}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const promise = (async (): Promise<GatherableContent | null> => {
      const record = await getEntity<DishSnapshotDoc>("dish", targetDishId);
      const version = record?.doc.versions.find(
        (v) => v.id === targetVersionId,
      );
      if (!version) return null;
      return toGatherableContent(version);
    })();
    cache.set(key, promise);
    return promise;
  }

  const topLevel = await lookupVersion(dishId, dishVersionId);
  if (!topLevel) return null;

  const lookup: ContentLookup = lookupVersion;
  return gatherSlotsFrom(topLevel, lookup);
}

function toGatherableContent(version: ReplicatedVersion): GatherableContent {
  return {
    sections: version.sections.map((section) => ({
      ingredients: section.ingredients.map((ingredient) => ({
        lineageId: ingredient.lineageId,
        name: ingredient.name,
        quantity: ingredient.quantity,
        quantityEnd: ingredient.quantityEnd,
        isApproximate: ingredient.isApproximate,
        unit: ingredient.unit,
        displayText: ingredient.displayText,
        preparationNote: ingredient.preparationNote,
        isOptional: ingredient.isOptional,
        substituteForIngredientId: ingredient.substituteForIngredientId,
        substitute: ingredient.substitute,
      })),
    })),
    partLinks: [
      ...version.topLevelPartLinks,
      ...version.sections.flatMap((section) => section.partLinks),
    ].map((link) => ({
      targetDishId: link.targetDishId,
      targetDishVersionId: link.targetDishVersionId,
      multiplier: link.multiplier,
    })),
  };
}
