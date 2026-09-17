"use client";

import { getEntity } from "@/lib/offline/db";
import { generateClientId } from "@/lib/offline/ids";
import { computeTargetYieldScaleFactor } from "@/lib/units/scaling";
import {
  gatherIngredientSlotsOffline,
  resolveIngredientOccurrences,
} from "@/lib/grocery/offline-ingredient-gather";
import {
  computeMealPlanResyncPlan,
  computeReconciliationManualDeletions,
  recomputeMealPlanItemAggregate,
  effectiveContributionFields,
  type PendingMealPlanContribution,
  type ResyncContributionSnapshot,
  type ResyncCandidateItem,
  type MealPlanResyncPlan,
} from "@/lib/grocery/mealplan-resync-core";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { MealPlanSnapshotDoc } from "@/lib/offline-sync/mealplans";
import type { MealPlanEntryDto } from "@/lib/mealplans/schema";
import type {
  GroceryListDetailDto,
  GroceryListItemDto,
  GroceryContributionDto,
} from "@/lib/grocery/list-schema";
import type { GroceryListViewProps } from "@/lib/grocery/list-view";
import type {
  GroceryListResyncSummary,
  GroceryListSyncReconciliationCandidate,
} from "@/lib/grocery/list-service";

/**
 * Offline mirror of `mealplans/service.ts#collectMealPlanOccurrences` — same
 * shared `gatherIngredientSlotsOffline`/`resolveIngredientOccurrences`
 * ingredient-gathering path already used for offline source refresh, sourced
 * from the replica instead of Postgres. An entry whose Dish/Version isn't
 * replicated contributes nothing, silently, same as online's "source
 * permanently deleted" case — the caller decides whether an overall empty
 * result matters.
 */
export async function collectMealPlanOccurrencesOffline(
  entries: MealPlanEntryDto[],
): Promise<PendingMealPlanContribution[]> {
  const result: PendingMealPlanContribution[] = [];
  for (const entry of entries) {
    if (!entry.dishId || !entry.dishVersionId) continue;
    const dishRecord = await getEntity<DishSnapshotDoc>("dish", entry.dishId);
    const version = dishRecord?.doc.versions.find(
      (v) => v.id === entry.dishVersionId,
    );
    if (!version) continue;
    const scaleFactor = computeTargetYieldScaleFactor(
      entry.targetYieldQuantity,
      version.yieldQuantity,
    );
    const slots = await gatherIngredientSlotsOffline(
      entry.dishId,
      entry.dishVersionId,
    );
    if (!slots) continue;
    for (const occurrence of resolveIngredientOccurrences(slots, scaleFactor)) {
      result.push({ mealPlanEntryId: entry.id, occurrence });
    }
  }
  return result;
}

function contributionDtoToSnapshot(
  item: { id: string },
  c: GroceryContributionDto,
): ResyncContributionSnapshot {
  return {
    id: c.id,
    groceryListItemId: item.id,
    mealPlanEntryId: c.mealPlanEntryId,
    ingredientLineageId: c.ingredientLineageId,
    originalName: c.rawOriginalName,
    quantityDecimal: c.rawQuantityDecimal,
    quantityText: c.rawQuantityText,
    unit: c.rawUnit,
    isOptional: c.isOptional,
    selectedVariant: c.selectedVariant,
    substituteName: c.substituteOriginalName,
    substituteQuantityDecimal: c.substituteQuantityDecimal,
    substituteQuantityText: c.substituteQuantityText,
    substituteUnit: c.substituteUnit,
    state: c.syncState ?? "ACTIVE",
    acknowledgedAt: c.acknowledgedAt,
  };
}

async function readReplicas(
  mealPlanId: string,
  listId: string,
): Promise<{
  mealPlan: MealPlanSnapshotDoc;
  list: GroceryListDetailDto;
} | null> {
  const mealPlanRecord = await getEntity<MealPlanSnapshotDoc>(
    "mealPlan",
    mealPlanId,
  );
  const listRecord = await getEntity<GroceryListViewProps>(
    "groceryList",
    listId,
  );
  const list = listRecord?.doc.list;
  if (!mealPlanRecord || !list) return null;
  return { mealPlan: mealPlanRecord.doc, list };
}

