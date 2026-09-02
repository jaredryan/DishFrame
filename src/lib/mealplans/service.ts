import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel } from "@/lib/dishes/version-note";
import { getOwnedDishOrThrow } from "@/lib/dishes/queries";
import {
  getOwnedDishVersionOrThrow,
  buildCookableUnits,
} from "@/lib/cooking/queries";
import { startCookingSession } from "@/lib/cooking/service";
import { computeTargetYieldScaleFactor } from "@/lib/units/scaling";
import {
  generateGroceryListFromMealPlan as generateGroceryListFromMealPlanService,
  resyncGroceryListFromMealPlan,
  collectMealPlanOccurrences,
  setGroceryListMealPlanEntryExclusion,
  type MealPlanContributionEntry,
  type GroceryListResyncSummary,
} from "@/lib/grocery/list-service";
import {
  getOwnedMealPlanOrThrow,
  type OwnedMealPlan,
  type OwnedMealPlanEntry,
} from "@/lib/mealplans/queries";
import type { EntryStatusValue } from "@/lib/mealplans/schema";

/**
 * Meal Plan domain functions (BUILD_PLAN.md Slice 15,
 * ARCHITECTURE_PROPOSAL.md §I). Framework-agnostic, same shape as every
 * other `service.ts` in this codebase (§K.4).
 */

function findOwnedEntry(
  mealPlan: OwnedMealPlan,
  entryId: string,
): OwnedMealPlanEntry {
  const entry = mealPlan.entries.find((e) => e.id === entryId);
  if (!entry) throw new NotFoundError("Meal Plan entry not found.");
  return entry;
}

function toContributionEntry(
  entry: Pick<
    OwnedMealPlanEntry,
    "id" | "dishId" | "dishVersionId" | "targetYieldQuantity"
  >,
): MealPlanContributionEntry {
  return {
    id: entry.id,
    dishId: entry.dishId,
    dishVersionId: entry.dishVersionId,
    targetYieldQuantity: entry.targetYieldQuantity,
  };
}

/**
 * Runs the resync step (Arch §I's "Sync a Meal-Plan-linked grocery list" —
 * one transaction per mutation, resync inside it) against every active
 * linked list for this Meal Plan, using `freshEntries` as the live source
 * of truth. Callers pass the entry set *as it will exist after* their own
 * mutation — see `removeMealPlanEntry` for why deletion order matters here.
 */
async function resyncLinkedLists(
  tx: Prisma.TransactionClient,
  ownerId: string,
  mealPlanId: string,
  freshEntries: MealPlanContributionEntry[],
): Promise<Map<string, GroceryListResyncSummary>> {
  const summaries = new Map<string, GroceryListResyncSummary>();
  const lists = await tx.groceryList.findMany({
    where: { linkedMealPlanId: mealPlanId, completedAt: null },
    select: { id: true },
  });
  if (lists.length === 0) return summaries;

  // Computed once and reused across every linked list — every list resyncs
  // against the same live entry set within this one mutation, so there's no
  // reason for each to independently re-walk identical entries' ingredient
  // trees.
  const fresh = await collectMealPlanOccurrences(ownerId, freshEntries);
  for (const list of lists) {
    const summary = await resyncGroceryListFromMealPlan(
      tx,
      ownerId,
      list.id,
      fresh,
    );
    summaries.set(list.id, summary);
  }
  return summaries;
}

export type MealPlanEntryForGrocerySelection = {
  id: string;
  title: string;
  cookDate: string;
};

/**
 * A Meal Plan's own entries, for the New-grocery-list modal's `Meal plan`
 * basis (§8) — fetched on demand once a plan is picked from the search
 * results, rather than upfront for every candidate.
 */
