import {
  scaleIngredientQuantity,
  formatCalculatedQuantity,
} from "@/lib/units/scaling";

/**
 * The pure, deterministic core of ingredient gathering/reconciliation
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §4) — deliberately free of Prisma
 * and any I/O, so the SAME code computes the SAME result online
 * (`ingredient-gather.ts`, fetching content from Postgres) and offline
 * (`offline-ingredient-gather.ts`, fetching content from the local
 * replica) instead of two implementations that could silently drift.
 * Only the *content lookup* (a target Part's sections/PartLinks for one
 * specific Version) is injected; the walk, multiplier composition, depth/
 * cycle guards, and final scaling all live here, once.
 */

const MAX_PART_FLATTEN_DEPTH = 12;

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

/** Already-plain-number ingredient shape (Decimal->number conversion
 * happens once, at each content source's own boundary — see
 * `ingredient-gather.ts#fetchPartTargetContent` for the online source and
 * `offline-ingredient-gather.ts` for the replica source, both of which
 * produce this same shape). */
export type GatherableIngredient = {
  lineageId: string;
  name: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
  isOptional: boolean;
  substituteForIngredientId: string | null;
  substitute: {
    lineageId: string;
    name: string;
    quantity: number | null;
    quantityEnd: number | null;
    isApproximate: boolean;
    unit: string | null;
    displayText: string | null;
    preparationNote: string | null;
  } | null;
};

export type GatherableSection = { ingredients: GatherableIngredient[] };

export type GatherablePartLink = {
  targetDishId: string | null;
  targetDishVersionId: string | null;
  multiplier: number;
};

export type GatherableContent = {
  sections: GatherableSection[];
  partLinks: GatherablePartLink[];
};

/** Resolves one specific target Dish+Version's own gatherable content, or
 * `null` if it's unavailable/unauthorized/not found from this lookup's
 * data source. Implementations should memoize per (dishId, versionId) for
 * the lifetime of one gathering call — see each source's own cache. */
export type ContentLookup = (
  targetDishId: string,
  targetVersionId: string,
) => Promise<GatherableContent | null>;

function toVariant(
  row: {
    lineageId: string;
    name: string;
    quantity: number | null;
    quantityEnd: number | null;
    isApproximate: boolean;
    unit: string | null;
    displayText: string | null;
    preparationNote: string | null;
  },
  multiplier: number,
): GatheredIngredientVariant {
  return {
    lineageId: row.lineageId,
    name: row.name,
    quantity: row.quantity == null ? null : row.quantity * multiplier,
    quantityEnd: row.quantityEnd == null ? null : row.quantityEnd * multiplier,
    isApproximate: row.isApproximate,
    unit: row.unit,
    displayText: row.displayText,
    preparationNote: row.preparationNote,
  };
}

function sectionSlots(
  section: GatherableSection,
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
  link: GatherablePartLink,
  accumulatedMultiplier: number,
  visited: Set<string>,
  depth: number,
  lookup: ContentLookup,
): Promise<IngredientSlot[]> {
  if (!link.targetDishId || !link.targetDishVersionId) return [];
  if (depth >= MAX_PART_FLATTEN_DEPTH || visited.has(link.targetDishId))
    return [];

  const content = await lookup(link.targetDishId, link.targetDishVersionId);
  if (!content) return [];

  const multiplier = accumulatedMultiplier * link.multiplier;
  const nextVisited = new Set(visited);
  nextVisited.add(link.targetDishId);

  const slots: IngredientSlot[] = [];
  for (const section of content.sections) {
    slots.push(...sectionSlots(section, multiplier));
  }
  for (const nestedLink of content.partLinks) {
    slots.push(
      ...(await walkPartLink(
        nestedLink,
        multiplier,
        nextVisited,
        depth + 1,
        lookup,
      )),
    );
  }
  return slots;
}

/** Every ingredient slot (primary + optional saved substitute) in
 * `content`, local Sections and every linked Part at any depth —
 * quantities already scaled through the PartLink-multiplier chain; the
 * caller applies the source's own overall scale on top
 * (`resolveIngredientOccurrences`). */
