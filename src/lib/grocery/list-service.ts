import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { GroceryContributionVariant } from "@/generated/prisma/enums";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { computeTargetYieldScaleFactor } from "@/lib/units/scaling";
import { normalizeName } from "@/lib/account/defaults";
import { versionLabel } from "@/lib/dishes/version-note";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import {
  gatherIngredientSlots,
  resolveIngredientOccurrences,
  createIngredientGatherCache,
  type ResolvedIngredientOccurrence,
  type ResolvedSubstituteSnapshot,
} from "@/lib/grocery/ingredient-gather";
import {
  formatGroceryQuantityText,
  diffOccurrences,
  type GroceryListSourceRefreshPreview,
} from "@/lib/grocery/ingredient-gather-core";
import {
  canCombine,
  groupForCombination,
  normalizedIngredientName,
  type CombinableOccurrence,
} from "@/lib/grocery/combine";
import {
  computeMealPlanResyncPlan,
  computeReconciliationManualDeletions,
  recomputeMealPlanItemAggregate,
  type PendingMealPlanContribution,
  type ResyncContributionSnapshot,
  type ResyncCandidateItem,
} from "@/lib/grocery/mealplan-resync-core";
import {
  getOwnedGroceryListOrThrow,
  type OwnedGroceryList,
} from "@/lib/grocery/queries";

/**
 * Grocery-list generation and management (PRODUCT_SPEC.md §60-64, Build
 * Plan Slices 12 and 15). Every item/source mutation below (toggle, manual
 * add/edit/remove, recategorize, reorder, uncombine, substitute
 * selection, completion) is mode-agnostic by construction — it operates
 * only on `GroceryListItem`/`GroceryItemContribution` rows scoped by
 * `listId`, with no `GroceryList.mode` branching — so it behaves
 * identically on a `STANDALONE` list (Slice 12) and an active
 * `MEAL_PLAN_LINKED` list (Slice 15), satisfying §62.1/§62.2's "before or
 * while editing the generated list" choice via the same post-generation
 * controls either way. Meal-Plan-specific generation and reconciliation
 * (`generateGroceryListFromMealPlan`/`resyncGroceryListFromMealPlan`) live
 * in their own section near the bottom of this file.
 */

type OwnedGroceryListItem = OwnedGroceryList["items"][number];

function assertListActive(list: { completedAt: Date | null }): void {
  if (list.completedAt != null) {
    throw new ValidationError(
      "This grocery list is completed and frozen — reopen it to make changes.",
    );
  }
}

function findOwnedItem(
  list: OwnedGroceryList,
  itemId: string,
): OwnedGroceryListItem {
  const item = list.items.find((i) => i.id === itemId);
  if (!item) throw new NotFoundError("Grocery list item not found.");
  return item;
}

/** Substitute-snapshot columns for a contribution write, null-clearing every
 * field when `substitute` is null (Slice 12 correction). */
function substituteSnapshotFields(
  substitute: ResolvedSubstituteSnapshot | null,
) {
  return {
    substituteIngredientLineageId: substitute?.ingredientLineageId ?? null,
    substituteName: substitute?.originalName ?? null,
    substituteQuantityDecimal: substitute?.quantity ?? null,
    substituteQuantityText: substitute
      ? (substitute.displayText ??
        formatGroceryQuantityText(
          substitute.quantity,
          substitute.quantityEnd,
          substitute.isApproximate,
        ))
      : null,
    substituteUnit: substitute?.unit ?? null,
  };
}