export async function getMealPlanEntriesForGrocerySelection(
  ownerId: string,
  mealPlanId: string,
): Promise<MealPlanEntryForGrocerySelection[]> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  return mealPlan.entries.map((entry) => ({
    id: entry.id,
    title: entry.sourceDishTitleSnapshot,
    cookDate: entry.cookDate.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Meal Plan CRUD (§76.1, §78)
// ---------------------------------------------------------------------------

export type CreateMealPlanInput = {
  title: string;
  startDate: Date;
  endDate: Date;
  notes?: string | null;
};

export async function createMealPlan(
  ownerId: string,
  input: CreateMealPlanInput,
): Promise<string> {
  if (input.endDate < input.startDate) {
    throw new ValidationError(
      "The end date must be on or after the start date.",
    );
  }
  const mealPlan = await prisma.mealPlan.create({
    data: {
      ownerId,
      title: input.title.trim(),
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes?.trim() || null,
    },
  });
  return mealPlan.id;
}

export type UpdateMealPlanInput = {
  title?: string;
  startDate?: Date;
  endDate?: Date;
  notes?: string | null;
};

export async function updateMealPlan(
  ownerId: string,
  mealPlanId: string,
  input: UpdateMealPlanInput,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  const startDate = input.startDate ?? mealPlan.startDate;
  const endDate = input.endDate ?? mealPlan.endDate;
  if (endDate < startDate) {
    throw new ValidationError(
      "The end date must be on or after the start date.",
    );
  }
  await prisma.mealPlan.update({
    where: { id: mealPlanId },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.startDate !== undefined ? { startDate } : {}),
      ...(input.endDate !== undefined ? { endDate } : {}),
      ...(input.notes !== undefined
        ? { notes: input.notes?.trim() || null }
        : {}),
    },
  });
}

/**
 * §78: "duplicate into a new date range." Copies every entry and planned
 * meal, shifting each date by the difference between the old and new start
 * dates so relative day offsets within the plan are preserved. The copy
 * starts fully independent — no linked grocery list, every entry reset to
 * `PLANNED` with no linked Cooking Session (a session belongs to the
 * original entry's actual cooking event, not a hypothetical future one).
 */
export async function duplicateMealPlan(
  ownerId: string,
  mealPlanId: string,
  input: { title: string; startDate: Date; endDate: Date },
): Promise<string> {
  const source = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  if (input.endDate < input.startDate) {
    throw new ValidationError(
      "The end date must be on or after the start date.",
    );
  }
  const dayOffsetMs = input.startDate.getTime() - source.startDate.getTime();

  return prisma.$transaction(async (tx) => {
    const copy = await tx.mealPlan.create({
      data: {
        ownerId,
        title: input.title.trim(),
        startDate: input.startDate,
        endDate: input.endDate,
        notes: source.notes,
      },
    });

    for (const entry of source.entries) {
      const copiedEntry = await tx.mealPlanEntry.create({
        data: {
          mealPlanId: copy.id,
          dishId: entry.dishId,
          dishVersionId: entry.dishVersionId,
          cookDate: new Date(entry.cookDate.getTime() + dayOffsetMs),
          targetYieldQuantity: entry.targetYieldQuantity,
          targetYieldUnit: entry.targetYieldUnit,
          note: entry.note,
          sourceDishTitleSnapshot: entry.sourceDishTitleSnapshot,
          sourceDishKindSnapshot: entry.sourceDishKindSnapshot,
          sourceDishVersionLabelSnapshot: entry.sourceDishVersionLabelSnapshot,
        },
      });
      for (const meal of entry.plannedMeals) {
        // §13/§78: "Reuse for new dates" starts a fresh plan — the copy
        // preserves the source's user-defined day order but never its
        // eaten state (defaults to unchecked), since nothing has actually
        // been eaten against these new dates yet.
        await tx.plannedMeal.create({
          data: {
            entryId: copiedEntry.id,
            label: meal.label,
            date: new Date(meal.date.getTime() + dayOffsetMs),
            servings: meal.servings,
            sortOrder: meal.sortOrder,
          },
        });
      }
    }

    return copy.id;
  });
}

/**
 * Round-3 Correction 2 (Arch §I) — must, in one transaction, first convert
 * every linked `GroceryList` to `STANDALONE` (mode + `linkedMealPlanId`
 * cleared in the same statement), *then* delete the `MealPlan` row.
 * `GroceryList.linkedMealPlan` is `onDelete: Restrict`, so the database
 * physically refuses the Meal Plan delete until step one has actually run —
 * getting this backwards fails loudly with a foreign-key violation rather
 * than silently corrupting a list's mode.
 */
export async function deleteMealPlan(
  ownerId: string,
  mealPlanId: string,
): Promise<void> {
  await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  await prisma.$transaction(async (tx) => {
    await tx.groceryList.updateMany({
      where: { linkedMealPlanId: mealPlanId },
      data: { mode: "STANDALONE", linkedMealPlanId: null },
    });
    await tx.mealPlan.delete({ where: { id: mealPlanId } });
  });
}

/**
 * Slice 22 logged-in polish pass — plan-level Active/Completed lifecycle,
 * same shape as `grocery/list-service.ts#completeGroceryList`/
 * `reopenGroceryList`. Marking a plan Completed doesn't touch its entries,
 * linked grocery lists, or Cooking Sessions — it only changes which column
 * the plan sorts into on the index.
 */
export async function completeMealPlan(
  ownerId: string,
  mealPlanId: string,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  if (mealPlan.completedAt != null) {
    throw new ValidationError("This Meal Plan is already completed.");
  }
  await prisma.mealPlan.update({
    where: { id: mealPlanId },
    data: { completedAt: new Date() },
  });
}

/** Reactivating moves a plan back to Active, preserving its entries and
 * planned meals — never recreates the plan. */
export async function reactivateMealPlan(
  ownerId: string,
  mealPlanId: string,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  if (mealPlan.completedAt == null) {
    throw new ValidationError("This Meal Plan is already active.");
  }
  await prisma.mealPlan.update({
    where: { id: mealPlanId },
    data: { completedAt: null },
  });
}

// ---------------------------------------------------------------------------
// Entries (§76.2, §76.3)
// ---------------------------------------------------------------------------

export type AddMealPlanEntryInput = {
  dishId: string;
  /** Explicit Version choice — defaults to the Dish's current Version. */
  dishVersionId?: string | null;
  cookDate: Date;
  targetYieldQuantity?: number | null;
  targetYieldUnit?: string | null;
  note?: string | null;
};

/**
 * §76.3: a plan entry pins the source's *exact current* Version at add time
 * — later Recipe/Part edits never silently replace it. The durable
 * `sourceDishTitleSnapshot`/`sourceDishKindSnapshot`/
 * `sourceDishVersionLabelSnapshot` fields are captured here too (round-2
 * Correction 4), so the entry stays readable even after the source is
 * later permanently deleted.
 */
export async function addMealPlanEntry(
  ownerId: string,
  mealPlanId: string,
  input: AddMealPlanEntryInput,
): Promise<string> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  const dish = await getOwnedDishOrThrow(ownerId, input.dishId);
  const resolvedVersionId = input.dishVersionId || dish.currentVersionId;
  if (!resolvedVersionId) {
    throw new ValidationError(
      `"${dish.currentTitle ?? "Untitled"}" has no saved content to plan from.`,
    );
  }
  const version = await prisma.dishVersion.findFirst({
    where: { id: resolvedVersionId, dishId: dish.id },
    select: { id: true, majorVersion: true, minorVersion: true },
  });
  if (!version) throw new NotFoundError("Version not found.");

  return prisma.$transaction(async (tx) => {
    const entry = await tx.mealPlanEntry.create({
      data: {
        mealPlanId,
        dishId: dish.id,
        dishVersionId: version.id,
        cookDate: input.cookDate,
        targetYieldQuantity: input.targetYieldQuantity ?? null,
        targetYieldUnit: input.targetYieldUnit?.trim() || null,
        note: input.note?.trim() || null,
        sourceDishTitleSnapshot: dish.currentTitle ?? "Untitled",
        sourceDishKindSnapshot: dish.kind,
        sourceDishVersionLabelSnapshot: versionLabel(
          version.majorVersion,
          version.minorVersion,
        ),
      },
    });

    // §81.7 correction: a Grocery List's chosen Meal subset must survive
    // later Meal Plan growth — a brand-new entry should never silently
    // start contributing to a list that already existed before it (the
    // user hasn't reviewed it for that list yet). Every list linked to this
    // plan found *before* this entry existed is exactly `preexistingLists`
    // below; excluding the new entry there before resyncing makes it land
    // in each such list's Meals section unchecked, not contributing, via
    // the same exclusion path §81.7's manual toggle already uses — no new
    // sync logic. A brand-new *list*, generated after this entry already
    // exists, is unaffected: `generateGroceryListFromMealPlan`'s own
    // `entryIds` selection (unchanged) is what decides its initial subset.
    const preexistingLists = await tx.groceryList.findMany({
      where: { linkedMealPlanId: mealPlanId, completedAt: null },
      select: { id: true },
    });
    for (const list of preexistingLists) {
      await setGroceryListMealPlanEntryExclusion(
        tx,
        ownerId,
        list.id,
        mealPlanId,
        entry.id,
        true,
      );
    }

    const freshEntries = [
      ...mealPlan.entries.map(toContributionEntry),
      toContributionEntry(entry),
    ];
    await resyncLinkedLists(tx, ownerId, mealPlanId, freshEntries);
    return entry.id;
  });
}