/**
 * Offline mirror of `mealplans/service.ts#previewMealPlanGroceryListSync` —
 * same shared `computeReconciliationManualDeletions`
 * (`mealplan-resync-core.ts`) as the online path.
 */
export async function previewMealPlanGroceryListSyncOffline(
  mealPlanId: string,
  listId: string,
): Promise<GroceryListSyncReconciliationCandidate | { error: string }> {
  const replicas = await readReplicas(mealPlanId, listId);
  if (!replicas)
    return { error: "This grocery list isn't available offline yet." };
  const { mealPlan, list } = replicas;
  if (list.completedAt != null)
    return { manualAdditions: [], manualDeletions: [] };

  const fresh = await collectMealPlanOccurrencesOffline(mealPlan.entries);
  const excludedEntryIds = new Set(
    list.mealPlanEntries.filter((e) => !e.included).map((e) => e.id),
  );
  const manualDeletions = computeReconciliationManualDeletions(
    fresh,
    excludedEntryIds,
    list.removedContributions,
  );
  const manualAdditions = list.items
    .filter((i) => i.isManual)
    .map((i) => ({
      id: i.id,
      name: i.name,
      quantityText: i.quantityText,
      unit: i.unit,
    }));

  return { manualAdditions, manualDeletions };
}

export type MealPlanResyncOfflineResult =
  | {
      ok: true;
      summary: GroceryListResyncSummary;
      nextDoc: GroceryListViewProps;
    }
  | { ok: false; error: string };

/**
 * Offline mirror of `list-service.ts#resyncGroceryListFromMealPlan` — same
 * shared `computeMealPlanResyncPlan`/`recomputeMealPlanItemAggregate`
 * decision core as the online path, applied here as a replica patch instead
 * of Prisma writes. The caller writes `nextDoc` into the local replica
 * immediately (optimistic — docs/OFFLINE_IMPLEMENTATION_PLAN.md §4) and
 * queues the existing `mealplan.resyncGroceryLists` sync op so the real,
 * server-authoritative resync still runs once connectivity returns.
 *
 * One accepted fidelity gap: `IngredientCategoryMemory` isn't replicated, so
 * a newly-added item this resync creates always lands in this list's own
 * fallback category offline (never a remembered category) — corrected once
 * the queued mutation's real snapshot arrives.
 */
export async function resyncMealPlanGroceryListOffline(
  mealPlanId: string,
  listId: string,
  reconciliation?: {
    discardManualItemIds?: string[];
    discardRemovedContributionIds?: string[];
  },
): Promise<MealPlanResyncOfflineResult> {
  const listRecord = await getEntity<GroceryListViewProps>(
    "groceryList",
    listId,
  );
  const mealPlanRecord = await getEntity<MealPlanSnapshotDoc>(
    "mealPlan",
    mealPlanId,
  );
  if (!listRecord || !mealPlanRecord) {
    return {
      ok: false,
      error: "This grocery list isn't available offline yet.",
    };
  }
  const props = listRecord.doc;
  const list = props.list;
  if (list.completedAt != null) {
    return {
      ok: true,
      summary: { added: 0, removed: 0, changed: 0 },
      nextDoc: props,
    };
  }

  const discardManualItemIds = new Set(
    reconciliation?.discardManualItemIds ?? [],
  );
  const discardRemovedContributionIds = new Set(
    reconciliation?.discardRemovedContributionIds ?? [],
  );
  const items = list.items.filter((i) => !discardManualItemIds.has(i.id));
  const removedContributions = list.removedContributions.filter(
    (t) => !discardRemovedContributionIds.has(t.id),
  );

  const fresh = await collectMealPlanOccurrencesOffline(
    mealPlanRecord.doc.entries,
  );
  const excludedEntryIds = new Set(
    list.mealPlanEntries.filter((e) => !e.included).map((e) => e.id),
  );
  const existingContributions: ResyncContributionSnapshot[] = items.flatMap(
    (item) =>
      item.contributions
        .filter((c) => c.mealPlanEntryId != null)
        .map((c) => contributionDtoToSnapshot(item, c)),
  );
  const candidateItems: ResyncCandidateItem[] = items
    .filter((i) => !i.isManual)
    .map((item) => ({
      id: item.id,
      position: item.position,
      contributions: item.contributions
        .filter((c) => c.syncState !== "REMOVED")
        .map((c) => contributionDtoToSnapshot(item, c)),
    }));
  const fallbackCategory =
    props.categoryOptions.find((c) => c.isFallback) ?? props.categoryOptions[0];

  const plan = computeMealPlanResyncPlan({
    fresh,
    excludedEntryIds,
    existingContributions,
    candidateItems,
    tombstones: removedContributions,
    // Not replicated — see this function's doc comment.
    categoryByNormalizedName: new Map(),
    fallbackCategoryId: fallbackCategory?.id ?? "",
  });

  const nextItems = applyPlanToItems(
    items,
    plan,
    mealPlanRecord.doc,
    fallbackCategory ?? null,
  );
  const nextList: GroceryListDetailDto = {
    ...list,
    items: nextItems,
    removedContributions: removedContributions.filter(
      (t) => !plan.revivedTombstoneIds.includes(t.id),
    ),
  };

  return {
    ok: true,
    summary: plan.summary,
    nextDoc: { ...props, list: nextList },
  };
}

