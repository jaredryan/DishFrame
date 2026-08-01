import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { decimalToNumber } from "@/lib/dishes/format";
import { scaleIngredientQuantity } from "@/lib/units/scaling";
import {
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import type {
  VersionSectionRow,
  VersionPartLinkRow,
} from "@/lib/dishes/mappers";

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
 */

export type GatheredIngredientVariant = {
  lineageId: string;
  name: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
};

export type IngredientSlot = {
  primary: GatheredIngredientVariant;
  isOptional: boolean;
  substitute: GatheredIngredientVariant | null;
};

const MAX_PART_FLATTEN_DEPTH = 12;

// A structural subset of an Ingredient row — deliberately narrower than
// `VersionSectionRow["ingredients"][number]` so it also accepts the nested
// `.substitute` row, whose own Prisma payload type doesn't recursively
// include a further `substitute` field (a substitute never has its own).
type IngredientLikeRow = {
  lineageId: string;
  name: string;
  quantity: Prisma.Decimal | null;
  quantityEnd: Prisma.Decimal | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
};

/**
 * Applies the intermediate PartLink-multiplier composition. Deliberately raw
 * (unnormalized) multiplication, not `scaleQuantity` — mirrors
 * `cooking/queries.ts#scaleRaw`'s own precedent of leaving intermediate
 * composition unnormalized and only normalizing (`scaleIngredientQuantity`,
 * 3-decimal storage precision, §10.6a) at the final stage, once the source's
 * own chosen scale factor is known (`resolveIngredientOccurrences`).
 */
function toVariant(
  row: IngredientLikeRow,
  multiplier: number,
): GatheredIngredientVariant {
  const quantity = decimalToNumber(row.quantity);
  const quantityEnd = decimalToNumber(row.quantityEnd);
  return {
    lineageId: row.lineageId,
    name: row.name,
    quantity: quantity == null ? null : quantity * multiplier,
    quantityEnd: quantityEnd == null ? null : quantityEnd * multiplier,
    isApproximate: row.isApproximate,
    unit: row.unit,
    displayText: row.displayText,
    preparationNote: row.preparationNote,
  };
}

function sectionSlots(
  section: VersionSectionRow,
  multiplier: number,
): IngredientSlot[] {
  return section.ingredients
    .filter((ingredient) => ingredient.substituteForIngredientId === null)
    .map((ingredient) => ({
      primary: toVariant(ingredient, multiplier),
      isOptional: ingredient.isOptional,
      substitute: ingredient.substitute
        ? toVariant(ingredient.substitute, multiplier)
        : null,
    }));
}

async function walkPartLink(
  ownerId: string,
  link: VersionPartLinkRow,
  accumulatedMultiplier: number,
  visited: Set<string>,
  depth: number,
): Promise<IngredientSlot[]> {
  if (!link.targetDishId || !link.targetDishVersionId) return [];
  if (depth >= MAX_PART_FLATTEN_DEPTH || visited.has(link.targetDishId)) {
    return [];
  }

  const targetDish = await prisma.dish.findFirst({
    where: { id: link.targetDishId, ownerId, kind: "PART" },
    select: { id: true },
  });
  if (!targetDish) return [];

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: link.targetDishVersionId, dishId: link.targetDishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });
  if (!targetVersion) return [];

  const multiplier =
    accumulatedMultiplier * (decimalToNumber(link.multiplier) ?? 1);
  const nextVisited = new Set(visited);
  nextVisited.add(link.targetDishId);

  const slots: IngredientSlot[] = [];
  for (const section of targetVersion.sections) {
    slots.push(...sectionSlots(section, multiplier));
  }
  for (const nestedLink of targetVersion.partLinks) {
    slots.push(
      ...(await walkPartLink(
        ownerId,
        nestedLink,
        multiplier,
        nextVisited,
        depth + 1,
      )),
    );
  }
  return slots;
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
): Promise<IngredientSlot[]> {
  const version = await prisma.dishVersion.findFirstOrThrow({
    where: { id: dishVersionId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
  });

  const slots: IngredientSlot[] = [];
  for (const section of version.sections) {
    slots.push(...sectionSlots(section, 1));
  }
  for (const link of version.partLinks) {
    slots.push(...(await walkPartLink(ownerId, link, 1, new Set(), 0)));
  }
  return slots;
}

/** A generation-time-scaled snapshot of a slot's saved substitute — the
 * durable data `selectGroceryItemVariant` needs to select later without
 * re-walking the source Version (Slice 12 correction). */
export type ResolvedSubstituteSnapshot = {
  ingredientLineageId: string;
  originalName: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
};

export type ResolvedIngredientOccurrence = {
  ingredientLineageId: string;
  originalName: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
  isOptional: boolean;
  /** Null when this ingredient has no saved substitute. */
  substitute: ResolvedSubstituteSnapshot | null;
};

/**
 * Resolves gathered slots into the final occurrences a generated Grocery
 * List's contributions are built from — always the primary ingredient
 * (§62.2), scaled by the source's scale factor. Each occurrence also carries
 * its own similarly-scaled substitute snapshot, if any (Slice 12
 * correction), for the caller to persist alongside the primary contribution.
 */
export function resolveIngredientOccurrences(
  slots: IngredientSlot[],
  scaleFactor: number,
): ResolvedIngredientOccurrence[] {
  return slots.map((slot) => {
    const variant = slot.primary;
    const scaled = scaleIngredientQuantity(
      {
        quantity: variant.quantity,
        quantityEnd: variant.quantityEnd,
        isApproximate: variant.isApproximate,
        displayText: variant.displayText,
      },
      scaleFactor,
    );

    let substitute: ResolvedSubstituteSnapshot | null = null;
    if (slot.substitute) {
      const scaledSubstitute = scaleIngredientQuantity(
        {
          quantity: slot.substitute.quantity,
          quantityEnd: slot.substitute.quantityEnd,
          isApproximate: slot.substitute.isApproximate,
          displayText: slot.substitute.displayText,
        },
        scaleFactor,
      );
      substitute = {
        ingredientLineageId: slot.substitute.lineageId,
        originalName: slot.substitute.name,
        quantity: scaledSubstitute.quantity,
        quantityEnd: scaledSubstitute.quantityEnd,
        isApproximate: slot.substitute.isApproximate,
        unit: slot.substitute.unit,
        displayText: slot.substitute.displayText,
      };
    }

    return {
      ingredientLineageId: variant.lineageId,
      originalName: variant.name,
      quantity: scaled.quantity,
      quantityEnd: scaled.quantityEnd,
      isApproximate: variant.isApproximate,
      unit: variant.unit,
      displayText: variant.displayText,
      preparationNote: variant.preparationNote,
      isOptional: slot.isOptional,
      substitute,
    };
  });
}
