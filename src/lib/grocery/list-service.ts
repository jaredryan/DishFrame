import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { formatCalculatedQuantity } from "@/lib/units/scaling";
import { normalizeName } from "@/lib/account/defaults";
import { versionLabel } from "@/lib/dishes/version-note";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import {
  gatherIngredientSlots,
  resolveIngredientOccurrences,
  type ResolvedIngredientOccurrence,
  type ResolvedSubstituteSnapshot,
} from "@/lib/grocery/ingredient-gather";
import {
  canCombine,
  groupForCombination,
  normalizedIngredientName,
  type CombinableOccurrence,
} from "@/lib/grocery/combine";
import {
  getOwnedGroceryListOrThrow,
  type OwnedGroceryList,
} from "@/lib/grocery/queries";

/**
 * Standalone grocery-list generation and management (PRODUCT_SPEC.md
 * §60-64, Build Plan Slice 12). `MEAL_PLAN_LINKED` mode/synchronization is
 * Slice 15 — every list this module writes is `STANDALONE` (the schema
 * default).
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

/** §52.7-style calculated-quantity display — every grocery quantity is
 * inherently a computed value (possibly summed across sources), never the
 * single-source "authored" line a Recipe/Part detail view renders. */
function formatGroceryQuantityText(
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

/** Slice 12 correction: the persisted substitute-snapshot columns for one
 * `GroceryItemContribution`, from a `ResolvedSubstituteSnapshot` (or cleared
 * to null when the ingredient has no substitute, or no longer does after a
 * refresh). */
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
  /** 1 = the source's authored amount, unscaled (§60.2). */
  scaleFactor: number;
};