export type UpdateMealPlanEntryInput = {
  cookDate?: Date;
  targetYieldQuantity?: number | null;
  targetYieldUnit?: string | null;
  note?: string | null;
};

export async function updateMealPlanEntry(
  ownerId: string,
  mealPlanId: string,
  entryId: string,
  input: UpdateMealPlanEntryInput,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  findOwnedEntry(mealPlan, entryId);

  await prisma.$transaction(async (tx) => {
    await tx.mealPlanEntry.update({
      where: { id: entryId },
      data: {
        ...(input.cookDate !== undefined ? { cookDate: input.cookDate } : {}),
        ...(input.targetYieldQuantity !== undefined
          ? { targetYieldQuantity: input.targetYieldQuantity }
          : {}),
        ...(input.targetYieldUnit !== undefined
          ? { targetYieldUnit: input.targetYieldUnit?.trim() || null }
          : {}),
        ...(input.note !== undefined
          ? { note: input.note?.trim() || null }
          : {}),
      },
    });

    const freshEntries = await tx.mealPlanEntry.findMany({
      where: { mealPlanId },
      select: {
        id: true,
        dishId: true,
        dishVersionId: true,
        targetYieldQuantity: true,
      },
    });
    await resyncLinkedLists(tx, ownerId, mealPlanId, freshEntries);
  });
}

