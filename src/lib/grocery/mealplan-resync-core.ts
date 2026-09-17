import {
  canCombine,
  groupForCombination,
  normalizedIngredientName,
  type CombinableOccurrence,
} from "@/lib/grocery/combine";
import {
  formatGroceryQuantityText,
  type ResolvedIngredientOccurrence,
} from "@/lib/grocery/ingredient-gather-core";

/**
 * The pure, DB-agnostic core of Meal-Plan-linked Grocery List resync
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §4 follow-up) — extracted from
 * `list-service.ts#resyncGroceryListFromMealPlan`/`recomputeMealPlanItemSync`
 * so the SAME code computes the SAME plan online (Prisma-backed) and
 * offline (replica-backed), instead of two implementations that could
 * silently drift. Every decision this module makes (which contributions
 * flag REMOVED/CHANGED/ACTIVE, which fold into an existing item vs. start a
 * new one, which tombstones keep suppressing vs. get revived, each item's
 * recomputed display aggregate) lives here, once; the only thing each
 * caller supplies is I/O — fetching the current rows and applying the
 * returned plan as writes (Prisma transaction) or a replica patch
 * (IndexedDB).
 *
 * Deliberately excludes the reconciliation-modal discard step
 * (`GroceryListResyncReconciliation`): a caller-approved
 * `discardManualItemIds`/`discardRemovedContributionIds` is applied by
 * *removing* those rows before calling in here (both callers do this the
 * same way the original code did — delete first, then diff), not by
 * threading an extra parameter through the core.
 */

export type PendingMealPlanContribution = {
  mealPlanEntryId: string;
  occurrence: ResolvedIngredientOccurrence;
};

export type MealPlanContributionState = "ACTIVE" | "CHANGED" | "REMOVED";
export type MealPlanContributionVariant = "PRIMARY" | "SUBSTITUTE";

/** One `GroceryItemContribution` row's Meal-Plan-resync-relevant fields —
 * always the RAW primary/substitute snapshots (never the "effective,
 * currently-selected" values a display-only DTO field might carry), with
 * every `Prisma.Decimal` already converted to a plain number at each
 * caller's own I/O boundary. */
export type ResyncContributionSnapshot = {
  id: string;
  groceryListItemId: string;
  mealPlanEntryId: string | null;
  ingredientLineageId: string | null;
  originalName: string;
  quantityDecimal: number | null;
  quantityText: string | null;
  unit: string | null;
  isOptional: boolean;
  selectedVariant: MealPlanContributionVariant;
  substituteName: string | null;
  substituteQuantityDecimal: number | null;
  substituteQuantityText: string | null;
  substituteUnit: string | null;
  state: MealPlanContributionState;
  acknowledgedAt: string | null;
};

export type ResyncCandidateItem = {
  id: string;
  position: number;
  /** Already filtered to this item's own non-`REMOVED` contributions —
   * matches `resyncGroceryListFromMealPlan`'s own `candidateItems` fetch. */
  contributions: ResyncContributionSnapshot[];
};

export type ResyncTombstone = {
  id: string;
  mealPlanEntryId: string;
  ingredientLineageId: string;
  wasOptional: boolean;
};

export type MealPlanResyncInput = {
  fresh: PendingMealPlanContribution[];
  excludedEntryIds: Set<string>;
  /** Every Meal-Plan-sourced contribution in the list, any state, any item
   * — used to detect disappearance and to match existing occurrences. */
  existingContributions: ResyncContributionSnapshot[];
  /** Non-manual items only, for fold-into-existing-item combination
   * targeting — see `resyncGroceryListFromMealPlan`'s own `candidateItems`. */
  candidateItems: ResyncCandidateItem[];
  /** Already reflects any reconciliation-modal discard (see this module's
   * doc comment) — a discarded tombstone must be excluded before calling. */
  tombstones: ResyncTombstone[];
  categoryByNormalizedName: Map<string, string>;
  fallbackCategoryId: string;
};

export type NewContributionFields = {
  mealPlanEntryId: string;
  ingredientLineageId: string | null;
  originalName: string;
  quantityDecimal: number | null;
  quantityText: string | null;
  unit: string | null;
  isOptional: boolean;
  substituteIngredientLineageId: string | null;
  substituteName: string | null;
  substituteQuantityDecimal: number | null;
  substituteQuantityText: string | null;
  substituteUnit: string | null;
};