async function getOwnedFallbackCategory(ownerId: string) {
  return prisma.groceryCategory.findFirstOrThrow({
    where: { ownerId, isFallback: true },
  });
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type GenerateGroceryListSourceInput = {
  dishId: string;
  /** Explicit Version choice from the "Make grocery list" modal — defaults
   * to the Dish's current Version when omitted. */
  dishVersionId?: string | null;
  /** 1 = the source's authored amount, unscaled (§60.2). */
  scaleFactor: number;
};

export type GenerateGroceryListInput = {
  title: string;
  plannedDate: Date;
  sources: GenerateGroceryListSourceInput[];
};

type PendingContribution = {
  sourceId: string;
  occurrence: ResolvedIngredientOccurrence;
};

/**
 * The one transaction (ARCHITECTURE_PROPOSAL.md §I) behind "Generate list":
 * `GroceryList` + one `GroceryListSource` per selected Recipe/Part (with its
 * durable title/kind/Version-label snapshot, Correction 4) + flattened
 * ingredient occurrences grouped into `GroceryListItem`s by safe combination
 * (§61) with one `GroceryItemContribution` row per source ingredient
 * occurrence — every value denormalized at generation time (Arch §H) so a
 * later Recipe/Part edit never silently rewrites this list (§60.3).
 */
export async function generateGroceryList(
  ownerId: string,
  input: GenerateGroceryListInput,
  clientListId?: string,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new ValidationError("Enter a title for this grocery list.");
  if (input.sources.length === 0) {
    throw new ValidationError("Select at least one Recipe or Part.");
  }

  // One cache shared across every source in this generation call — a nested
  // Part reused by several selected Recipes/Parts (or the same Recipe/Part
  // selected twice) is only walked once (TODO.md §1).
  const gatherCache = createIngredientGatherCache();
  const resolvedSources = await Promise.all(
    input.sources.map(async (source) => {
      if (!Number.isFinite(source.scaleFactor) || source.scaleFactor <= 0) {
        throw new ValidationError(
          "Each source's amount must be a positive number.",
        );
      }
      const dish = await getOwnedDishOrThrow(ownerId, source.dishId);
      const resolvedVersionId = source.dishVersionId || dish.currentVersionId;
      if (!resolvedVersionId) {
        throw new ValidationError(
          `"${dish.currentTitle ?? "Untitled"}" has no saved content to generate from.`,
        );
      }
      const version = await prisma.dishVersion.findFirst({
        where: { id: resolvedVersionId, dishId: dish.id },
        select: { id: true, majorVersion: true, minorVersion: true },
      });
      if (!version) throw new NotFoundError("Version not found.");
      const slots = await gatherIngredientSlots(
        ownerId,
        version.id,
        gatherCache,
      );
      const occurrences = resolveIngredientOccurrences(
        slots,
        source.scaleFactor,
      );
      return { dish, version, occurrences, scaleFactor: source.scaleFactor };
    }),
  );

  const fallbackCategory = await getOwnedFallbackCategory(ownerId);
  const memories = await prisma.ingredientCategoryMemory.findMany({
    where: { ownerId },
  });
  const categoryByNormalizedName = new Map(
    memories.map((m) => [m.normalizedIngredientName, m.groceryCategoryId]),
  );

  return prisma.$transaction(async (tx) => {
    const list = await tx.groceryList.create({
      data: {
        ...(clientListId ? { id: clientListId } : {}),
        ownerId,
        title,
        plannedDate: input.plannedDate,
      },
    });

    const pending: PendingContribution[] = [];
    for (const resolved of resolvedSources) {
      const sourceRow = await tx.groceryListSource.create({
        data: {
          groceryListId: list.id,
          dishId: resolved.dish.id,
          dishVersionId: resolved.version.id,
          scaleFactor: resolved.scaleFactor,
          sourceDishTitleSnapshot: resolved.dish.currentTitle ?? "Untitled",
          sourceDishKindSnapshot: resolved.dish.kind,
          sourceDishVersionLabelSnapshot: versionLabel(
            resolved.version.majorVersion,
            resolved.version.minorVersion,
          ),
        },
      });
      for (const occurrence of resolved.occurrences) {
        pending.push({ sourceId: sourceRow.id, occurrence });
      }
    }

    const groups = groupForCombination(
      pending.map((p, index) => toCombinable(String(index), p.occurrence)),
    );

    let position = 0;
    for (const group of groups) {
      const members = group.members.map((m) => pending[Number(m.key)]);
      const isOptional = members.every((m) => m.occurrence.isOptional);
      const categoryId =
        categoryByNormalizedName.get(normalizedIngredientName(group.name)) ??
        fallbackCategory.id;

      const item = await tx.groceryListItem.create({
        data: {
          groceryListId: list.id,
          categoryId,
          name: group.name,
          quantityText: aggregateQuantityText(group.totalQuantity, members),
          quantityDecimal: group.totalQuantity,
          unit: group.unit,
          isOptional,
          isManual: false,
          position: position++,
        },
      });

      for (const member of members) {
        await tx.groceryItemContribution.create({
          data: {
            groceryListItemId: item.id,
            groceryListSourceId: member.sourceId,
            ingredientLineageId: member.occurrence.ingredientLineageId,
            originalName: member.occurrence.originalName,
            quantityDecimal: member.occurrence.quantity,
            quantityText:
              member.occurrence.displayText ??
              formatGroceryQuantityText(
                member.occurrence.quantity,
                member.occurrence.quantityEnd,
                member.occurrence.isApproximate,
              ),
            unit: member.occurrence.unit,
            isOptional: member.occurrence.isOptional,
            ...substituteSnapshotFields(member.occurrence.substitute),
          },
        });
      }
    }

    return list.id;
  });
}

function toCombinable(
  key: string,
  occurrence: ResolvedIngredientOccurrence,
): CombinableOccurrence {
  return {
    key,
    name: occurrence.originalName,
    quantity: occurrence.quantity,
    quantityEnd: occurrence.quantityEnd,
    unit: occurrence.unit,
    displayText: occurrence.displayText,
    isOptional: occurrence.isOptional,
  };
}

function aggregateQuantityText(
  totalQuantity: number | null,
  members: { occurrence: ResolvedIngredientOccurrence }[],
): string | null {
  if (members.length === 1) {
    const only = members[0].occurrence;
    return (
      only.displayText ??
      formatGroceryQuantityText(
        only.quantity,
        only.quantityEnd,
        only.isApproximate,
      )
    );
  }
  if (totalQuantity != null) {
    const isApproximate = members.some((m) => m.occurrence.isApproximate);
    return formatGroceryQuantityText(totalQuantity, null, isApproximate);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Item-level contribution aggregation — shared by refresh/combine/uncombine
// ---------------------------------------------------------------------------

type ContributionRow = {
  id: string;
  originalName: string;
  quantityDecimal: Prisma.Decimal | null;
  quantityText: string | null;
  unit: string | null;
  isOptional: boolean;
  selectedVariant: GroceryContributionVariant;
  substituteName: string | null;
  substituteQuantityDecimal: Prisma.Decimal | null;
  substituteQuantityText: string | null;
  substituteUnit: string | null;
};

/**
 * The contribution's currently-effective name/quantity/unit — the frozen
 * primary snapshot, or the frozen substitute snapshot when `selectedVariant`
 * is `SUBSTITUTE`. Both snapshots always stay populated regardless of which
 * is selected (Slice 12 correction 2) — this is the one place that decides
 * which is "live" for aggregation/display purposes.
 */
function effectiveContributionFields(row: ContributionRow): {
  name: string;
  quantityDecimal: Prisma.Decimal | null;
  quantityText: string | null;
  unit: string | null;
} {
  if (row.selectedVariant === "SUBSTITUTE") {
    return {
      name: row.substituteName!,
      quantityDecimal: row.substituteQuantityDecimal,
      quantityText: row.substituteQuantityText,
      unit: row.substituteUnit,
    };
  }
  return {
    name: row.originalName,
    quantityDecimal: row.quantityDecimal,
    quantityText: row.quantityText,
    unit: row.unit,
  };
}

function contributionToCombinable(row: ContributionRow): CombinableOccurrence {
  const effective = effectiveContributionFields(row);
  const quantity = decimalToNumber(effective.quantityDecimal);
  return {
    key: row.id,
    name: effective.name,
    quantity,
    unit: effective.unit,
    // A contribution has no separate free-text column — a quantity-less row
    // carrying its own quantityText (e.g. "to taste") is exactly §10.7's
    // free-text case.
    displayText: quantity == null ? effective.quantityText : null,
    isOptional: row.isOptional,
  };
}

/**
 * Recomputes one `GroceryListItem`'s own displayed name/quantity/unit from
 * its current set of contributions (after a refresh, manual merge, or
 * uncombine leaves it with a different contribution set than it was
 * generated with). Restores `isOptional` from the sole contribution when
 * exactly one remains; leaves it alone for a >1 mixed-optionality manual
 * merge, where no single boolean is honest (Slice 12 correction).
 */
async function recomputeItemAggregate(
  tx: Prisma.TransactionClient,
  itemId: string,
): Promise<void> {
  const contributions = await tx.groceryItemContribution.findMany({
    where: { groceryListItemId: itemId },
    orderBy: { id: "asc" },
  });
  if (contributions.length === 0) return;

  const first = contributions[0];
  const allCombinable = contributions
    .slice(1)
    .every((c) =>
      canCombine(contributionToCombinable(first), contributionToCombinable(c)),
    );

  if (allCombinable) {
    const group = groupForCombination(
      contributions.map(contributionToCombinable),
    )[0];
    await tx.groceryListItem.update({
      where: { id: itemId },
      data: {
        name: group.name,
        unit: group.unit,
        quantityDecimal: group.totalQuantity,
        quantityText:
          group.totalQuantity != null
            ? formatGroceryQuantityText(group.totalQuantity, null, false)
            : contributions[0].quantityText,
        ...(contributions.length === 1
          ? { isOptional: contributions[0].isOptional }
          : {}),
      },
    });
    return;
  }

  // Not uniformly combinable (e.g. a manually merged pairing safe-combine
  // would have rejected) — no single quantity/unit can honestly represent
  // the group; fall back to a concatenated summary, source breakdown stays
  // the source of truth (§61.3).
  const firstEffective = effectiveContributionFields(first);
  await tx.groceryListItem.update({
    where: { id: itemId },
    data: {
      name: firstEffective.name,
      unit: null,
      quantityDecimal: null,
      quantityText: contributions
        .map((c) => {
          const effective = effectiveContributionFields(c);
          return [effective.quantityText, effective.unit]
            .filter(Boolean)
            .join(" ");
        })
        .filter(Boolean)
        .join(" + "),
    },
  });
}

type CombinableCandidateItem = {
  id: string;
  position: number;
  contributions: ContributionRow[];
};

/**
 * Shared "fold an Added ingredient occurrence into a combinable existing
 * item, else create a new one" step used by both `applyGroceryListSourceRefresh`
 * and `addGroceryListSource`'s Added-case loops. `candidates` is the list's
 * current items, fetched once by the caller before the loop starts, and is
 * mutated in place here so a later occurrence in the same loop can combine
 * into an item this function just created — without re-querying every
 * `GroceryListItem` on every iteration.
 */
async function foldOccurrenceIntoGroceryList(
  tx: Prisma.TransactionClient,
  params: {
    listId: string;
    sourceId: string;
    occurrence: ResolvedIngredientOccurrence;
    categoryByNormalizedName: Map<string, string>;
    fallbackCategoryId: string;
    candidates: CombinableCandidateItem[];
  },
): Promise<void> {
  const {
    listId,
    sourceId,
    occurrence,
    categoryByNormalizedName,
    fallbackCategoryId,
    candidates,
  } = params;

  // Checked against every one of the candidate's current contributions, not
  // just an arbitrary single one: by construction every existing member of
  // an already-combined item is mutually combinable with every other, so
  // matching *any* live member is equivalent to matching the group — but
  // checking only one arbitrary member (e.g. the first fetched row) is not
  // equivalent when that particular row doesn't represent the rest (a
  // `REMOVED` Meal-Plan contribution, or one whose selected substitute
  // variant diverges from the group's own name/unit). That mismatch was
  // silently splitting an otherwise-combinable duplicate ingredient into a
  // second item instead of folding it in (grocery combine QA finding).
  const combinable = candidates.find((candidate) =>
    candidate.contributions.some((c) =>
      canCombine(contributionToCombinable(c), toCombinable("new", occurrence)),
    ),
  );

  let target: CombinableCandidateItem;
  if (combinable) {
    target = combinable;
  } else {
    const maxPosition = candidates.reduce(
      (max, c) => Math.max(max, c.position),
      -1,
    );
    const created = await tx.groceryListItem.create({
      data: {
        groceryListId: listId,
        categoryId:
          categoryByNormalizedName.get(
            normalizedIngredientName(occurrence.originalName),
          ) ?? fallbackCategoryId,
        name: occurrence.originalName,
        isOptional: occurrence.isOptional,
        isManual: false,
        position: maxPosition + 1,
      },
    });
    target = { id: created.id, position: created.position, contributions: [] };
    candidates.push(target);
  }

  const contribution = await tx.groceryItemContribution.create({
    data: {
      groceryListItemId: target.id,
      groceryListSourceId: sourceId,
      ingredientLineageId: occurrence.ingredientLineageId,
      originalName: occurrence.originalName,
      quantityDecimal: occurrence.quantity,
      quantityText:
        occurrence.displayText ??
        formatGroceryQuantityText(
          occurrence.quantity,
          occurrence.quantityEnd,
          occurrence.isApproximate,
        ),
      unit: occurrence.unit,
      isOptional: occurrence.isOptional,
      ...substituteSnapshotFields(occurrence.substitute),
    },
  });
  // Appended, not replaced — a later occurrence in this same loop must be
  // able to see every live member gathered so far, not just the most
  // recent one, for the `.some()` combinability check above to hold.
  target.contributions = [...target.contributions, contribution];

  await recomputeItemAggregate(tx, target.id);
}

// ---------------------------------------------------------------------------
// Item mutations
// ---------------------------------------------------------------------------

export async function toggleGroceryItem(
  ownerId: string,
  listId: string,
  itemId: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);
  return prisma.groceryListItem.update({
    where: { id: itemId },
    data: { checkedAt: item.checkedAt ? null : new Date() },
  });
}

export type AddManualItemInput = {
  name: string;
  quantityText?: string | null;
  unit?: string | null;
  categoryId?: string | null;
};

export async function addManualGroceryItem(
  ownerId: string,
  listId: string,
  input: AddManualItemInput,
  clientItemId?: string,
) {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Enter an item name.");

  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);

  let categoryId = input.categoryId ?? null;
  if (categoryId) {
    const owned = await prisma.groceryCategory.findFirst({
      where: { id: categoryId, ownerId },
    });
    if (!owned) throw new NotFoundError("Grocery category not found.");
  } else {
    const memory = await prisma.ingredientCategoryMemory.findFirst({
      where: { ownerId, normalizedIngredientName: normalizeName(name) },
    });
    categoryId =
      memory?.groceryCategoryId ?? (await getOwnedFallbackCategory(ownerId)).id;
  }

  const maxPosition = await prisma.groceryListItem.aggregate({
    where: { groceryListId: listId },
    _max: { position: true },
  });

  return prisma.groceryListItem.create({
    data: {
      ...(clientItemId ? { id: clientItemId } : {}),
      groceryListId: listId,
      categoryId,
      name,
      quantityText: input.quantityText?.trim() || null,
      unit: input.unit?.trim() || null,
      isManual: true,
      position: (maxPosition._max.position ?? -1) + 1,
    },
  });
}

export type EditGroceryItemInput = {
  name?: string;
  quantityText?: string | null;
  unit?: string | null;
};

/** §64: editing names and quantities — available on any item (manual or
 * generated); editing a generated item's text is an explicit user override,
 * not treated as a new contribution. */
export async function editGroceryItem(
  ownerId: string,
  listId: string,
  itemId: string,
  input: EditGroceryItemInput,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  findOwnedItem(list, itemId);

  const name = input.name?.trim();
  if (input.name !== undefined && !name) {
    throw new ValidationError("Enter an item name.");
  }

  return prisma.groceryListItem.update({
    where: { id: itemId },
    data: {
      ...(name ? { name } : {}),
      ...(input.quantityText !== undefined
        ? { quantityText: input.quantityText?.trim() || null }
        : {}),
      ...(input.unit !== undefined ? { unit: input.unit?.trim() || null } : {}),
    },
  });
}

/**
 * §62.1: the user may remove an (optional or any other) item before or
 * after generation — after generation is this action. On a `MEAL_PLAN_LINKED`
 * list, deleting the item would otherwise leave no trace that the removal
 * was deliberate — `resyncGroceryListFromMealPlan` matches strictly by
 * (mealPlanEntryId, ingredientLineageId), so a later unrelated resync would
 * see the still-live source as newly "Added" and silently recreate it. A
 * tombstone row per removed contribution (same identity key, never by name)
 * prevents that recreation while leaving every other sync case — a
 * genuinely new contribution, a changed one, source refresh, Uncombine —
 * untouched (§81.4 correction).
 */
export async function removeGroceryItem(
  ownerId: string,
  listId: string,
  itemId: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);

  await prisma.$transaction(async (tx) => {
    if (list.mode === "MEAL_PLAN_LINKED") {
      const tombstones = item.contributions.filter(
        (c) => c.mealPlanEntryId && c.ingredientLineageId,
      );
      for (const c of tombstones) {
        await tx.groceryListRemovedContribution.upsert({
          where: {
            groceryListId_mealPlanEntryId_ingredientLineageId: {
              groceryListId: listId,
              mealPlanEntryId: c.mealPlanEntryId!,
              ingredientLineageId: c.ingredientLineageId!,
            },
          },
          create: {
            groceryListId: listId,
            mealPlanEntryId: c.mealPlanEntryId!,
            ingredientLineageId: c.ingredientLineageId!,
            wasOptional: c.isOptional,
          },
          // A re-removal (this lineage reappeared after an earlier
          // invalidation, or after being re-included, and is now removed
          // again) refreshes the recorded optionality to what it is *now* —
          // stale bookkeeping from a prior removal must never govern a new
          // one.
          update: { removedAt: new Date(), wasOptional: c.isOptional },
        });
      }
    }
    await tx.groceryListItem.delete({ where: { id: itemId } });
  });
}