/**
 * Removes an entry. Resync must run *before* the entry row is deleted, not
 * after: `GroceryItemContribution.mealPlanEntryId` is `onDelete: SetNull`,
 * so deleting the entry first would null that FK before resync's diff ever
 * ran — the disappeared contributions would silently lose their identity
 * instead of being flagged `REMOVED` (Arch §D.11 round-2 Correction 5). By
 * resyncing against the *post-removal* entry set first, the diff correctly
 * sees this entry's contributions as gone and flags them while the FK is
 * still intact; only then is the row itself deleted.
 */
export async function removeMealPlanEntry(
  ownerId: string,
  mealPlanId: string,
  entryId: string,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  findOwnedEntry(mealPlan, entryId);

  await prisma.$transaction(async (tx) => {
    const remainingEntries = mealPlan.entries
      .filter((e) => e.id !== entryId)
      .map(toContributionEntry);
    await resyncLinkedLists(tx, ownerId, mealPlanId, remainingEntries);
    await tx.mealPlanEntry.delete({ where: { id: entryId } });
  });
}

/** §78: manual status marking for cooking that happened outside DishFrame.
 * `IN_PROGRESS` is reachable only via `startSessionFromEntry` below. */
export async function setMealPlanEntryStatus(
  ownerId: string,
  mealPlanId: string,
  entryId: string,
  status: EntryStatusValue,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  findOwnedEntry(mealPlan, entryId);
  await prisma.mealPlanEntry.update({
    where: { id: entryId },
    data: { status },
  });
}

/**
 * §76.3: "When a newer minor Version appears on the same major line,
 * DishFrame may offer to update the entry" — same-major-latest-minor by
 * default, or an explicit `targetVersionId` the caller already validated
 * belongs to the entry's own Dish. Never a newer major line, which never
 * auto-prompts. Runs the resync inside the same transaction (Arch §I).
 */
