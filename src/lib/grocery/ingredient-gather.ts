import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/dishes/format";
import {
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import type {
  VersionSectionRow,
  VersionPartLinkRow,
} from "@/lib/dishes/mappers";
import {
  gatherSlotsFrom,
  resolveIngredientOccurrences,
  type GatherableContent,
  type ContentLookup,
  type IngredientSlot,
  type GatheredIngredientVariant,
  type ResolvedSubstituteSnapshot,
  type ResolvedIngredientOccurrence,
} from "@/lib/grocery/ingredient-gather-core";

/**
 * Flattens a Recipe/Part Version's full ingredient content — every local
 * Section plus every linked Part at any nesting depth — into one ordered
 * list of ingredient "slots" (PRODUCT_SPEC.md §60.1/§60.2), for grocery-list
 * generation. Deliberately its own walk rather than reusing
 * `cooking/queries.ts`'s `buildCookableUnits`: that function strips
 * `isOptional`/`substitute` entirely (not needed for a cooking checklist,
 * where a substitute row is a separate structural row the editor already
 * resolved) and, by design, does *not* compound a nested Part's multiplier
 * with its ancestors' — each Part is its own independently re-plannable
 * Cooking Setup unit (see that file's own comment). Grocery generation
 * offers no such per-nested-Part selection (Build Plan Slice 12: the source
 * picker selects whole Recipes/Parts only) — it must produce the complete
 * flattened quantity actually required to cook the *whole* selected item,
 * which means a nested Part's own multiplier genuinely composes
 * multiplicatively with every ancestor PartLink's multiplier on the way
 * down (1.5x a Part that itself uses 3x of a nested Part needs 4.5x of
 * that nested Part's ingredients overall).
 *
 * The actual walk/multiplier-composition/depth-and-cycle-guard logic lives
 * in `ingredient-gather-core.ts`, shared verbatim with the offline path
 * (`offline-ingredient-gather.ts`) — this file only supplies the online
 * `ContentLookup` (Postgres via Prisma) and re-exports the same public API
 * as before this split, so no caller needed to change
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §4: "avoid a divergent client-side
 * ingredient-gathering implementation").
 */

export type {
  IngredientSlot,
  GatheredIngredientVariant,
  ResolvedSubstituteSnapshot,
  ResolvedIngredientOccurrence,
};
export { resolveIngredientOccurrences };

/**
 * Bounded, per-operation memoization (accepted limitation review, TODO.md
 * §1) — never persisted or shared across requests. `content` caches the raw
 * (unscaled) DB fetch for a given (owner, target Dish, target Version) so a
 * nested Part shared by several sources/entries in the same
 * `generateGroceryList`/`collectMealPlanOccurrences` call is only fetched
 * once; multiplier composition still runs fresh per occurrence, so
 * quantities are unaffected. `topLevel` caches the fully-resolved slots for
 * a given (owner, dishVersionId) at its own multiplier of 1, so an identical
 * top-level source/entry (e.g. the same Recipe planned twice in one Meal
 * Plan) is walked only once.
 */
export type IngredientGatherCache = {
  content: Map<string, Promise<GatherableContent | null>>;
  topLevel: Map<string, Promise<IngredientSlot[]>>;
};

export function createIngredientGatherCache(): IngredientGatherCache {
  return { content: new Map(), topLevel: new Map() };
}

function toGatherableContent(version: {
  sections: VersionSectionRow[];
  partLinks: VersionPartLinkRow[];
}): GatherableContent {
  return {
    sections: version.sections.map((section) => ({
      ingredients: section.ingredients.map((ingredient) => ({
        lineageId: ingredient.lineageId,
        name: ingredient.name,
        quantity: decimalToNumber(ingredient.quantity),
        quantityEnd: decimalToNumber(ingredient.quantityEnd),
        isApproximate: ingredient.isApproximate,
        unit: ingredient.unit,
        displayText: ingredient.displayText,
        preparationNote: ingredient.preparationNote,
        isOptional: ingredient.isOptional,
        substituteForIngredientId: ingredient.substituteForIngredientId,
        substitute: ingredient.substitute
          ? {
              lineageId: ingredient.substitute.lineageId,
              name: ingredient.substitute.name,
              quantity: decimalToNumber(ingredient.substitute.quantity),
              quantityEnd: decimalToNumber(ingredient.substitute.quantityEnd),
              isApproximate: ingredient.substitute.isApproximate,
              unit: ingredient.substitute.unit,
              displayText: ingredient.substitute.displayText,
              preparationNote: ingredient.substitute.preparationNote,
            }
          : null,
      })),
    })),
    partLinks: version.partLinks.map((link) => ({
      targetDishId: link.targetDishId,
      targetDishVersionId: link.targetDishVersionId,
      multiplier: decimalToNumber(link.multiplier) ?? 1,
    })),
  };
}

function fetchPartTargetContent(
  ownerId: string,
  targetDishId: string,
  targetVersionId: string,
  cache: IngredientGatherCache,
): Promise<GatherableContent | null> {
  const key = `${ownerId}:${targetDishId}:${targetVersionId}`;
  const cached = cache.content.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<GatherableContent | null> => {
    const targetDish = await prisma.dish.findFirst({
      where: { id: targetDishId, ownerId, kind: "PART" },
      select: { id: true },
    });
    if (!targetDish) return null;

    const targetVersion = await prisma.dishVersion.findFirst({
      where: { id: targetVersionId, dishId: targetDishId },
      include: {
        sections: sectionContentInclude,
        partLinks: partLinkContentInclude,
      },
    });
    if (!targetVersion) return null;

    return toGatherableContent(targetVersion);
  })();
  cache.content.set(key, promise);
  return promise;
}

/**
 * Every ingredient slot (primary + optional saved substitute) authored
 * anywhere in `dishVersionId`'s content, local Sections and every linked
 * Part at any depth — owner-verified at every Part boundary, matching
 * `cooking/queries.ts#buildPartUnitTree`'s guard. Quantities are already
 * scaled through the PartLink-multiplier chain; the caller applies the
 * user's chosen overall source scale on top (`resolveIngredientOccurrences`).
 * The caller must already have verified `ownerId` owns `dishVersionId`'s own
 * Dish (e.g. via `getOwnedDishOrThrow`) — only Part boundaries reached by
 * walking nested `PartLink`s are re-checked here.
 */
export async function gatherIngredientSlots(
  ownerId: string,
  dishVersionId: string,
  cache: IngredientGatherCache = createIngredientGatherCache(),
): Promise<IngredientSlot[]> {
  const key = `${ownerId}:${dishVersionId}`;
  const cached = cache.topLevel.get(key);
  if (cached) return cached;

  const promise = (async (): Promise<IngredientSlot[]> => {
    const version = await prisma.dishVersion.findFirstOrThrow({
      where: { id: dishVersionId },
      include: {
        sections: sectionContentInclude,
        partLinks: partLinkContentInclude,
      },
    });

    const lookup: ContentLookup = (targetDishId, targetVersionId) =>
      fetchPartTargetContent(ownerId, targetDishId, targetVersionId, cache);

    return gatherSlotsFrom(toGatherableContent(version), lookup);
  })();
  cache.topLevel.set(key, promise);
  return promise;
}