export async function recategorizeGroceryItem(
  ownerId: string,
  listId: string,
  itemId: string,
  categoryId: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);
  const category = await prisma.groceryCategory.findFirst({
    where: { id: categoryId, ownerId },
  });
  if (!category) throw new NotFoundError("Grocery category not found.");

  await prisma.$transaction([
    prisma.groceryListItem.update({
      where: { id: itemId },
      data: { categoryId },
    }),
    // §63.3 — remembers the categorization for this normalized ingredient
    // name for next time; never touches Dish/DishVersion (Correction 8).
    prisma.ingredientCategoryMemory.upsert({
      where: {
        ownerId_normalizedIngredientName: {
          ownerId,
          normalizedIngredientName: normalizeName(item.name),
        },
      },
      create: {
        ownerId,
        normalizedIngredientName: normalizeName(item.name),
        groceryCategoryId: categoryId,
      },
      update: { groceryCategoryId: categoryId },
    }),
  ]);
}

export async function reorderGroceryListItems(
  ownerId: string,
  listId: string,
  orderedItemIds: string[],
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const owned = new Set(list.items.map((i) => i.id));
  if (
    orderedItemIds.length !== list.items.length ||
    !orderedItemIds.every((id) => owned.has(id))
  ) {
    throw new ValidationError("One or more items could not be found.");
  }

  await prisma.$transaction(
    orderedItemIds.map((id, index) =>
      prisma.groceryListItem.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Uncombine (§61.3-§61.4)
// ---------------------------------------------------------------------------

/**
 * Uncombine (§61.4) — fully reverses combination, giving every one of a
 * combined item's contributions back its own `GroceryListItem` (the exact
 * "keep separate" outcome the Build Plan pairs this control with). A pure
 * re-parenting of existing `GroceryItemContribution` rows, never a
 * destructive rebuild (Arch §D.11) — a correction/inspection tool, not a
 * general splitter, so it throws on an item with fewer than two
 * contributions (nothing to split) or a manual item (no contributions at
 * all). Each split-off item's `isOptional` is restored from its own
 * contribution, not the combined item's aggregate (Slice 12 correction).
 */
export async function uncombineGroceryItem(
  ownerId: string,
  listId: string,
  itemId: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);
  const contributions = await prisma.groceryItemContribution.findMany({
    where: { groceryListItemId: itemId },
    orderBy: { id: "asc" },
  });
  if (contributions.length < 2) {
    throw new ValidationError("This item has nothing to uncombine.");
  }

  await prisma.$transaction(async (tx) => {
    const maxPosition = await tx.groceryListItem.aggregate({
      where: { groceryListId: listId },
      _max: { position: true },
    });
    let nextPosition = (maxPosition._max.position ?? item.position) + 1;

    // The first contribution stays on the original item (recomputed to a
    // single-member display); every other contribution gets its own fresh
    // sibling item.
    for (const contribution of contributions.slice(1)) {
      const newItem = await tx.groceryListItem.create({
        data: {
          groceryListId: listId,
          categoryId: item.categoryId,
          name: contribution.originalName,
          isOptional: contribution.isOptional,
          isManual: false,
          position: nextPosition++,
        },
      });
      await tx.groceryItemContribution.update({
        where: { id: contribution.id },
        data: { groceryListItemId: newItem.id },
      });
      await recomputeItemAggregate(tx, newItem.id);
    }
    await recomputeItemAggregate(tx, itemId);
  });
}

/**
 * Combine — the reverse of `uncombineGroceryItem`: re-parents every other
 * still-`canCombine`-compatible item's contribution(s) onto `itemId` and
 * deletes those now-empty items, the same pure-re-parenting approach
 * uncombine uses (never a destructive rebuild). Exposed on a single-
 * contribution, non-manual item — the shape uncombine produces — so a user
 * can recombine split-off sources back together; throws when there's
 * nothing left compatible to combine with.
 */
export async function combineGroceryItems(
  ownerId: string,
  listId: string,
  itemId: string,
): Promise<void> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);
  const anchor = item.contributions[0];
  if (item.isManual || !anchor) {
    throw new ValidationError("This item has nothing to combine.");
  }

  const matches = list.items.filter((other) => {
    if (other.id === itemId || other.isManual) return false;
    const otherAnchor = other.contributions[0];
    return (
      otherAnchor != null &&
      canCombine(
        contributionToCombinable(anchor),
        contributionToCombinable(otherAnchor),
      )
    );
  });
  if (matches.length === 0) {
    throw new ValidationError("No other items to combine this with.");
  }

  await prisma.$transaction(async (tx) => {
    for (const match of matches) {
      await tx.groceryItemContribution.updateMany({
        where: { groceryListItemId: match.id },
        data: { groceryListItemId: itemId },
      });
      await tx.groceryListItem.delete({ where: { id: match.id } });
    }
    await recomputeItemAggregate(tx, itemId);
  });
}