export type MealPlanResyncPlan = {
  /** Flag to `REMOVED` — the caller snapshots `previous*` from each row's
   * own current live values (already has them) and clears `acknowledgedAt`. */
  removedContributionIds: string[];
  updatedContributions: {
    id: string;
    groceryListItemId: string;
    liveFields: {
      originalName: string;
      quantityDecimal: number | null;
      quantityText: string | null;
      unit: string | null;
      isOptional: boolean;
      selectedVariant: MealPlanContributionVariant;
      substituteIngredientLineageId: string | null;
      substituteName: string | null;
      substituteQuantityDecimal: number | null;
      substituteQuantityText: string | null;
      substituteUnit: string | null;
    };
    nextState: "ACTIVE" | "CHANGED";
    /** `true`: caller records `previous* = ` this row's OLD live values
     * (already has them) and clears `acknowledgedAt`. `false`: a sticky
     * unacknowledged `CHANGED` contribution — leave `previous*`/
     * `acknowledgedAt` untouched, only the live fields above refresh. */
    resetPreviousSnapshot: boolean;
  }[];
  newItems: {
    placeholderItemId: string;
    categoryId: string;
    name: string;
    isOptional: boolean;
    position: number;
    contribution: NewContributionFields;
  }[];
  /** `groceryListItemId` may be a real existing item id, or a `newItems`
   * entry's own `placeholderItemId` from earlier in this same plan (a
   * second added occurrence folding into an item this same resync just
   * created — see `resyncGroceryListFromMealPlan`'s sequential fold). */
  addedContributionsToExistingItems: {
    groceryListItemId: string;
    contribution: NewContributionFields;
  }[];
  revivedTombstoneIds: string[];
  /** Real item ids and `newItems` placeholder ids alike — every item whose
   * aggregate needs `recomputeMealPlanItemAggregate` run against its final
   * contribution set. */
  touchedItemIds: string[];
  summary: { added: number; removed: number; changed: number };
};

export function mealPlanContributionKey(
  mealPlanEntryId: string,
  ingredientLineageId: string,
): string {
  return `${mealPlanEntryId}:${ingredientLineageId}`;
}

/**
 * The Sync-now review modal's manual-deletion candidates — shared by
 * `list-service.ts#getGroceryListSyncReconciliationCandidates` (online) and
 * its offline mirror. Only a tombstone whose lineage still produces a fresh
 * occurrence is a candidate at all; the §81.4 required-transition
 * correction excludes one whose lineage has since become required, exactly
 * like `computeMealPlanResyncPlan`'s own revive check.
 */
export function computeReconciliationManualDeletions(
  fresh: PendingMealPlanContribution[],
  excludedEntryIds: Set<string>,
  tombstones: ResyncTombstone[],
): { id: string; name: string }[] {
  const includedFresh = fresh.filter(
    (f) => !excludedEntryIds.has(f.mealPlanEntryId),
  );
  const freshByKey = new Map(
    includedFresh
      .filter((f) => f.occurrence.ingredientLineageId)
      .map((f) => [
        mealPlanContributionKey(
          f.mealPlanEntryId,
          f.occurrence.ingredientLineageId!,
        ),
        f,
      ]),
  );

  const manualDeletions: { id: string; name: string }[] = [];
  for (const tombstone of tombstones) {
    const freshEntry = freshByKey.get(
      mealPlanContributionKey(
        tombstone.mealPlanEntryId,
        tombstone.ingredientLineageId,
      ),
    );
    if (!freshEntry) continue;
    const becameRequired =
      tombstone.wasOptional && !freshEntry.occurrence.isOptional;
    if (becameRequired) continue;
    manualDeletions.push({
      id: tombstone.id,
      name: freshEntry.occurrence.originalName,
    });
  }
  return manualDeletions;
}