export async function adoptNewerVersionInEntry(
  ownerId: string,
  mealPlanId: string,
  entryId: string,
  targetVersionId?: string,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  const entry = findOwnedEntry(mealPlan, entryId);
  if (!entry.dishId || !entry.dishVersionId) {
    throw new ValidationError(
      "This entry's source Recipe or Part has been deleted and no longer has a newer Version to adopt.",
    );
  }
  const dish = await getOwnedDishOrThrow(ownerId, entry.dishId);
  const currentPinned = await prisma.dishVersion.findFirstOrThrow({
    where: { id: entry.dishVersionId },
    select: { majorVersion: true },
  });

  let resolvedId = targetVersionId;
  if (!resolvedId) {
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
    resolvedId = latestOnLine?.id ?? entry.dishVersionId;
  }

  const targetVersion = await prisma.dishVersion.findFirst({
    where: { id: resolvedId, dishId: dish.id },
    select: { id: true, majorVersion: true, minorVersion: true },
  });
  if (!targetVersion) throw new NotFoundError("Target Version not found.");

  await prisma.$transaction(async (tx) => {
    await tx.mealPlanEntry.update({
      where: { id: entryId },
      data: {
        dishVersionId: targetVersion.id,
        sourceDishVersionLabelSnapshot: versionLabel(
          targetVersion.majorVersion,
          targetVersion.minorVersion,
        ),
      },
    });

    const freshEntries = mealPlan.entries.map((e) =>
      e.id === entryId
        ? toContributionEntry({ ...e, dishVersionId: targetVersion.id })
        : toContributionEntry(e),
    );
    await resyncLinkedLists(tx, ownerId, mealPlanId, freshEntries);
  });
}

export type ScheduleMealDraft = {
  label: string;
  date: Date;
  servings: number;
  /** Position within its own calendar date's day-card (§4) — optional at
   * this layer so existing direct-service callers that don't care about
   * cross-entry day order keep working; defaults to 0. */
  sortOrder?: number;
};
export type ScheduleAssignment = {
  mealKey: string;
  meals: ScheduleMealDraft[];
};

export type MealPlanEntryChanges = {
  removedEntryIds: string[];
  replacedEntries: (AddMealPlanEntryInput & { entryId: string })[];
  updatedEntries: (UpdateMealPlanEntryInput & { entryId: string })[];
  versionAdoptedEntryIds: string[];
  newEntries: (AddMealPlanEntryInput & { localKey?: string })[];
  scheduleAssignments?: ScheduleAssignment[];
};

/**
 * F10 (docs/performance-architecture-audit.md): one request instead of one
 * per changed entry — the Meal Plan editor's Save previously drove up to
 * five separate client-side loops of individually-awaited server-action
 * calls (remove, replace, update, adopt-newer-Version, add), each paying
 * full server-action round-trip overhead on top of its own DB work.
 *
 * Server-side, this still calls the exact same per-entry functions below
 * (`removeMealPlanEntry`/`addMealPlanEntry`/`updateMealPlanEntry`/
 * `adoptNewerVersionInEntry`), in the same category order the client used
 * to call them as separate round trips, with the same skip-logic
 * (`replacedEntryIds` excludes a replaced entry from the version-adoption
 * pass) and the same independent per-entry failure handling — one entry
 * failing never aborts the rest of the batch, matching the editor's
 * existing best-effort semantics.
 *
 * Entries within a category are processed sequentially, not concurrently:
 * each of these functions re-reads the Meal Plan's live entry set fresh
 * (`getOwnedMealPlanOrThrow`) and resyncs linked grocery lists against it.
 * Two entries in the same category racing would each resync against a
 * stale pre-batch snapshot missing the other's already-applied change —
 * a real correctness risk to the grocery-list contribution tracking, not
 * just added DB load, so this stays sequential rather than bounded-
 * concurrent (unlike, e.g., independent read-only tree resolution
 * elsewhere in this audit pass).
 */