// ---------------------------------------------------------------------------
// Substitute selection (§62.2 — "while editing the generated list")
// ---------------------------------------------------------------------------

/**
 * Selects which of a single-contribution item's two frozen snapshots —
 * `PRIMARY` (the original) or `SUBSTITUTE` (the saved substitute) — is
 * currently effective (§62.2), reversibly in either direction (Slice 12
 * correction 2). Neither snapshot is ever overwritten or cleared by this
 * operation, so selecting back and forth always reproduces the same frozen
 * values; it works identically after the source is edited, superseded by a
 * newer Version, or permanently deleted (§60.6), since it never re-reads
 * source content. Combined items uncombine first (§61.4); manual items have
 * no substitute to select.
 */
export async function selectGroceryItemVariant(
  ownerId: string,
  listId: string,
  itemId: string,
  variant: GroceryContributionVariant,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);
  if (item.isManual) {
    throw new ValidationError("A manual item has no substitute to select.");
  }
  if (item.contributions.length !== 1) {
    throw new ValidationError(
      "Uncombine this item first to select a variant for just one contribution.",
    );
  }
  const contribution = item.contributions[0];
  if (variant === "SUBSTITUTE" && !contribution.substituteIngredientLineageId) {
    throw new ValidationError("This item has no saved substitute.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.groceryItemContribution.update({
      where: { id: contribution.id },
      data: { selectedVariant: variant },
    });
    await recomputeItemAggregate(tx, itemId);
  });
}

// ---------------------------------------------------------------------------
// Source refresh (§60.4/§60.5)
// ---------------------------------------------------------------------------

export type {
  GroceryListSourceRefreshDiffEntry,
  GroceryListSourceRefreshChangeEntry,
  GroceryListSourceRefreshPreview,
} from "@/lib/grocery/ingredient-gather-core";

async function resolveRefreshTarget(
  ownerId: string,
  source: { dishId: string | null; dishVersionId: string | null },
  targetVersionId?: string,
) {
  if (!source.dishId || !source.dishVersionId) {
    throw new ValidationError(
      "This source's original Recipe or Part has been deleted and can no longer be refreshed.",
    );
  }
  const dish = await getOwnedDishOrThrow(ownerId, source.dishId);
  const currentPinned = await prisma.dishVersion.findFirstOrThrow({
    where: { id: source.dishVersionId },
    select: { majorVersion: true },
  });

  let resolvedId = targetVersionId;
  if (!resolvedId) {
    // §60.4 default: the same major line's own highest minor — never a
    // newer major line, which never auto-prompts.
    const sameMajor = await prisma.dishVersion.aggregate({
      where: { dishId: dish.id, majorVersion: currentPinned.majorVersion },
      _max: { minorVersion: true },
    });
    const latestOnLine = await prisma.dishVersion.findFirst({
      where: {
        dishId: dish.id,
        majorVersion: currentPinned.majorVersion,
        minorVersion: sameMajor._max.minorVersion ?? 0,
      },
      select: { id: true },
    });
    resolvedId = latestOnLine?.id ?? source.dishVersionId;
  }

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: resolvedId, dishId: dish.id },
    select: { id: true, majorVersion: true, minorVersion: true },
  });
  if (!targetVersion) throw new NotFoundError("Target version not found.");
  return { dish, targetVersion };
}

/** Read-only diff preview (§60.5) — no mutation. */
export async function previewGroceryListSourceRefresh(
  ownerId: string,
  listId: string,
  sourceId: string,
  targetVersionId?: string,
): Promise<GroceryListSourceRefreshPreview> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  const source = list.sources.find((s) => s.id === sourceId);
  if (!source) throw new NotFoundError("Grocery list source not found.");

  const { targetVersion } = await resolveRefreshTarget(
    ownerId,
    source,
    targetVersionId,
  );
  const hasNewerMinor = targetVersion.id !== source.dishVersionId;

  const existingContributions = list.items
    .flatMap((item) => item.contributions)
    .filter((c) => c.groceryListSourceId === sourceId);

  const slots = await gatherIngredientSlots(ownerId, targetVersion.id);
  const fresh = resolveIngredientOccurrences(
    slots,
    decimalToNumber(source.scaleFactor) ?? 1,
  );

  const diff = diffOccurrences(existingContributions, fresh);

  return {
    hasNewerMinor,
    targetVersionId: targetVersion.id,
    targetVersionLabel: versionLabel(
      targetVersion.majorVersion,
      targetVersion.minorVersion,
    ),
    ...diff,
  };
}

/**
 * Applies a previewed refresh (§60.5 — requires the preview/confirmation
 * step above). Only this one source's own contributions are touched: an
 * ingredient present in both the old and new content is updated in place
 * (preserving its owning `GroceryListItem` and that item's `checkedAt`); a
 * newly-appearing ingredient joins an existing combinable item or starts a
 * new one; a disappeared ingredient's contribution is removed, deleting its
 * owning item only if no other contribution keeps it alive. Every other
 * item and source in the list — including the user's own manual edits — is
 * left untouched (§60.5's "preserves awareness of manual list edits").
 */
export async function applyGroceryListSourceRefresh(
  ownerId: string,
  listId: string,
  sourceId: string,
  targetVersionId?: string,
  /** Grocery List "Edit meal" modal: an explicit new target-servings scale,
   * replacing the source's existing one. Omitted for a plain Sync, which
   * keeps the source's current scale. */
  scaleFactorOverride?: number,
): Promise<void> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const source = list.sources.find((s) => s.id === sourceId);
  if (!source) throw new NotFoundError("Grocery list source not found.");
  if (
    scaleFactorOverride != null &&
    (!Number.isFinite(scaleFactorOverride) || scaleFactorOverride <= 0)
  ) {
    throw new ValidationError("This meal's amount must be a positive number.");
  }

  const { targetVersion } = await resolveRefreshTarget(
    ownerId,
    source,
    targetVersionId,
  );
  const scaleFactor =
    scaleFactorOverride ?? decimalToNumber(source.scaleFactor) ?? 1;
  const slots = await gatherIngredientSlots(ownerId, targetVersion.id);
  const fresh = resolveIngredientOccurrences(slots, scaleFactor);
  const freshByLineage = new Map(
    fresh
      .filter((f) => f.ingredientLineageId)
      .map((f) => [f.ingredientLineageId, f]),
  );

  await prisma.$transaction(async (tx) => {
    // Read inside the transaction, not before it (fix for an intermittent
    // Sync failure — grocery Sync QA finding): the target Version's fresh
    // occurrences above come from the Recipe/Part side, which this list's
    // own mutations never race against, but `existingContributions` is
    // this list's own state. Reading it with a plain `prisma` call before
    // opening the transaction left a window where a concurrent mutation on
    // this same source (another tab, a Meal-Plan-triggered resync, a
    // second rapid Sync click) could delete/alter a row this transaction
    // then tried to delete/update by a now-stale id, throwing a Prisma
    // "record not found" error that a bare retry (re-reading fresh state)
    // would no longer hit. Reading through `tx` here instead closes that
    // window — Postgres serializes a concurrent transaction touching the
    // same rows against this one rather than letting both act on
    // independently-stale snapshots.
    const existingContributions = await tx.groceryItemContribution.findMany({
      where: { groceryListSourceId: sourceId },
    });
    const existingByLineage = new Map(
      existingContributions
        .filter((c) => c.ingredientLineageId)
        .map((c) => [c.ingredientLineageId!, c]),
    );

    // Removed
    for (const contribution of existingContributions) {
      if (
        !contribution.ingredientLineageId ||
        !freshByLineage.has(contribution.ingredientLineageId)
      ) {
        await tx.groceryItemContribution.delete({
          where: { id: contribution.id },
        });
        const remaining = await tx.groceryItemContribution.count({
          where: { groceryListItemId: contribution.groceryListItemId },
        });
        if (remaining === 0) {
          await tx.groceryListItem.delete({
            where: { id: contribution.groceryListItemId },
          });
        } else {
          await recomputeItemAggregate(tx, contribution.groceryListItemId);
        }
      }
    }

    // Unchanged/changed — update in place
    for (const [lineageId, occurrence] of freshByLineage) {
      const existing = existingByLineage.get(lineageId);
      if (!existing) continue;
      // A currently-SUBSTITUTE selection reverts to PRIMARY only when the
      // refreshed Version no longer has a substitute at all; it is otherwise
      // preserved (and a PRIMARY selection is never disturbed by a newly
      // appearing substitute) — Slice 12 correction 2.
      const nextVariant: GroceryContributionVariant =
        existing.selectedVariant === "SUBSTITUTE" && !occurrence.substitute
          ? "PRIMARY"
          : existing.selectedVariant;
      await tx.groceryItemContribution.update({
        where: { id: existing.id },
        data: {
          originalName: occurrence.originalName,
          quantityDecimal: occurrence.quantity,
          quantityText:
            occurrence.displayText ??
            formatGroceryQuantityText(
              occurrence.quantity,
              occurrence.quantityEnd,
              occurrence.isApproximate,
            ),
          unit: occurrence.unit,
          isOptional: occurrence.isOptional,
          // Refresh also maintains the substitute snapshot (§60.5).
          ...substituteSnapshotFields(occurrence.substitute),
          selectedVariant: nextVariant,
        },
      });
      await recomputeItemAggregate(tx, existing.groceryListItemId);
    }

    // Added — fold into an existing combinable item, else create a new one.
    // Candidates are fetched once, then updated in place as this loop
    // creates new items, instead of re-querying every list item per
    // occurrence.
    const fallbackCategory = await getOwnedFallbackCategory(ownerId);
    const memories = await tx.ingredientCategoryMemory.findMany({
      where: { ownerId },
    });
    const categoryByNormalizedName = new Map(
      memories.map((m) => [m.normalizedIngredientName, m.groceryCategoryId]),
    );
    const candidates: CombinableCandidateItem[] = await tx.groceryListItem
      .findMany({
        where: { groceryListId: listId },
        // Every contribution, not just a `take: 1` first row — the fold
        // match below must be able to check every live member (see
        // `foldOccurrenceIntoGroceryList`'s combinability comment).
        include: { contributions: true },
      })
      .then((items) =>
        items.map((item) => ({
          id: item.id,
          position: item.position,
          contributions: item.contributions,
        })),
      );
    for (const [lineageId, occurrence] of freshByLineage) {
      if (existingByLineage.has(lineageId)) continue;
      await foldOccurrenceIntoGroceryList(tx, {
        listId,
        sourceId,
        occurrence,
        categoryByNormalizedName,
        fallbackCategoryId: fallbackCategory.id,
        candidates,
      });
    }

    await tx.groceryListSource.update({
      where: { id: sourceId },
      data: {
        dishVersionId: targetVersion.id,
        sourceDishVersionLabelSnapshot: versionLabel(
          targetVersion.majorVersion,
          targetVersion.minorVersion,
        ),
        ...(scaleFactorOverride != null
          ? { scaleFactor: scaleFactorOverride }
          : {}),
      },
    });
  });
}