export function occurrenceToCombinable(
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

/** The contribution's currently-effective name/quantity/unit — mirrors
 * `list-service.ts`'s `effectiveContributionFields`, operating on plain
 * numbers. */
export function effectiveContributionFields(row: {
  selectedVariant: MealPlanContributionVariant;
  originalName: string;
  quantityDecimal: number | null;
  quantityText: string | null;
  unit: string | null;
  substituteName: string | null;
  substituteQuantityDecimal: number | null;
  substituteQuantityText: string | null;
  substituteUnit: string | null;
}): {
  name: string;
  quantityDecimal: number | null;
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

export function contributionToCombinable(
  row: ResyncContributionSnapshot,
): CombinableOccurrence {
  const effective = effectiveContributionFields(row);
  return {
    key: row.id,
    name: effective.name,
    quantity: effective.quantityDecimal,
    unit: effective.unit,
    displayText:
      effective.quantityDecimal == null ? effective.quantityText : null,
    isOptional: row.isOptional,
  };
}

/**
 * The decision core of `resyncGroceryListFromMealPlan` — computes exactly
 * which contributions/items change, with no I/O. Iteration order for
 * additions follows `input.fresh`'s own order (a `Map`'s insertion order),
 * matching the original sequential fold (a second added occurrence
 * combinable with a brand-new item this same resync just created joins it,
 * rather than starting a third item).
 */
export function computeMealPlanResyncPlan(
  input: MealPlanResyncInput,
): MealPlanResyncPlan {
  const includedFresh = input.fresh.filter(
    (f) => !input.excludedEntryIds.has(f.mealPlanEntryId),
  );

  const removedByKey = new Map(
    input.tombstones.map((t) => [
      mealPlanContributionKey(t.mealPlanEntryId, t.ingredientLineageId),
      t,
    ]),
  );

  const freshByKey = new Map(
    includedFresh
      .filter((f) => f.occurrence.ingredientLineageId)
      .map((f) => [
        mealPlanContributionKey(
          f.mealPlanEntryId,
          f.occurrence.ingredientLineageId!,
        ),
        f,
      ]),
  );

  const existingByKey = new Map(
    input.existingContributions
      .filter((c) => c.ingredientLineageId && c.mealPlanEntryId)
      .map((c) => [
        mealPlanContributionKey(c.mealPlanEntryId!, c.ingredientLineageId!),
        c,
      ]),
  );

  const touchedItemIds = new Set<string>();
  const summary = { added: 0, removed: 0, changed: 0 };

  // Removed — the plan no longer produces this ingredient occurrence.
  const removedContributionIds: string[] = [];
  for (const contribution of input.existingContributions) {
    const key =
      contribution.ingredientLineageId && contribution.mealPlanEntryId
        ? mealPlanContributionKey(
            contribution.mealPlanEntryId,
            contribution.ingredientLineageId,
          )
        : null;
    if (key && freshByKey.has(key)) continue;
    touchedItemIds.add(contribution.groceryListItemId);
    if (contribution.state === "REMOVED") continue;
    summary.removed++;
    removedContributionIds.push(contribution.id);
  }

  // Unchanged/changed — refresh the live snapshot in place.
  const updatedContributions: MealPlanResyncPlan["updatedContributions"] = [];
  for (const [key, freshEntry] of freshByKey) {
    const existing = existingByKey.get(key);
    if (!existing) continue;
    const occurrence = freshEntry.occurrence;
    const toQuantityText =
      occurrence.displayText ??
      formatGroceryQuantityText(
        occurrence.quantity,
        occurrence.quantityEnd,
        occurrence.isApproximate,
      );
    const substituteQuantityText = occurrence.substitute
      ? (occurrence.substitute.displayText ??
        formatGroceryQuantityText(
          occurrence.substitute.quantity,
          occurrence.substitute.quantityEnd,
          occurrence.substitute.isApproximate,
        ))
      : null;

    const differsFromStoredLive =
      existing.state === "REMOVED" ||
      existing.originalName !== occurrence.originalName ||
      existing.quantityText !== toQuantityText ||
      existing.unit !== occurrence.unit ||
      existing.isOptional !== occurrence.isOptional ||
      existing.substituteName !==
        (occurrence.substitute?.originalName ?? null) ||
      existing.substituteQuantityText !== substituteQuantityText ||
      existing.substituteUnit !== (occurrence.substitute?.unit ?? null);
    const stickyUnacknowledgedChange =
      existing.state === "CHANGED" && existing.acknowledgedAt === null;
    if (!stickyUnacknowledgedChange && differsFromStoredLive) summary.changed++;

    const nextVariant: MealPlanContributionVariant =
      existing.selectedVariant === "SUBSTITUTE" && !occurrence.substitute
        ? "PRIMARY"
        : existing.selectedVariant;

    updatedContributions.push({
      id: existing.id,
      groceryListItemId: existing.groceryListItemId,
      liveFields: {
        originalName: occurrence.originalName,
        quantityDecimal: occurrence.quantity,
        quantityText: toQuantityText,
        unit: occurrence.unit,
        isOptional: occurrence.isOptional,
        selectedVariant: nextVariant,
        substituteIngredientLineageId:
          occurrence.substitute?.ingredientLineageId ?? null,
        substituteName: occurrence.substitute?.originalName ?? null,
        substituteQuantityDecimal: occurrence.substitute?.quantity ?? null,
        substituteQuantityText,
        substituteUnit: occurrence.substitute?.unit ?? null,
      },
      nextState: stickyUnacknowledgedChange
        ? "CHANGED"
        : differsFromStoredLive
          ? "CHANGED"
          : "ACTIVE",
      resetPreviousSnapshot: !stickyUnacknowledgedChange,
    });
    touchedItemIds.add(existing.groceryListItemId);
  }

  // Added — fold into an existing combinable Meal-Plan-sourced item, else
  // start a new one. `candidateItems` is mutated locally as new items are
  // "created" (placeholder ids), exactly mirroring the original's
  // sequential in-memory `candidateItems.push`.
  const candidateItems: {
    id: string;
    position: number;
    contributions: ResyncContributionSnapshot[];
  }[] = input.candidateItems.map((c) => ({
    id: c.id,
    position: c.position,
    contributions: c.contributions,
  }));
  const newItems: MealPlanResyncPlan["newItems"] = [];
  const addedContributionsToExistingItems: MealPlanResyncPlan["addedContributionsToExistingItems"] =
    [];
  const revivedTombstoneIds: string[] = [];
  let newItemCounter = 0;

  for (const [key, freshEntry] of freshByKey) {
    if (existingByKey.has(key)) continue;
    const tombstone = removedByKey.get(key);
    if (tombstone) {
      const becameRequired =
        tombstone.wasOptional && !freshEntry.occurrence.isOptional;
      if (!becameRequired) continue;
      revivedTombstoneIds.push(tombstone.id);
    }
    const occurrence = freshEntry.occurrence;
    summary.added++;

    const contributionFields: NewContributionFields = {
      mealPlanEntryId: freshEntry.mealPlanEntryId,
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
      substituteIngredientLineageId:
        occurrence.substitute?.ingredientLineageId ?? null,
      substituteName: occurrence.substitute?.originalName ?? null,
      substituteQuantityDecimal: occurrence.substitute?.quantity ?? null,
      substituteQuantityText: occurrence.substitute
        ? (occurrence.substitute.displayText ??
          formatGroceryQuantityText(
            occurrence.substitute.quantity,
            occurrence.substitute.quantityEnd,
            occurrence.substitute.isApproximate,
          ))
        : null,
      substituteUnit: occurrence.substitute?.unit ?? null,
    };

    const combinable = candidateItems.find(
      (candidate) =>
        candidate.contributions[0] &&
        canCombine(
          contributionToCombinable(candidate.contributions[0]),
          occurrenceToCombinable("new", occurrence),
        ),
    );

    let targetItemId: string;
    if (combinable) {
      targetItemId = combinable.id;
      addedContributionsToExistingItems.push({
        groceryListItemId: targetItemId,
        contribution: contributionFields,
      });
    } else {
      const maxPosition = candidateItems.reduce(
        (max, c) => Math.max(max, c.position),
        -1,
      );
      const placeholderItemId = `new:${newItemCounter++}`;
      newItems.push({
        placeholderItemId,
        categoryId:
          input.categoryByNormalizedName.get(
            normalizedIngredientName(occurrence.originalName),
          ) ?? input.fallbackCategoryId,
        name: occurrence.originalName,
        isOptional: occurrence.isOptional,
        position: maxPosition + 1,
        contribution: contributionFields,
      });
      targetItemId = placeholderItemId;
      candidateItems.push({
        id: placeholderItemId,
        position: maxPosition + 1,
        contributions: [],
      });
    }

    // Placeholder synthetic row, just enough for a later occurrence's own
    // `combinable` lookup against `candidate.contributions[0]` above —
    // matches the original code re-reading its own just-`create`d row back
    // into `candidateItems` for the same reason.
    const target = candidateItems.find((c) => c.id === targetItemId)!;
    target.contributions = [
      {
        id: `${targetItemId}:pending`,
        groceryListItemId: targetItemId,
        mealPlanEntryId: contributionFields.mealPlanEntryId,
        ingredientLineageId: contributionFields.ingredientLineageId,
        originalName: contributionFields.originalName,
        quantityDecimal: contributionFields.quantityDecimal,
        quantityText: contributionFields.quantityText,
        unit: contributionFields.unit,
        isOptional: contributionFields.isOptional,
        selectedVariant: "PRIMARY",
        substituteName: contributionFields.substituteName,
        substituteQuantityDecimal: contributionFields.substituteQuantityDecimal,
        substituteQuantityText: contributionFields.substituteQuantityText,
        substituteUnit: contributionFields.substituteUnit,
        state: "ACTIVE",
        acknowledgedAt: null,
      },
    ];
    touchedItemIds.add(targetItemId);
  }

  return {
    removedContributionIds,
    updatedContributions,
    newItems,
    addedContributionsToExistingItems,
    revivedTombstoneIds,
    touchedItemIds: [...touchedItemIds],
    summary,
  };
}

export type ItemAggregateResult =
  | { kind: "removed" }
  | {
      kind: "updated";
      name: string;
      unit: string | null;
      quantityDecimal: number | null;
      quantityText: string | null;
      isOptional?: boolean;
      syncFlag: "UNCHANGED" | "CHANGED";
    };

/**
 * One `GroceryListItem`'s displayed aggregate/`syncFlag`, from its final
 * contribution set — mirrors `list-service.ts#recomputeMealPlanItemSync`'s
 * pure decision math exactly (never touches `checkedAt`, never deletes a
 * `REMOVED` contribution). `contributions` must be every contribution
 * currently on the item, any state, ordered stably (matches the original's
 * `orderBy: { id: "asc" }` — any caller-consistent stable order works,
 * since only `live[0]` is treated specially).
 */
export function recomputeMealPlanItemAggregate(
  contributions: ResyncContributionSnapshot[],
): ItemAggregateResult | null {
  if (contributions.length === 0) return null;

  const live = contributions.filter((c) => c.state !== "REMOVED");
  const anyRemoved = contributions.some((c) => c.state === "REMOVED");

  if (live.length === 0) {
    return { kind: "removed" };
  }

  const anyChanged = live.some((c) => c.state === "CHANGED");
  const syncFlag: "UNCHANGED" | "CHANGED" =
    anyChanged || anyRemoved ? "CHANGED" : "UNCHANGED";

  const first = live[0];
  const allCombinable = live
    .slice(1)
    .every((c) =>
      canCombine(contributionToCombinable(first), contributionToCombinable(c)),
    );

  if (allCombinable) {
    const group = groupForCombination(live.map(contributionToCombinable))[0];
    return {
      kind: "updated",
      name: group.name,
      unit: group.unit,
      quantityDecimal: group.totalQuantity,
      quantityText:
        group.totalQuantity != null
          ? formatGroceryQuantityText(group.totalQuantity, null, false)
          : live[0].quantityText,
      ...(live.length === 1 ? { isOptional: live[0].isOptional } : {}),
      syncFlag,
    };
  }

  const firstEffective = effectiveContributionFields(first);
  return {
    kind: "updated",
    name: firstEffective.name,
    unit: null,
    quantityDecimal: null,
    quantityText: live
      .map((c) => {
        const effective = effectiveContributionFields(c);
        return [effective.quantityText, effective.unit]
          .filter(Boolean)
          .join(" ");
      })
      .filter(Boolean)
      .join(" + "),
    syncFlag,
  };
}

export type { CombinableOccurrence };