export async function saveMealPlanEntryChanges(
  ownerId: string,
  mealPlanId: string,
  changes: MealPlanEntryChanges,
): Promise<{ hadEntryError: boolean }> {
  let hadEntryError = false;
  // Resolves a schedule `mealKey` (either a real, already-saved entryId, or
  // a `localKey` a `newEntries`/`replacedEntries` draft carried) to the
  // entryId it ends up as once this batch's entry mutations below have run.
  const keyToEntryId = new Map<string, string>();

  for (const entryId of changes.removedEntryIds) {
    try {
      await removeMealPlanEntry(ownerId, mealPlanId, entryId);
    } catch {
      hadEntryError = true;
    }
  }

  const replacedEntryIds = new Set<string>();
  for (const { entryId, ...input } of changes.replacedEntries) {
    replacedEntryIds.add(entryId);
    try {
      await removeMealPlanEntry(ownerId, mealPlanId, entryId);
    } catch {
      hadEntryError = true;
      continue;
    }
    try {
      const newEntryId = await addMealPlanEntry(ownerId, mealPlanId, input);
      // The client's schedule state still keys a replaced Meal by its old
      // (now-deleted) entryId, since editing a Meal never changes its local
      // identity until Save — redirect that key onto the new row.
      keyToEntryId.set(entryId, newEntryId);
    } catch {
      hadEntryError = true;
    }
  }

  for (const { entryId, ...input } of changes.updatedEntries) {
    try {
      await updateMealPlanEntry(ownerId, mealPlanId, entryId, input);
    } catch {
      hadEntryError = true;
    }
  }

  for (const entryId of changes.versionAdoptedEntryIds) {
    if (
      changes.removedEntryIds.includes(entryId) ||
      replacedEntryIds.has(entryId)
    ) {
      continue;
    }
    try {
      await adoptNewerVersionInEntry(ownerId, mealPlanId, entryId);
    } catch {
      hadEntryError = true;
    }
  }

  for (const { localKey, ...draft } of changes.newEntries) {
    try {
      const newEntryId = await addMealPlanEntry(ownerId, mealPlanId, draft);
      if (localKey) keyToEntryId.set(localKey, newEntryId);
    } catch {
      hadEntryError = true;
    }
  }

  // Schedule assignments run last, once every entry mutation above has
  // settled, so `keyToEntryId` and the Meal Plan's live entry set (target
  // yields included) are both final.
  const scheduleAssignments = changes.scheduleAssignments ?? [];
  if (scheduleAssignments.length > 0) {
    const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
    const validEntryIds = new Set(mealPlan.entries.map((e) => e.id));
    for (const assignment of scheduleAssignments) {
      const resolvedEntryId =
        keyToEntryId.get(assignment.mealKey) ?? assignment.mealKey;
      // A Meal removed in this same batch (or a draft Meal whose add
      // failed) simply has nothing left to schedule against — drop it
      // rather than surfacing a confusing "not found" error.
      if (!validEntryIds.has(resolvedEntryId)) continue;
      try {
        await setScheduleForEntry(mealPlan, resolvedEntryId, assignment.meals);
      } catch {
        hadEntryError = true;
      }
    }
  }

  return { hadEntryError };
}

/**
 * Replaces one Meal's *complete* schedule (§77.1) with `meals` — the
 * Schedule section's modal always submits a Meal's full desired list, not
 * an incremental add/remove, so this deletes and recreates rather than
 * diffing. Validates both constraints PRODUCT_SPEC.md §77.2 now enforces
 * rather than merely warns about: every date must fall within the Meal
 * Plan's own range, and total scheduled servings may not exceed the Meal's
 * target yield.
 */