/**
 * Adds one more Recipe/Part as a Grocery List source (detail page's "Add
 * meal") — same per-source snapshot as `generateGroceryList`, then folds
 * every resolved occurrence into the list using the same combine-or-create
 * logic as a source refresh's "Added" case, so it lands in an existing
 * combinable item where one exists.
 */
export async function addGroceryListSource(
  ownerId: string,
  listId: string,
  dishId: string,
  dishVersionId: string | undefined,
  scaleFactor: number,
): Promise<void> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    throw new ValidationError("This meal's amount must be a positive number.");
  }

  const dish = await getOwnedDishOrThrow(ownerId, dishId);
  const resolvedVersionId = dishVersionId || dish.currentVersionId;
  if (!resolvedVersionId) {
    throw new ValidationError(
      `"${dish.currentTitle ?? "Untitled"}" has no saved content to add.`,
    );
  }
  const version = await prisma.dishVersion.findFirst({
    where: { id: resolvedVersionId, dishId: dish.id },
    select: { majorVersion: true, minorVersion: true },
  });
  if (!version) throw new NotFoundError("Version not found.");
  const slots = await gatherIngredientSlots(ownerId, resolvedVersionId);
  const occurrences = resolveIngredientOccurrences(slots, scaleFactor);

  const fallbackCategory = await getOwnedFallbackCategory(ownerId);
  const memories = await prisma.ingredientCategoryMemory.findMany({
    where: { ownerId },
  });
  const categoryByNormalizedName = new Map(
    memories.map((m) => [m.normalizedIngredientName, m.groceryCategoryId]),
  );

  await prisma.$transaction(async (tx) => {
    const sourceRow = await tx.groceryListSource.create({
      data: {
        groceryListId: listId,
        dishId: dish.id,
        dishVersionId: resolvedVersionId,
        scaleFactor,
        sourceDishTitleSnapshot: dish.currentTitle ?? "Untitled",
        sourceDishKindSnapshot: dish.kind,
        sourceDishVersionLabelSnapshot: versionLabel(
          version.majorVersion,
          version.minorVersion,
        ),
      },
    });

    const candidates: CombinableCandidateItem[] = await tx.groceryListItem
      .findMany({
        where: { groceryListId: listId },
        // Every contribution, not just a `take: 1` first row — the fold
        // match below must be able to check every live member (see
        // `foldOccurrenceIntoGroceryList`'s combinability comment).
        include: { contributions: true },
      })
      .then((items) =>
        items.map((item) => ({
          id: item.id,
          position: item.position,
          contributions: item.contributions,
        })),
      );
    for (const occurrence of occurrences) {
      await foldOccurrenceIntoGroceryList(tx, {
        listId,
        sourceId: sourceRow.id,
        occurrence,
        categoryByNormalizedName,
        fallbackCategoryId: fallbackCategory.id,
        candidates,
      });
    }
  });
}

/**
 * Removes one Grocery List source (detail page meal card's Delete) and every
 * one of its contributions — an item left with no remaining contribution is
 * deleted with it, same "last contribution standing" rule a source refresh's
 * "Removed" case applies; every other source/item, including manual edits,
 * is untouched.
 */
export async function removeGroceryListSource(
  ownerId: string,
  listId: string,
  sourceId: string,
): Promise<void> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const source = list.sources.find((s) => s.id === sourceId);
  if (!source) throw new NotFoundError("Grocery list source not found.");

  const existingContributions = await prisma.groceryItemContribution.findMany({
    where: { groceryListSourceId: sourceId },
  });

  await prisma.$transaction(async (tx) => {
    for (const contribution of existingContributions) {
      await tx.groceryItemContribution.delete({
        where: { id: contribution.id },
      });
      const remaining = await tx.groceryItemContribution.count({
        where: { groceryListItemId: contribution.groceryListItemId },
      });
      if (remaining === 0) {
        await tx.groceryListItem.delete({
          where: { id: contribution.groceryListItemId },
        });
      } else {
        await recomputeItemAggregate(tx, contribution.groceryListItemId);
      }
    }

    await tx.groceryListSource.delete({ where: { id: sourceId } });
  });
}

// ---------------------------------------------------------------------------
// List lifecycle (§64)
// ---------------------------------------------------------------------------

/**
 * Updates a Grocery List's editable details — name, active status, and
 * date — from the detail page's Edit modal. Active status is expressed as
 * `completedAt` under the hood: turning it off completes the list (if not
 * already), turning it on reopens it.
 */
export async function updateGroceryListDetails(
  ownerId: string,
  listId: string,
  input: { title: string; plannedDate: Date; isActive: boolean },
) {
  const trimmed = input.title.trim();
  if (!trimmed)
    throw new ValidationError("Enter a title for this grocery list.");
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  const wasActive = list.completedAt == null;
  return prisma.groceryList.update({
    where: { id: listId },
    data: {
      title: trimmed,
      plannedDate: input.plannedDate,
      completedAt: input.isActive
        ? null
        : wasActive
          ? new Date()
          : list.completedAt,
    },
  });
}

export async function completeGroceryList(ownerId: string, listId: string) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  if (list.completedAt != null) {
    throw new ValidationError("This grocery list is already completed.");
  }
  return prisma.groceryList.update({
    where: { id: listId },
    data: { completedAt: new Date() },
  });
}

/** Reopening un-freezes a completed list (§64) — the historical record of
 * having been completed once is not separately tracked beyond this. */
export async function reopenGroceryList(ownerId: string, listId: string) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  if (list.completedAt == null) {
    throw new ValidationError("This grocery list is not completed.");
  }
  return prisma.groceryList.update({
    where: { id: listId },
    data: { completedAt: null },
  });
}

export async function deleteGroceryList(ownerId: string, listId: string) {
  await getOwnedGroceryListOrThrow(ownerId, listId);
  await prisma.groceryList.delete({ where: { id: listId } });
}

/**
 * Duplicates a list — including completed history — into a fresh, active,
 * independent copy: same sources/items/contributions, but every checkoff
 * and sync flag resets, since it represents a new shopping trip rather than
 * a continuation of the original's progress.
 */