function applyPlanToItems(
  items: GroceryListItemDto[],
  plan: MealPlanResyncPlan,
  mealPlan: MealPlanSnapshotDoc,
  fallbackCategory: GroceryListViewProps["categoryOptions"][number] | null,
): GroceryListItemDto[] {
  const byId = new Map(
    items.map((item) => [
      item.id,
      { ...item, contributions: [...item.contributions] },
    ]),
  );
  const now = new Date().toISOString();

  for (const id of plan.removedContributionIds) {
    for (const item of byId.values()) {
      const index = item.contributions.findIndex((c) => c.id === id);
      if (index === -1) continue;
      const c = item.contributions[index];
      item.contributions[index] = {
        ...c,
        syncState: "REMOVED",
        previousQuantityText: c.rawQuantityText,
        acknowledgedAt: null,
      };
    }
  }

  for (const update of plan.updatedContributions) {
    for (const item of byId.values()) {
      const index = item.contributions.findIndex((c) => c.id === update.id);
      if (index === -1) continue;
      const c = item.contributions[index];
      const effective = effectiveContributionFields(update.liveFields);
      const resetActive =
        update.resetPreviousSnapshot && update.nextState === "ACTIVE";
      const resetChanged =
        update.resetPreviousSnapshot && update.nextState === "CHANGED";
      item.contributions[index] = {
        ...c,
        originalName: effective.name,
        quantityDecimal: effective.quantityDecimal,
        quantityText: effective.quantityText,
        unit: effective.unit,
        isOptional: update.liveFields.isOptional,
        hasSubstitute: update.liveFields.substituteName != null,
        selectedVariant: update.liveFields.selectedVariant,
        rawOriginalName: update.liveFields.originalName,
        rawQuantityDecimal: update.liveFields.quantityDecimal,
        rawQuantityText: update.liveFields.quantityText,
        rawUnit: update.liveFields.unit,
        substituteOriginalName: update.liveFields.substituteName,
        substituteQuantityDecimal: update.liveFields.substituteQuantityDecimal,
        substituteQuantityText: update.liveFields.substituteQuantityText,
        substituteUnit: update.liveFields.substituteUnit,
        syncState: update.nextState,
        // Matches `resyncGroceryListFromMealPlan`'s own `previousQuantityText:
        // existing.quantityText` — always the RAW primary snapshot, even when
        // `SUBSTITUTE` was the currently-effective/displayed value.
        previousQuantityText: resetChanged
          ? c.rawQuantityText
          : resetActive
            ? null
            : c.previousQuantityText,
        acknowledgedAt: resetChanged ? null : c.acknowledgedAt,
      };
    }
  }

  const placeholderToRealId = new Map<string, string>();
  for (const newItem of plan.newItems) {
    const realId = generateClientId();
    placeholderToRealId.set(newItem.placeholderItemId, realId);
    const entry = mealPlan.entries.find(
      (e) => e.id === newItem.contribution.mealPlanEntryId,
    );
    const contribution: GroceryContributionDto = {
      id: generateClientId(),
      groceryListSourceId: null,
      ingredientLineageId: newItem.contribution.ingredientLineageId,
      originalName: newItem.contribution.originalName,
      quantityText: newItem.contribution.quantityText,
      quantityDecimal: newItem.contribution.quantityDecimal,
      unit: newItem.contribution.unit,
      isOptional: newItem.contribution.isOptional,
      hasSubstitute: newItem.contribution.substituteName != null,
      selectedVariant: "PRIMARY",
      syncState: "ACTIVE",
      previousQuantityText: null,
      sourceTitle: entry?.title ?? null,
      mealPlanEntryId: newItem.contribution.mealPlanEntryId,
      rawOriginalName: newItem.contribution.originalName,
      rawQuantityDecimal: newItem.contribution.quantityDecimal,
      rawQuantityText: newItem.contribution.quantityText,
      rawUnit: newItem.contribution.unit,
      substituteOriginalName: newItem.contribution.substituteName,
      substituteQuantityDecimal: newItem.contribution.substituteQuantityDecimal,
      substituteQuantityText: newItem.contribution.substituteQuantityText,
      substituteUnit: newItem.contribution.substituteUnit,
      acknowledgedAt: null,
    };
    byId.set(realId, {
      id: realId,
      name: newItem.name,
      quantityText: contribution.quantityText,
      unit: contribution.unit,
      isOptional: newItem.isOptional,
      isManual: false,
      checkedAt: null,
      position: newItem.position,
      category: fallbackCategory
        ? {
            id: fallbackCategory.id,
            displayName: fallbackCategory.displayName,
            isFallback: true,
          }
        : null,
      contributions: [contribution],
      syncFlag: "UNCHANGED",
      flagAcknowledgedAt: null,
      updatedAt: now,
    });
  }

  for (const added of plan.addedContributionsToExistingItems) {
    const realId =
      placeholderToRealId.get(added.groceryListItemId) ??
      added.groceryListItemId;
    const item = byId.get(realId);
    if (!item) continue;
    const entry = mealPlan.entries.find(
      (e) => e.id === added.contribution.mealPlanEntryId,
    );
    item.contributions.push({
      id: generateClientId(),
      groceryListSourceId: null,
      ingredientLineageId: added.contribution.ingredientLineageId,
      originalName: added.contribution.originalName,
      quantityText: added.contribution.quantityText,
      quantityDecimal: added.contribution.quantityDecimal,
      unit: added.contribution.unit,
      isOptional: added.contribution.isOptional,
      hasSubstitute: added.contribution.substituteName != null,
      selectedVariant: "PRIMARY",
      syncState: "ACTIVE",
      previousQuantityText: null,
      sourceTitle: entry?.title ?? null,
      mealPlanEntryId: added.contribution.mealPlanEntryId,
      rawOriginalName: added.contribution.originalName,
      rawQuantityDecimal: added.contribution.quantityDecimal,
      rawQuantityText: added.contribution.quantityText,
      rawUnit: added.contribution.unit,
      substituteOriginalName: added.contribution.substituteName,
      substituteQuantityDecimal: added.contribution.substituteQuantityDecimal,
      substituteQuantityText: added.contribution.substituteQuantityText,
      substituteUnit: added.contribution.substituteUnit,
      acknowledgedAt: null,
    });
  }

  for (const touchedId of plan.touchedItemIds) {
    const realId = placeholderToRealId.get(touchedId) ?? touchedId;
    const item = byId.get(realId);
    if (!item) continue;
    const result = recomputeMealPlanItemAggregate(
      item.contributions.map((c) => contributionDtoToSnapshot(item, c)),
    );
    if (!result) continue;
    if (result.kind === "removed") {
      item.syncFlag = "REMOVED";
      item.flagAcknowledgedAt = null;
      continue;
    }
    item.name = result.name;
    item.unit = result.unit;
    item.quantityText = result.quantityText;
    if (result.isOptional !== undefined) item.isOptional = result.isOptional;
    item.syncFlag = result.syncFlag;
    item.flagAcknowledgedAt = null;
  }

  return [...byId.values()];
}