export type GenerateGroceryListInput = {
  title: string;
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
): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new ValidationError("Enter a title for this grocery list.");
  if (input.sources.length === 0) {
    throw new ValidationError("Select at least one Recipe or Part.");
  }

  const resolvedSources = await Promise.all(
    input.sources.map(async (source) => {
      if (!Number.isFinite(source.scaleFactor) || source.scaleFactor <= 0) {
        throw new ValidationError(
          "Each source's amount must be a positive number.",
        );
      }
      const dish = await getOwnedDishOrThrow(ownerId, source.dishId);
      if (!dish.currentVersionId) {
        throw new ValidationError(
          `"${dish.currentTitle ?? "Untitled"}" has no saved content to generate from.`,
        );
      }
      const version = await prisma.dishVersion.findFirstOrThrow({
        where: { id: dish.currentVersionId },
        select: { majorVersion: true, minorVersion: true },
      });
      const slots = await gatherIngredientSlots(ownerId, dish.currentVersionId);
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
    const list = await tx.groceryList.create({ data: { ownerId, title } });

    const pending: PendingContribution[] = [];
    for (const resolved of resolvedSources) {
      const sourceRow = await tx.groceryListSource.create({
        data: {
          groceryListId: list.id,
          dishId: resolved.dish.id,
          dishVersionId: resolved.dish.currentVersionId!,
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
  members: PendingContribution[],
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
};

function contributionToCombinable(row: ContributionRow): CombinableOccurrence {
  const quantity = decimalToNumber(row.quantityDecimal);
  return {
    key: row.id,
    name: row.originalName,
    quantity,
    unit: row.unit,
    // A contribution has no separate free-text column — a quantity-less row
    // carrying its own quantityText (e.g. "to taste") is exactly §10.7's
    // free-text case.
    displayText: quantity == null ? row.quantityText : null,
    isOptional: row.isOptional,
  };
}

/**
 * Recomputes one `GroceryListItem`'s own displayed name/quantity/unit from
 * its current set of contributions (after a refresh, manual merge, or
 * uncombine leaves it with a different contribution set than it was
 * generated with). Leaves the item's `isOptional` flag alone when it still
 * has more than one contribution — a manually-merged group's mixed
 * optionality (Slice 12 correction: manual merge across differing
 * optionality is allowed) has no single honest boolean to recompute, so the
 * merge/refresh call site's own explicit choice stands. When exactly one
 * contribution remains (e.g. after uncombine), that contribution's own
 * persisted `isOptional` is unambiguous and is restored here.
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
  await tx.groceryListItem.update({
    where: { id: itemId },
    data: {
      name: first.originalName,
      unit: null,
      quantityDecimal: null,
      quantityText: contributions
        .map((c) => [c.quantityText, c.unit].filter(Boolean).join(" "))
        .filter(Boolean)
        .join(" + "),
    },
  });
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

/** §62.1: the user may remove an (optional or any other) item before or
 * after generation — after generation is this action. */
export async function removeGroceryItem(
  ownerId: string,
  listId: string,
  itemId: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  findOwnedItem(list, itemId);
  await prisma.groceryListItem.delete({ where: { id: itemId } });
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
// Combine / uncombine (§61.3-§61.5)
// ---------------------------------------------------------------------------

/** Manual merge (§61.5) — the user deliberately combines two or more items
 * DishFrame's conservative auto-combination did not. All of `itemIds`'
 * contributions move onto the first item; the rest are deleted. */
export async function combineGroceryItems(
  ownerId: string,
  listId: string,
  itemIds: string[],
) {
  if (itemIds.length < 2) {
    throw new ValidationError("Select at least two items to combine.");
  }
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const items = itemIds.map((id) => findOwnedItem(list, id));

  const [target, ...rest] = items;
  const mergedIsOptional = items.every((i) => i.isOptional);

  await prisma.$transaction(async (tx) => {
    for (const source of rest) {
      await tx.groceryItemContribution.updateMany({
        where: { groceryListItemId: source.id },
        data: { groceryListItemId: target.id },
      });
      // A manual (contribution-less) item merging into another simply
      // disappears — its own name/quantity has nothing left to represent
      // once it has no contributions and isn't the retained target.
      await tx.groceryListItem.delete({ where: { id: source.id } });
    }
    await tx.groceryListItem.update({
      where: { id: target.id },
      data: { isOptional: mergedIsOptional },
    });
    await recomputeItemAggregate(tx, target.id);
  });
}

/**
 * Uncombine (§61.4) — fully reverses combination, giving every one of a
 * combined item's contributions back its own `GroceryListItem` (the exact
 * "keep separate" outcome the Build Plan pairs this control with). A pure
 * re-parenting of existing `GroceryItemContribution` rows, never a
 * destructive rebuild (Arch §D.11) — a correction/inspection tool, not a
 * general splitter, so it throws on an item with fewer than two
 * contributions (nothing to split) or a manual item (no contributions at
 * all). Slice 12 correction: each split-off item's `isOptional` is restored
 * from that contribution's own persisted flag, not the (possibly
 * manually-merged, mixed-optionality) combined item's aggregate value — this
 * is what keeps a manual merge across differing optionality truthfully
 * reversible.
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

// ---------------------------------------------------------------------------
// Substitute switching (§62.2 — "while editing the generated list")
// ---------------------------------------------------------------------------

/**
 * Switches a single-contribution item from its generated primary ingredient
 * to that same contribution's saved substitute (§11.5/§62.2 — DishFrame
 * never shows both). Slice 12 correction: uses the contribution's own
 * durable substitute snapshot (persisted at generation/refresh time,
 * `substituteSnapshotFields`) rather than re-walking the source Version —
 * this keeps switching available even after the source Dish is edited, a
 * newer Version is created, or the source is permanently deleted (§60.6),
 * since none of those touch an already-generated list's stored snapshot.
 * Requires the item to have no other contributions, since a combined item's
 * contributions could stop being mutually combinable once one of them
 * changes identity/name — the user uncombines first in that case (§61.4
 * already exists for exactly this). Switching consumes the snapshot (clears
 * the substitute* columns): there is no saved "substitute of the substitute"
 * to switch to next.
 */
export async function switchGroceryItemToSubstitute(
  ownerId: string,
  listId: string,
  itemId: string,
) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const item = findOwnedItem(list, itemId);
  if (item.contributions.length !== 1) {
    throw new ValidationError(
      "Uncombine this item first to switch just one contribution to its substitute.",
    );
  }
  const contribution = item.contributions[0];
  if (!contribution.substituteIngredientLineageId) {
    throw new ValidationError("This item has no saved substitute.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.groceryItemContribution.update({
      where: { id: contribution.id },
      data: {
        ingredientLineageId: contribution.substituteIngredientLineageId,
        originalName: contribution.substituteName!,
        quantityDecimal: contribution.substituteQuantityDecimal,
        quantityText: contribution.substituteQuantityText,
        unit: contribution.substituteUnit,
        ...substituteSnapshotFields(null),
      },
    });
    await recomputeItemAggregate(tx, itemId);
  });
}

// ---------------------------------------------------------------------------
// Source refresh (§60.4/§60.5)
// ---------------------------------------------------------------------------

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

function diffOccurrences(
  existing: {
    ingredientLineageId: string | null;
    originalName: string;
    quantityText: string | null;
  }[],
  fresh: ResolvedIngredientOccurrence[],
) {
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
): Promise<void> {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);
  assertListActive(list);
  const source = list.sources.find((s) => s.id === sourceId);
  if (!source) throw new NotFoundError("Grocery list source not found.");

  const { targetVersion } = await resolveRefreshTarget(
    ownerId,
    source,
    targetVersionId,
  );
  const scaleFactor = decimalToNumber(source.scaleFactor) ?? 1;
  const slots = await gatherIngredientSlots(ownerId, targetVersion.id);
  const fresh = resolveIngredientOccurrences(slots, scaleFactor);
  const freshByLineage = new Map(
    fresh
      .filter((f) => f.ingredientLineageId)
      .map((f) => [f.ingredientLineageId, f]),
  );

  const existingContributions = await prisma.groceryItemContribution.findMany({
    where: { groceryListSourceId: sourceId },
  });
  const existingByLineage = new Map(
    existingContributions
      .filter((c) => c.ingredientLineageId)
      .map((c) => [c.ingredientLineageId!, c]),
  );

  await prisma.$transaction(async (tx) => {
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
          // §60.4/§60.5 refresh must update the substitute snapshot too: add
          // a newly-available substitute, replace a changed one, or clear it
          // when the selected target Version no longer has one.
          ...substituteSnapshotFields(occurrence.substitute),
        },
      });
      await recomputeItemAggregate(tx, existing.groceryListItemId);
    }

    // Added — fold into an existing combinable item, else create a new one
    const fallbackCategory = await getOwnedFallbackCategory(ownerId);
    const memories = await tx.ingredientCategoryMemory.findMany({
      where: { ownerId },
    });
    const categoryByNormalizedName = new Map(
      memories.map((m) => [m.normalizedIngredientName, m.groceryCategoryId]),
    );
    for (const [lineageId, occurrence] of freshByLineage) {
      if (existingByLineage.has(lineageId)) continue;

      const candidateItems = await tx.groceryListItem.findMany({
        where: { groceryListId: listId },
        include: { contributions: { take: 1 } },
      });
      const combinable = candidateItems.find(
        (candidate) =>
          candidate.contributions[0] &&
          canCombine(
            contributionToCombinable(candidate.contributions[0]),
            toCombinable("new", occurrence),
          ),
      );

      const maxPosition = await tx.groceryListItem.aggregate({
        where: { groceryListId: listId },
        _max: { position: true },
      });
      const targetItemId =
        combinable?.id ??
        (
          await tx.groceryListItem.create({
            data: {
              groceryListId: listId,
              categoryId:
                categoryByNormalizedName.get(
                  normalizedIngredientName(occurrence.originalName),
                ) ?? fallbackCategory.id,
              name: occurrence.originalName,
              isOptional: occurrence.isOptional,
              isManual: false,
              position: (maxPosition._max.position ?? -1) + 1,
            },
          })
        ).id;

      await tx.groceryItemContribution.create({
        data: {
          groceryListItemId: targetItemId,
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
      await recomputeItemAggregate(tx, targetItemId);
    }

    await tx.groceryListSource.update({
      where: { id: sourceId },
      data: {
        dishVersionId: targetVersion.id,
        sourceDishVersionLabelSnapshot: versionLabel(
          targetVersion.majorVersion,
          targetVersion.minorVersion,
        ),
      },
    });
  });
}

// ---------------------------------------------------------------------------
// List lifecycle (§64)
// ---------------------------------------------------------------------------

export async function renameGroceryList(
  ownerId: string,
  listId: string,
  title: string,
) {
  const trimmed = title.trim();
  if (!trimmed)
    throw new ValidationError("Enter a title for this grocery list.");
  await getOwnedGroceryListOrThrow(ownerId, listId);
  return prisma.groceryList.update({
    where: { id: listId },
    data: { title: trimmed },
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
export async function duplicateGroceryList(ownerId: string, listId: string) {
  const list = await getOwnedGroceryListOrThrow(ownerId, listId);

  return prisma.$transaction(async (tx) => {
    const copy = await tx.groceryList.create({
      data: { ownerId, title: `${list.title} (copy)` },
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
          },
        });
      }
    }

    return copy.id;
  });
}