export async function duplicateGroceryList(
  ownerId: string,
  listId: string,
  clientListId?: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);

  return prisma.$transaction(async (tx) => {
    const copy = await tx.groceryList.create({
      data: {
        ...(clientListId ? { id: clientListId } : {}),
        ownerId,
        title: `${list.title} (copy)`,
        // Represents a new shopping trip (see doc comment above), so it
        // gets today's date rather than inheriting the original's.
        plannedDate: new Date(),
      },
    });

    const sourceIdMap = new Map<string, string>();
    for (const source of list.sources) {
      const copiedSource = await tx.groceryListSource.create({
        data: {
          groceryListId: copy.id,
          dishId: source.dishId,
          dishVersionId: source.dishVersionId,
          scaleFactor: source.scaleFactor,
          sourceDishTitleSnapshot: source.sourceDishTitleSnapshot,
          sourceDishKindSnapshot: source.sourceDishKindSnapshot,
          sourceDishVersionLabelSnapshot: source.sourceDishVersionLabelSnapshot,
        },
      });
      sourceIdMap.set(source.id, copiedSource.id);
    }

    for (const item of list.items) {
      const copiedItem = await tx.groceryListItem.create({
        data: {
          groceryListId: copy.id,
          categoryId: item.categoryId,
          name: item.name,
          quantityText: item.quantityText,
          quantityDecimal: item.quantityDecimal,
          unit: item.unit,
          isOptional: item.isOptional,
          isManual: item.isManual,
          position: item.position,
        },
      });
      for (const contribution of item.contributions) {
        await tx.groceryItemContribution.create({
          data: {
            groceryListItemId: copiedItem.id,
            groceryListSourceId: contribution.groceryListSourceId
              ? sourceIdMap.get(contribution.groceryListSourceId)
              : null,
            ingredientLineageId: contribution.ingredientLineageId,
            originalName: contribution.originalName,
            quantityDecimal: contribution.quantityDecimal,
            quantityText: contribution.quantityText,
            unit: contribution.unit,
            isOptional: contribution.isOptional,
            substituteIngredientLineageId:
              contribution.substituteIngredientLineageId,
            substituteName: contribution.substituteName,
            substituteQuantityDecimal: contribution.substituteQuantityDecimal,
            substituteQuantityText: contribution.substituteQuantityText,
            substituteUnit: contribution.substituteUnit,
            selectedVariant: contribution.selectedVariant,
          },
        });
      }
    }

    return copy.id;
  });
}

// ---------------------------------------------------------------------------
// Meal Plan generation & live synchronization (BUILD_PLAN.md Slice 15,
// PRODUCT_SPEC.md §81, ARCHITECTURE_PROPOSAL.md §D.11/§H/§I)
// ---------------------------------------------------------------------------

/**
 * The subset of a `MealPlanEntry` this module needs — deliberately not the
 * full Prisma row, so `mealplans/service.ts` (the caller, which already
 * owns Meal Plan authorization via `getOwnedMealPlanOrThrow`) can pass
 * entries straight from its own already-fetched, already-owned data without
 * this module re-deriving Meal Plan ownership itself.
 */
export type MealPlanContributionEntry = {
  id: string;
  dishId: string | null;
  dishVersionId: string | null;
  targetYieldQuantity: Prisma.Decimal | null;
};

export type { PendingMealPlanContribution };

/**
 * Flattens every entry's current ingredient content, scaled by its own
 * target-yield-vs-authored-yield ratio (`computeTargetYieldScaleFactor`) —
 * the Meal-Plan equivalent of `generateGroceryList`'s per-source resolution
 * above. An entry whose source was permanently deleted (`dishId`/
 * `dishVersionId` null) or whose target Version no longer exists
 * contributes nothing, silently — the caller decides whether an empty
 * result overall is an error.
 *
 * Exported so `mealplans/service.ts#resyncLinkedLists` can compute this once
 * per mutation and pass the same result to every linked list's resync,
 * rather than each list independently re-walking the (potentially large)
 * ingredient tree for identical entries.
 */
export async function collectMealPlanOccurrences(
  ownerId: string,
  entries: MealPlanContributionEntry[],
): Promise<PendingMealPlanContribution[]> {
  const result: PendingMealPlanContribution[] = [];
  // One cache shared across every entry in this mutation — a Recipe/Part
  // planned on more than one day, or several entries sharing a nested Part,
  // is only walked once instead of once per entry (TODO.md §1).
  const gatherCache = createIngredientGatherCache();
  for (const entry of entries) {
    if (!entry.dishId || !entry.dishVersionId) continue;
    const version = await prisma.dishVersion.findFirst({
      where: { id: entry.dishVersionId, dishId: entry.dishId },
      select: { yieldQuantity: true },
    });
    if (!version) continue;
    const scaleFactor = computeTargetYieldScaleFactor(
      decimalToNumber(entry.targetYieldQuantity),
      decimalToNumber(version.yieldQuantity),
    );
    const slots = await gatherIngredientSlots(
      ownerId,
      entry.dishVersionId,
      gatherCache,
    );
    for (const occurrence of resolveIngredientOccurrences(slots, scaleFactor)) {
      result.push({ mealPlanEntryId: entry.id, occurrence });
    }
  }
  return result;
}

/**
 * §81.7 — toggles whether one Meal Plan entry contributes to one
 * `MEAL_PLAN_LINKED` Grocery List. Takes `tx` so `mealplans/service.ts` can
 * run this in the same transaction as the resync it triggers immediately
 * after (mirroring every other Meal-Plan-mutation-then-resync pairing in
 * that module). Ownership of the Meal Plan/entry itself is the caller's
 * responsibility (`mealplans/service.ts` already holds it via
 * `getOwnedMealPlanOrThrow`) — this only verifies the Grocery List side:
 * owned, actually linked to `mealPlanId`, and not frozen.
 */
export async function setGroceryListMealPlanEntryExclusion(
  tx: Prisma.TransactionClient,
  ownerId: string,
  listId: string,
  mealPlanId: string,
  mealPlanEntryId: string,
  excluded: boolean,
): Promise<void> {
  const list = await tx.groceryList.findFirst({
    where: {
      id: listId,
      ownerId,
      mode: "MEAL_PLAN_LINKED",
      linkedMealPlanId: mealPlanId,
    },
  });
  if (!list) throw new NotFoundError("Grocery list not found.");
  assertListActive(list);

  if (excluded) {
    await tx.groceryListMealPlanEntryExclusion.upsert({
      where: {
        groceryListId_mealPlanEntryId: {
          groceryListId: listId,
          mealPlanEntryId,
        },
      },
      create: { groceryListId: listId, mealPlanEntryId },
      update: {},
    });
  } else {
    await tx.groceryListMealPlanEntryExclusion.deleteMany({
      where: { groceryListId: listId, mealPlanEntryId },
    });
  }
}

/**
 * Generates a `MEAL_PLAN_LINKED` grocery list from a Meal Plan's entries
 * (§81.1) — the entire plan, or the caller-selected subset of `entries`
 * already filtered by id/date-range in `mealplans/service.ts`. One
 * transaction, same combination logic as `generateGroceryList`, but every
 * contribution carries `mealPlanEntryId` instead of `groceryListSourceId`
 * (Correction 4) — this list has no `GroceryListSource` rows at all, since
 * its live source of truth is the Meal Plan's own entries.
 */
export async function generateGroceryListFromMealPlan(
  ownerId: string,
  mealPlanId: string,
  input: {
    title: string;
    plannedDate: Date;
    entries: MealPlanContributionEntry[];
  },
  clientListId?: string,
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new ValidationError("Enter a title for this grocery list.");
  if (input.entries.length === 0) {
    throw new ValidationError("Select at least one Meal Plan entry.");
  }

  const pending = await collectMealPlanOccurrences(ownerId, input.entries);
  if (pending.length === 0) {
    throw new ValidationError(
      "None of the selected entries have ingredients to generate from — their source Recipe or Part may have been deleted.",
    );
  }

  const fallbackCategory = await getOwnedFallbackCategory(ownerId);
  const memories = await prisma.ingredientCategoryMemory.findMany({
    where: { ownerId },
  });
  const categoryByNormalizedName = new Map(
    memories.map((m) => [m.normalizedIngredientName, m.groceryCategoryId]),
  );

  return prisma.$transaction(async (tx) => {
    const list = await tx.groceryList.create({
      data: {
        ...(clientListId ? { id: clientListId } : {}),
        ownerId,
        title,
        mode: "MEAL_PLAN_LINKED",
        linkedMealPlanId: mealPlanId,
        plannedDate: input.plannedDate,
      },
    });

    const groups = groupForCombination(
      pending.map((p, index) => toCombinable(String(index), p.occurrence)),
    );

    let position = 0;
    for (const group of groups) {
      const members = group.members.map((m) => pending[Number(m.key)]);
      const isOptional = members.every((m) => m.occurrence.isOptional);
      const categoryId =
        categoryByNormalizedName.get(normalizedIngredientName(group.name)) ??
        fallbackCategory.id;

      const item = await tx.groceryListItem.create({
        data: {
          groceryListId: list.id,
          categoryId,
          name: group.name,
          quantityText: aggregateQuantityText(group.totalQuantity, members),
          quantityDecimal: group.totalQuantity,
          unit: group.unit,
          isOptional,
          isManual: false,
          position: position++,
        },
      });

      for (const member of members) {
        await tx.groceryItemContribution.create({
          data: {
            groceryListItemId: item.id,
            mealPlanEntryId: member.mealPlanEntryId,
            ingredientLineageId: member.occurrence.ingredientLineageId,
            originalName: member.occurrence.originalName,
            quantityDecimal: member.occurrence.quantity,
            quantityText:
              member.occurrence.displayText ??
              formatGroceryQuantityText(
                member.occurrence.quantity,
                member.occurrence.quantityEnd,
                member.occurrence.isApproximate,
              ),
            unit: member.occurrence.unit,
            isOptional: member.occurrence.isOptional,
            ...substituteSnapshotFields(member.occurrence.substitute),
          },
        });
      }
    }

    return list.id;
  });
}