async function setScheduleForEntry(
  mealPlan: OwnedMealPlan,
  entryId: string,
  meals: ScheduleMealDraft[],
): Promise<void> {
  const entry = findOwnedEntry(mealPlan, entryId);
  const start = mealPlan.startDate.getTime();
  const end = mealPlan.endDate.getTime();
  for (const meal of meals) {
    if (meal.date.getTime() < start || meal.date.getTime() > end) {
      throw new ValidationError(
        `"${meal.label}" falls outside this Meal Plan's date range.`,
      );
    }
  }
  const targetYield = decimalToNumber(entry.targetYieldQuantity);
  if (targetYield != null) {
    const totalServings = meals.reduce((sum, m) => sum + m.servings, 0);
    if (totalServings > targetYield) {
      throw new ValidationError(
        `Scheduled servings for "${entry.sourceDishTitleSnapshot}" (${totalServings}) exceed its target yield of ${targetYield}.`,
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.plannedMeal.deleteMany({ where: { entryId } });
    if (meals.length > 0) {
      await tx.plannedMeal.createMany({
        data: meals.map((meal) => ({
          entryId,
          label: meal.label,
          date: meal.date,
          servings: meal.servings,
          sortOrder: meal.sortOrder ?? 0,
        })),
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Cooking Session integration (§78)
// ---------------------------------------------------------------------------

/**
 * Starts a Cooking Session covering the entry's whole pinned Version,
 * scaled by its target-yield ratio (§24.1's natural target-output scaling,
 * applied server-side since a Meal Plan entry stores an absolute target
 * yield rather than a multiplier). Links the session and flips the entry to
 * `IN_PROGRESS` (§78) — `endCookingSession` closes the loop by marking a
 * `COMPLETED` session's entry `COOKED` (`cooking/service.ts`).
 */
export async function startSessionFromEntry(
  ownerId: string,
  mealPlanId: string,
  entryId: string,
) {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  const entry = findOwnedEntry(mealPlan, entryId);
  if (!entry.dishId || !entry.dishVersionId) {
    throw new ValidationError(
      "This entry's source Recipe or Part has been deleted and can no longer be cooked from the plan.",
    );
  }

  const { dish, version } = await getOwnedDishVersionOrThrow(
    ownerId,
    entry.dishId,
    entry.dishVersionId,
  );
  const cookableUnits = await buildCookableUnits(ownerId, dish, version);
  const scaleFactor = computeTargetYieldScaleFactor(
    decimalToNumber(entry.targetYieldQuantity),
    decimalToNumber(version.yieldQuantity),
  );

  const session = await startCookingSession(ownerId, {
    dishId: entry.dishId,
    dishVersionId: entry.dishVersionId,
    units: cookableUnits.map((unit) => ({
      unitKey: unit.unitKey,
      scaleFactor: null,
    })),
    scaleFactor,
  });

  await prisma.mealPlanEntry.update({
    where: { id: entryId },
    data: { linkedSessionId: session.id, status: "IN_PROGRESS" },
  });

  return session;
}

// ---------------------------------------------------------------------------
// Grocery generation & manual re-sync (§81.1, §81.2)
// ---------------------------------------------------------------------------

/**
 * §81.1/§81.7: one Meal Plan may feed multiple Grocery Lists, each covering a
 * different selected subset of entries. When the caller selects a subset
 * (`entryIds` narrower than the full plan), every entry left out is recorded
 * as an exclusion for the new list — otherwise the very next unrelated Meal
 * Plan mutation would resync this list against the *full* live entry set
 * (every mutating action resyncs every active linked list, §81.2) and
 * silently pull the deselected entries back in.
 */
export async function generateGroceryListFromMealPlan(
  ownerId: string,
  mealPlanId: string,
  input: { title: string; plannedDate?: Date; entryIds?: string[] },
): Promise<string> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  const selected = input.entryIds
    ? mealPlan.entries.filter((e) => input.entryIds!.includes(e.id))
    : mealPlan.entries;
  if (input.entryIds && selected.length !== input.entryIds.length) {
    throw new ValidationError(
      "One or more Meal Plan entries could not be found.",
    );
  }

  const listId = await generateGroceryListFromMealPlanService(
    ownerId,
    mealPlanId,
    {
      title: input.title,
      plannedDate: input.plannedDate ?? new Date(),
      entries: selected.map(toContributionEntry),
    },
  );

  if (input.entryIds) {
    const selectedIds = new Set(input.entryIds);
    const excluded = mealPlan.entries.filter((e) => !selectedIds.has(e.id));
    if (excluded.length > 0) {
      await prisma.$transaction(
        excluded.map((entry) =>
          prisma.groceryListMealPlanEntryExclusion.upsert({
            where: {
              groceryListId_mealPlanEntryId: {
                groceryListId: listId,
                mealPlanEntryId: entry.id,
              },
            },
            create: { groceryListId: listId, mealPlanEntryId: entry.id },
            update: {},
          }),
        ),
      );
    }
  }

  return listId;
}

/**
 * Manual "sync now" — the same resync step every mutating action already
 * runs automatically, exposed directly for the case nothing internal to
 * this module triggered it (e.g. the source Recipe/Part was edited or
 * deleted from outside the Meal Plan entirely). Every active linked list
 * resyncs, matching §81.2, but only `focusListId`'s own outcome — the list
 * the user actually clicked "Sync now" on — is returned, so its own page
 * can report exactly what changed rather than an aggregate across every
 * sibling list this same Meal Plan feeds.
 */
export async function resyncMealPlanGroceryLists(
  ownerId: string,
  mealPlanId: string,
  focusListId?: string,
): Promise<GroceryListResyncSummary | null> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  return prisma.$transaction(async (tx) => {
    const summaries = await resyncLinkedLists(
      tx,
      ownerId,
      mealPlanId,
      mealPlan.entries.map(toContributionEntry),
    );
    return focusListId ? (summaries.get(focusListId) ?? null) : null;
  });
}

/**
 * §81.7 — toggles whether one Meal Plan entry contributes to one linked
 * Grocery List's own scope, then immediately resyncs every active linked
 * list (same transaction, same §81.2 convention every other entry mutation
 * follows) so the toggled list's contents reflect the new selection right
 * away.
 */
export async function setMealPlanGroceryListEntryIncluded(
  ownerId: string,
  mealPlanId: string,
  listId: string,
  entryId: string,
  included: boolean,
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  findOwnedEntry(mealPlan, entryId);

  await prisma.$transaction(async (tx) => {
    await setGroceryListMealPlanEntryExclusion(
      tx,
      ownerId,
      listId,
      mealPlanId,
      entryId,
      !included,
    );
    await resyncLinkedLists(
      tx,
      ownerId,
      mealPlanId,
      mealPlan.entries.map(toContributionEntry),
    );
  });
}

/**
 * §9 "Edit grocery list" — renames/re-dates a Meal-Plan-linked list and
 * replaces its whole included-entry selection in one save. Every entry is
 * explicitly set included or excluded (rather than diffed against the
 * list's current selection) so the result always matches exactly what the
 * form submitted; each toggle reuses the same `GroceryListMealPlanEntryExclusion`
 * bookkeeping §81.7's manual per-entry toggle already established, batched
 * into one transaction with a single resync at the end (F10 convention)
 * rather than one resync per toggled entry.
 */
export async function updateMealPlanLinkedGroceryList(
  ownerId: string,
  mealPlanId: string,
  listId: string,
  input: { title: string; plannedDate: Date; entryIds: string[] },
): Promise<void> {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  const list = await prisma.groceryList.findFirst({
    where: { id: listId, ownerId, linkedMealPlanId: mealPlanId },
    select: { id: true },
  });
  if (!list) throw new NotFoundError("Grocery list not found.");

  const title = input.title.trim();
  if (!title) throw new ValidationError("Enter a title for this grocery list.");
  const selected = new Set(input.entryIds);

  await prisma.$transaction(async (tx) => {
    await tx.groceryList.update({
      where: { id: listId },
      data: { title, plannedDate: input.plannedDate },
    });
    for (const entry of mealPlan.entries) {
      await setGroceryListMealPlanEntryExclusion(
        tx,
        ownerId,
        listId,
        mealPlanId,
        entry.id,
        !selected.has(entry.id),
      );
    }
    await resyncLinkedLists(
      tx,
      ownerId,
      mealPlanId,
      mealPlan.entries.map(toContributionEntry),
    );
  });
}

// ---------------------------------------------------------------------------
// Schedule eaten state (§6)
// ---------------------------------------------------------------------------

async function getOwnedPlannedMealOrThrow(
  ownerId: string,
  mealPlanId: string,
  plannedMealId: string,
) {
  const mealPlan = await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  for (const entry of mealPlan.entries) {
    const meal = entry.plannedMeals.find((m) => m.id === plannedMealId);
    if (meal) return meal;
  }
  throw new NotFoundError("Scheduled meal not found.");
}

/** Meal Plan Details' per-row eaten checkbox — consumption state, distinct
 * from `MealPlanEntry.status`'s cooked/preparation state. Never touches
 * this scheduled meal's position (`sortOrder`). */
export async function setPlannedMealEaten(
  ownerId: string,
  mealPlanId: string,
  plannedMealId: string,
  eaten: boolean,
): Promise<void> {
  await getOwnedPlannedMealOrThrow(ownerId, mealPlanId, plannedMealId);
  await prisma.plannedMeal.update({
    where: { id: plannedMealId },
    data: { eaten },
  });
}

/** "Mark all eaten" — checks every scheduled meal on one calendar date at
 * once. There is no bulk "unmark" counterpart: reopening a fully-eaten day
 * happens by expanding it and unchecking individual meals (§6). */
export async function markScheduleDayEaten(
  ownerId: string,
  mealPlanId: string,
  date: Date,
): Promise<void> {
  await getOwnedMealPlanOrThrow(ownerId, mealPlanId);
  await prisma.plannedMeal.updateMany({
    where: { date, entry: { mealPlanId } },
    data: { eaten: true },
  });
}