export async function gatherSlotsFrom(
  content: GatherableContent,
  lookup: ContentLookup,
): Promise<IngredientSlot[]> {
  const slots: IngredientSlot[] = [];
  for (const section of content.sections) {
    slots.push(...sectionSlots(section, 1));
  }
  for (const link of content.partLinks) {
    slots.push(...(await walkPartLink(link, 1, new Set(), 0, lookup)));
  }
  return slots;
}

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
  substitute: ResolvedSubstituteSnapshot | null;
};

/**
 * Resolves gathered slots into the final occurrences a generated Grocery
 * List's contributions are built from — always the primary ingredient,
 * scaled by the source's scale factor. Each occurrence also carries its
 * own similarly-scaled substitute snapshot, if any.
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

/** §52.7-style calculated-quantity display — every grocery quantity is
 * inherently a computed value (possibly summed across sources), never the
 * single-source "authored" line a Recipe/Part detail view renders. */
export function formatGroceryQuantityText(
  quantity: number | null,
  quantityEnd: number | null,
  isApproximate: boolean,
): string | null {
  if (quantity == null) return null;
  const approxPrefix = isApproximate ? "about " : "";
  const range =
    quantityEnd != null ? `–${formatCalculatedQuantity(quantityEnd)}` : "";
  return `${approxPrefix}${formatCalculatedQuantity(quantity)}${range}`;
}

export type GroceryListSourceRefreshDiffEntry = {
  name: string;
  quantityText: string | null;
};

export type GroceryListSourceRefreshChangeEntry = {
  name: string;
  fromQuantityText: string | null;
  toQuantityText: string | null;
};

export type GroceryListSourceRefreshPreview = {
  hasNewerMinor: boolean;
  targetVersionId: string;
  targetVersionLabel: string;
  added: GroceryListSourceRefreshDiffEntry[];
  removed: GroceryListSourceRefreshDiffEntry[];
  changed: GroceryListSourceRefreshChangeEntry[];
};

/**
 * Diffs a source's existing contributions against a freshly-gathered set —
 * shared by the online preview (`list-service.ts#previewGroceryListSourceRefresh`)
 * and its offline counterpart (`offline-ingredient-gather.ts`) so the two
 * never compute a different answer for the same inputs.
 */
export function diffOccurrences(
  existing: {
    ingredientLineageId: string | null;
    originalName: string;
    quantityText: string | null;
  }[],
  fresh: ResolvedIngredientOccurrence[],
): {
  added: GroceryListSourceRefreshDiffEntry[];
  removed: GroceryListSourceRefreshDiffEntry[];
  changed: GroceryListSourceRefreshChangeEntry[];
} {
  const existingByLineage = new Map(
    existing
      .filter((e) => e.ingredientLineageId)
      .map((e) => [e.ingredientLineageId!, e]),
  );
  const freshByLineage = new Map(
    fresh
      .filter((f) => f.ingredientLineageId)
      .map((f) => [f.ingredientLineageId, f]),
  );

  const added: GroceryListSourceRefreshDiffEntry[] = [];
  const removed: GroceryListSourceRefreshDiffEntry[] = [];
  const changed: GroceryListSourceRefreshChangeEntry[] = [];

  for (const [lineageId, occurrence] of freshByLineage) {
    const toText =
      occurrence.displayText ??
      formatGroceryQuantityText(
        occurrence.quantity,
        occurrence.quantityEnd,
        occurrence.isApproximate,
      );
    const prior = existingByLineage.get(lineageId);
    if (!prior) {
      added.push({ name: occurrence.originalName, quantityText: toText });
    } else if (
      prior.quantityText !== toText ||
      prior.originalName !== occurrence.originalName
    ) {
      changed.push({
        name: occurrence.originalName,
        fromQuantityText: prior.quantityText,
        toQuantityText: toText,
      });
    }
  }
  for (const [lineageId, prior] of existingByLineage) {
    if (!freshByLineage.has(lineageId)) {
      removed.push({
        name: prior.originalName,
        quantityText: prior.quantityText,
      });
    }
  }

  return { added, removed, changed };
}