/**
 * Recomputes one Meal-Plan-synced `GroceryListItem`'s displayed aggregate
 * and `syncFlag` from its current contribution set, after
 * `resyncGroceryListFromMealPlan` has updated/added/flagged its
 * contributions. Unlike `recomputeItemAggregate` (standalone refresh, which
 * deletes disappeared contributions outright), a `REMOVED` contribution is
 * excluded from the aggregate but never deleted — its row remains as the
 * visible evidence a checked-off item's source disappeared (Arch §D.11
 * round-2 Correction 5).
 */
async function recomputeMealPlanItemSync(
  tx: Prisma.TransactionClient,
  itemId: string,
): Promise<void> {
  const contributions = await tx.groceryItemContribution.findMany({
    where: { groceryListItemId: itemId },
    orderBy: { id: "asc" },
  });
  const result = recomputeMealPlanItemAggregate(
    contributions.map(toResyncContributionSnapshot),
  );
  if (!result) return;

  if (result.kind === "removed") {
    // Every contribution behind this item disappeared from the live plan —
    // flag REMOVED, leave `checkedAt` untouched (a checked item's checkmark
    // must never silently vanish, the exact failure mode Correction 5
    // exists to prevent), and keep the last-known display values as-is.
    await tx.groceryListItem.update({
      where: { id: itemId },
      data: { syncFlag: "REMOVED", flagAcknowledgedAt: null },
    });
    return;
  }

  await tx.groceryListItem.update({
    where: { id: itemId },
    data: {
      name: result.name,
      unit: result.unit,
      quantityDecimal: result.quantityDecimal,
      quantityText: result.quantityText,
      ...(result.isOptional !== undefined
        ? { isOptional: result.isOptional }
        : {}),
      syncFlag: result.syncFlag,
      flagAcknowledgedAt: null,
    },
  });
}

/**
 * The explicit reconciliation step (Arch §D.11/§H/§I) run inside the same
 * transaction as every mutating Meal Plan action that can affect a linked
 * grocery list — add/remove/yield-change/Version-adoption. Diffs the
 * *current* set of contributions the plan's live `entries` would produce
 * against the *stored* set, matched by `mealPlanEntryId` +
 * `ingredientLineageId` (never by item, which can be a user-combined
 * group): unchanged contributions stay `ACTIVE`, changed ones are flagged
 * `CHANGED` with their prior value preserved for display, and disappeared
 * ones are flagged `REMOVED` rather than deleted — `GroceryListItem.
 * checkedAt` is never touched by this function, so an already-checked
 * item's checkmark survives every case (§81.4). A no-op for a list that
 * isn't an active `MEAL_PLAN_LINKED` list (already completed — §81.5's
 * freeze — or not found/not owned).
 */
/** Sync now (§81.2 UX correction) — lets the caller distinguish "changes
 * applied" from "already synchronized" instead of a single silent outcome.
 * Counts contributions, not items, since one item can carry several. */
export type GroceryListResyncSummary = {
  added: number;
  removed: number;
  changed: number;
};

const NO_RESYNC_CHANGES: GroceryListResyncSummary = {
  added: 0,
  removed: 0,
  changed: 0,
};

/**
 * Grocery-list resync reconciliation (manual-additions/deletions review
 * modal) — a caller-approved set of this list's own manual items/removal
 * tombstones to discard as part of *this* resync, rather than the default
 * "preserve everything" behavior. Applied only to the one list the user
 * actually reviewed (see `mealplans/service.ts#resyncLinkedLists`'s
 * `focusListId` handling) — every other list a Meal Plan mutation resyncs
 * keeps the unconditional-preserve default untouched.
 */
export type GroceryListResyncReconciliation = {
  discardManualItemIds?: string[];
  discardRemovedContributionIds?: string[];
};

export type GroceryListSyncReconciliationCandidate = {
  manualAdditions: {
    id: string;
    name: string;
    quantityText: string | null;
    unit: string | null;
  }[];
  manualDeletions: { id: string; name: string }[];
};

const NO_RECONCILIATION_CANDIDATES: GroceryListSyncReconciliationCandidate = {
  manualAdditions: [],
  manualDeletions: [],
};

/**
 * Read-only preview for the Sync-now review modal — the manually added
 * items and manually removed (tombstoned) generated items this resync would
 * otherwise silently preserve as-is. Only a tombstone whose lineage still
 * produces a fresh occurrence is included: one whose source has since
 * disappeared has nothing at stake this resync regardless of Keep/Discard.
 * A tombstone whose lineage has transitioned optional→required is also
 * excluded — §81.4's required-transition correction already overrides that
 * suppression unconditionally, so surfacing a Keep/Discard choice for it
 * would be misleading (Keep would not actually hold).
 */
export async function getGroceryListSyncReconciliationCandidates(
  ownerId: string,
  groceryListId: string,
  fresh: PendingMealPlanContribution[],
): Promise<GroceryListSyncReconciliationCandidate> {
  const list = await prisma.groceryList.findFirst({
    where: { id: groceryListId, ownerId, mode: "MEAL_PLAN_LINKED" },
  });
  if (!list) throw new NotFoundError("Grocery list not found.");
  if (list.completedAt != null) return NO_RECONCILIATION_CANDIDATES;

  const manualItems = await prisma.groceryListItem.findMany({
    where: { groceryListId, isManual: true },
    orderBy: { position: "asc" },
    select: { id: true, name: true, quantityText: true, unit: true },
  });

  const exclusions = await prisma.groceryListMealPlanEntryExclusion.findMany({
    where: { groceryListId },
    select: { mealPlanEntryId: true },
  });
  const excludedEntryIds = new Set(exclusions.map((e) => e.mealPlanEntryId));

  const tombstones = await prisma.groceryListRemovedContribution.findMany({
    where: { groceryListId },
  });
  const manualDeletions = computeReconciliationManualDeletions(
    fresh,
    excludedEntryIds,
    tombstones,
  );

  return { manualAdditions: manualItems, manualDeletions };
}

function toResyncContributionSnapshot(row: {
  id: string;
  groceryListItemId: string;
  mealPlanEntryId: string | null;
  ingredientLineageId: string | null;
  originalName: string;
  quantityDecimal: Prisma.Decimal | null;
  quantityText: string | null;
  unit: string | null;
  isOptional: boolean;
  selectedVariant: GroceryContributionVariant;
  substituteName: string | null;
  substituteQuantityDecimal: Prisma.Decimal | null;
  substituteQuantityText: string | null;
  substituteUnit: string | null;
  state: "ACTIVE" | "CHANGED" | "REMOVED";
  acknowledgedAt: Date | null;
}): ResyncContributionSnapshot {
  return {
    id: row.id,
    groceryListItemId: row.groceryListItemId,
    mealPlanEntryId: row.mealPlanEntryId,
    ingredientLineageId: row.ingredientLineageId,
    originalName: row.originalName,
    quantityDecimal: decimalToNumber(row.quantityDecimal),
    quantityText: row.quantityText,
    unit: row.unit,
    isOptional: row.isOptional,
    selectedVariant: row.selectedVariant,
    substituteName: row.substituteName,
    substituteQuantityDecimal: decimalToNumber(row.substituteQuantityDecimal),
    substituteQuantityText: row.substituteQuantityText,
    substituteUnit: row.substituteUnit,
    state: row.state,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}

/**
 * Runs `mealplan-resync-core.ts#computeMealPlanResyncPlan`'s decision
 * (shared with the offline path, `offline-mealplan-resync.ts`) against this
 * list's current rows, then applies the returned plan as Prisma writes.
 */
export async function resyncGroceryListFromMealPlan(
  tx: Prisma.TransactionClient,
  ownerId: string,
  groceryListId: string,
  /** Every linked list's resync diffs against the same live entry set within
   * one mutation — precompute with `collectMealPlanOccurrences` once in the
   * caller and pass the same result to each list, rather than re-walking
   * identical entries per list. */
  fresh: PendingMealPlanContribution[],
  /** Caller-approved discards from the Sync-now review modal — see
   * `GroceryListResyncReconciliation`. Omitted (the common case: every
   * automatic resync, and a manual Sync-now with nothing to review) keeps
   * the unconditional "preserve every manual addition/deletion" default. */
  reconciliation?: GroceryListResyncReconciliation,
): Promise<GroceryListResyncSummary> {
  const list = await tx.groceryList.findFirst({
    where: { id: groceryListId, ownerId, mode: "MEAL_PLAN_LINKED" },
  });
  if (!list || list.completedAt != null) return NO_RESYNC_CHANGES;

  if (reconciliation?.discardManualItemIds?.length) {
    await tx.groceryListItem.deleteMany({
      where: {
        id: { in: reconciliation.discardManualItemIds },
        groceryListId,
        isManual: true,
      },
    });
  }
  if (reconciliation?.discardRemovedContributionIds?.length) {
    // Deleting the tombstone before the diff below runs is what lets a
    // discarded deletion's generated item return in this same resync — the
    // "Added" loop finds no tombstone for the key and treats it as a fresh
    // occurrence, same as if it had never been removed.
    await tx.groceryListRemovedContribution.deleteMany({
      where: {
        id: { in: reconciliation.discardRemovedContributionIds },
        groceryListId,
      },
    });
  }

  const exclusions = await tx.groceryListMealPlanEntryExclusion.findMany({
    where: { groceryListId },
    select: { mealPlanEntryId: true },
  });
  const excludedEntryIds = new Set(exclusions.map((e) => e.mealPlanEntryId));

  const removedTombstones = await tx.groceryListRemovedContribution.findMany({
    where: { groceryListId },
    select: {
      id: true,
      mealPlanEntryId: true,
      ingredientLineageId: true,
      wasOptional: true,
    },
  });

  const existingContributionRows = await tx.groceryItemContribution.findMany({
    where: {
      groceryListItem: { groceryListId },
      mealPlanEntryId: { not: null },
    },
  });
  const existingContributions = existingContributionRows.map(
    toResyncContributionSnapshot,
  );
  const existingById = new Map(existingContributionRows.map((c) => [c.id, c]));

  const fallbackCategory = await getOwnedFallbackCategory(ownerId);
  const memories = await tx.ingredientCategoryMemory.findMany({
    where: { ownerId },
  });
  const categoryByNormalizedName = new Map(
    memories.map((m) => [m.normalizedIngredientName, m.groceryCategoryId]),
  );

  // Candidates: non-manual items and their non-`REMOVED` contributions —
  // combination targets for the plan's "Added" fold.
  const candidateItemRows = await tx.groceryListItem.findMany({
    where: { groceryListId, isManual: false },
    include: { contributions: true },
  });
  const candidateItems: ResyncCandidateItem[] = candidateItemRows.map(
    (item) => ({
      id: item.id,
      position: item.position,
      contributions: item.contributions
        .filter((c) => c.state !== "REMOVED")
        .map(toResyncContributionSnapshot),
    }),
  );

  const plan = computeMealPlanResyncPlan({
    fresh,
    excludedEntryIds,
    existingContributions,
    candidateItems,
    tombstones: removedTombstones,
    categoryByNormalizedName,
    fallbackCategoryId: fallbackCategory.id,
  });

  // Removed — flagged, never deleted (Correction 5).
  for (const id of plan.removedContributionIds) {
    const existing = existingById.get(id)!;
    await tx.groceryItemContribution.update({
      where: { id },
      data: {
        state: "REMOVED",
        previousQuantityDecimal: existing.quantityDecimal,
        previousQuantityText: existing.quantityText,
        previousUnit: existing.unit,
        acknowledgedAt: null,
      },
    });
  }

  // Unchanged/changed — see `computeMealPlanResyncPlan`'s doc comment for
  // the sticky-CHANGED reasoning behind `resetPreviousSnapshot`.
  for (const update of plan.updatedContributions) {
    const existing = existingById.get(update.id)!;
    await tx.groceryItemContribution.update({
      where: { id: update.id },
      data: {
        originalName: update.liveFields.originalName,
        quantityDecimal: update.liveFields.quantityDecimal,
        quantityText: update.liveFields.quantityText,
        unit: update.liveFields.unit,
        isOptional: update.liveFields.isOptional,
        selectedVariant: update.liveFields.selectedVariant,
        substituteIngredientLineageId:
          update.liveFields.substituteIngredientLineageId,
        substituteName: update.liveFields.substituteName,
        substituteQuantityDecimal: update.liveFields.substituteQuantityDecimal,
        substituteQuantityText: update.liveFields.substituteQuantityText,
        substituteUnit: update.liveFields.substituteUnit,
        state: update.nextState,
        ...(update.resetPreviousSnapshot
          ? {
              previousQuantityDecimal:
                update.nextState === "CHANGED"
                  ? existing.quantityDecimal
                  : null,
              previousQuantityText:
                update.nextState === "CHANGED" ? existing.quantityText : null,
              previousUnit:
                update.nextState === "CHANGED" ? existing.unit : null,
              acknowledgedAt:
                update.nextState === "CHANGED" ? null : existing.acknowledgedAt,
            }
          : {}),
      },
    });
  }

  // Revived tombstones — an optional-at-removal deletion that no longer
  // applies once its lineage becomes required (§81.4 required-transition
  // correction) is deleted, not just skipped, so it can't reapply later.
  if (plan.revivedTombstoneIds.length > 0) {
    await tx.groceryListRemovedContribution.deleteMany({
      where: { id: { in: plan.revivedTombstoneIds } },
    });
  }

  // Added — new items first (real ids resolve each placeholder), then
  // contributions folding into either a brand-new or a pre-existing item.
  const realIdByPlaceholder = new Map<string, string>();
  for (const newItem of plan.newItems) {
    const created = await tx.groceryListItem.create({
      data: {
        groceryListId,
        categoryId: newItem.categoryId,
        name: newItem.name,
        isOptional: newItem.isOptional,
        isManual: false,
        position: newItem.position,
      },
    });
    realIdByPlaceholder.set(newItem.placeholderItemId, created.id);
    await tx.groceryItemContribution.create({
      data: { groceryListItemId: created.id, ...newItem.contribution },
    });
  }
  for (const added of plan.addedContributionsToExistingItems) {
    const groceryListItemId =
      realIdByPlaceholder.get(added.groceryListItemId) ??
      added.groceryListItemId;
    await tx.groceryItemContribution.create({
      data: { groceryListItemId, ...added.contribution },
    });
  }

  for (const touchedId of plan.touchedItemIds) {
    const itemId = realIdByPlaceholder.get(touchedId) ?? touchedId;
    await recomputeMealPlanItemSync(tx, itemId);
  }

  // Every write above targets `GroceryListItem`/`GroceryItemContribution`
  // rows, never the `GroceryList` row itself — so without this, a
  // Meal-Plan-driven resync never bumps `GroceryList.updatedAt`, and
  // `GroceryListOfflineBoundary`'s `serverIsNewer` staleness check (see its
  // doc comment) can't tell this resync apart from "nothing happened",
  // leaving a dirty local replica (e.g. a checkbox toggle interrupted by a
  // hard navigation) masking the resync's own changes indefinitely.
  await tx.groceryList.update({ where: { id: groceryListId }, data: {} });

  return plan.summary;
}

/**
 * Marks a flagged (`CHANGED`/`REMOVED`) item as seen (§81.4's "the user
 * acknowledges the flag via `flagAcknowledgedAt`/`acknowledgedAt`") —
 * purely an acknowledgment, never a mutation of the underlying sync state
 * itself.
 */
export async function acknowledgeGroceryItemSync(
  ownerId: string,
  listId: string,
  itemId: string,
): Promise<void> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  const item = findOwnedItem(list, itemId);
  if (item.syncFlag === "UNCHANGED") return;

  const now = new Date();
  await prisma.$transaction([
    prisma.groceryListItem.update({
      where: { id: itemId },
      data: { flagAcknowledgedAt: now },
    }),
    prisma.groceryItemContribution.updateMany({
      where: {
        groceryListItemId: itemId,
        state: { in: ["CHANGED", "REMOVED"] },
        acknowledgedAt: null,
      },
      data: { acknowledgedAt: now },
    }),
  ]);
}
