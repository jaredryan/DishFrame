"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { toActionErrorMessage } from "@/lib/errors";
import * as mealPlanService from "@/lib/mealplans/service";
import {
  createMealPlanSchema,
  updateMealPlanSchema,
  duplicateMealPlanSchema,
  mealPlanIdSchema,
  addMealPlanEntrySchema,
  updateMealPlanEntrySchema,
  entryIdSchema,
  setMealPlanEntryStatusSchema,
  adoptNewerVersionInEntrySchema,
  saveMealPlanEntryChangesSchema,
  generateGroceryListFromMealPlanSchema,
  resyncMealPlanGroceryListsSchema,
  setMealPlanGroceryListEntryIncludedSchema,
  updateMealPlanLinkedGroceryListSchema,
  setPlannedMealEatenSchema,
  markScheduleDayEatenSchema,
  type ActionState,
} from "@/lib/mealplans/schema";
import type { GroceryListResyncSummary } from "@/lib/grocery/list-service";

const PLANS_PATH = "/meal-plans";
const LISTS_PATH = "/grocery-lists";

function revalidateMealPlan(mealPlanId?: string) {
  revalidatePath(PLANS_PATH);
  if (mealPlanId) revalidatePath(`${PLANS_PATH}/${mealPlanId}`);
}

function revalidateGroceryList(listId?: string) {
  revalidatePath(LISTS_PATH);
  if (listId) revalidatePath(`${LISTS_PATH}/${listId}`);
}

export type MealPlanIdActionState =
  | { status: "success"; mealPlanId: string }
  | { status: "error"; message: string };

export async function createMealPlan(values: {
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  notes?: string | null;
}): Promise<MealPlanIdActionState> {
  try {
    const userId = await requireUserId();
    const input = createMealPlanSchema.parse(values);
    const mealPlanId = await mealPlanService.createMealPlan(userId, input);
    revalidateMealPlan(mealPlanId);
    return { status: "success", mealPlanId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateMealPlan(values: {
  mealPlanId: string;
  title?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  notes?: string | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, ...input } = updateMealPlanSchema.parse(values);
    await mealPlanService.updateMealPlan(userId, mealPlanId, input);
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function duplicateMealPlan(values: {
  mealPlanId: string;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
}): Promise<MealPlanIdActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, ...input } = duplicateMealPlanSchema.parse(values);
    const newMealPlanId = await mealPlanService.duplicateMealPlan(
      userId,
      mealPlanId,
      input,
    );
    revalidateMealPlan(newMealPlanId);
    return { status: "success", mealPlanId: newMealPlanId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function deleteMealPlan(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId } = mealPlanIdSchema.parse(values);
    await mealPlanService.deleteMealPlan(userId, mealPlanId);
    revalidateMealPlan();
    revalidatePath(LISTS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function completeMealPlan(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId } = mealPlanIdSchema.parse(values);
    await mealPlanService.completeMealPlan(userId, mealPlanId);
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function reactivateMealPlan(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId } = mealPlanIdSchema.parse(values);
    await mealPlanService.reactivateMealPlan(userId, mealPlanId);
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type EntryIdActionState =
  { status: "success"; entryId: string } | { status: "error"; message: string };

export async function addMealPlanEntry(values: {
  mealPlanId: string;
  dishId: string;
  dishVersionId?: string;
  cookDate: Date | string;
  targetYieldQuantity?: number | null;
  targetYieldUnit?: string | null;
  note?: string | null;
}): Promise<EntryIdActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, ...input } = addMealPlanEntrySchema.parse(values);
    const entryId = await mealPlanService.addMealPlanEntry(
      userId,
      mealPlanId,
      input,
    );
    revalidateMealPlan(mealPlanId);
    return { status: "success", entryId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateMealPlanEntry(values: {
  mealPlanId: string;
  entryId: string;
  cookDate?: Date | string;
  targetYieldQuantity?: number | null;
  targetYieldUnit?: string | null;
  note?: string | null;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId, ...input } =
      updateMealPlanEntrySchema.parse(values);
    await mealPlanService.updateMealPlanEntry(
      userId,
      mealPlanId,
      entryId,
      input,
    );
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function removeMealPlanEntry(values: {
  mealPlanId: string;
  entryId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId } = entryIdSchema.parse(values);
    await mealPlanService.removeMealPlanEntry(userId, mealPlanId, entryId);
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function setMealPlanEntryStatus(values: {
  mealPlanId: string;
  entryId: string;
  status: "PLANNED" | "COOKED" | "SKIPPED";
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId, status } =
      setMealPlanEntryStatusSchema.parse(values);
    await mealPlanService.setMealPlanEntryStatus(
      userId,
      mealPlanId,
      entryId,
      status,
    );
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function adoptNewerVersionInEntry(values: {
  mealPlanId: string;
  entryId: string;
  targetVersionId?: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId, targetVersionId } =
      adoptNewerVersionInEntrySchema.parse(values);
    await mealPlanService.adoptNewerVersionInEntry(
      userId,
      mealPlanId,
      entryId,
      targetVersionId,
    );
    revalidateMealPlan(mealPlanId);
    revalidatePath(LISTS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type MealPlanBulkEntryActionState =
  | { status: "success"; hadEntryError: boolean }
  | { status: "error"; message: string };

type BulkEntryDraft = {
  dishId: string;
  dishVersionId?: string;
  cookDate: Date | string;
  targetYieldQuantity?: number | null;
  targetYieldUnit?: string | null;
  note?: string | null;
  localKey?: string;
};

type ScheduleAssignmentInput = {
  mealKey: string;
  meals: {
    label: string;
    date: Date | string;
    servings: number;
    sortOrder: number;
  }[];
};

/**
 * F10 (docs/performance-architecture-audit.md): the Meal Plan editor's Save
 * sends every queued entry change (remove/replace/update/adopt-newer-
 * Version/add) in this one call instead of one server-action round trip
 * per changed entry — see `mealPlanService.saveMealPlanEntryChanges`'s doc
 * comment for how the batch is applied server-side. Schedule redesign: the
 * Schedule section's complete draft rides along in the same batch, keyed by
 * `mealKey` (see `scheduleAssignmentSchema`'s doc comment).
 */
export async function saveMealPlanEntryChanges(values: {
  mealPlanId: string;
  removedEntryIds: string[];
  replacedEntries: (BulkEntryDraft & { entryId: string })[];
  updatedEntries: {
    entryId: string;
    cookDate?: Date | string;
    targetYieldQuantity?: number | null;
    targetYieldUnit?: string | null;
    note?: string | null;
  }[];
  versionAdoptedEntryIds: string[];
  newEntries: BulkEntryDraft[];
  scheduleAssignments?: ScheduleAssignmentInput[];
}): Promise<MealPlanBulkEntryActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, ...changes } =
      saveMealPlanEntryChangesSchema.parse(values);
    const result = await mealPlanService.saveMealPlanEntryChanges(
      userId,
      mealPlanId,
      changes,
    );
    revalidateMealPlan(mealPlanId);
    revalidatePath(LISTS_PATH);
    return { status: "success", hadEntryError: result.hadEntryError };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type StartSessionActionState =
  | { status: "success"; sessionId: string }
  | { status: "error"; message: string };

export async function startSessionFromEntry(values: {
  mealPlanId: string;
  entryId: string;
}): Promise<StartSessionActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId } = entryIdSchema.parse(values);
    const session = await mealPlanService.startSessionFromEntry(
      userId,
      mealPlanId,
      entryId,
    );
    revalidateMealPlan(mealPlanId);
    return { status: "success", sessionId: session.id };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type MealPlanEntryForGrocerySelectionDto = {
  id: string;
  title: string;
  cookDate: string;
};
export type ListMealPlanEntriesForGrocerySelectionState =
  | { status: "success"; entries: MealPlanEntryForGrocerySelectionDto[] }
  | { status: "error"; message: string };

/**
 * The selected Meal Plan's own entries, for the New-grocery-list modal's
 * `Meal plan` basis (§8) — fetched on demand once a plan is picked, rather
 * than upfront for every candidate, mirroring `listGrocerySourceVersionOptions`'
 * on-demand convention. Read-only; no domain mutation.
 */
export async function listMealPlanEntriesForGrocerySelection(values: {
  mealPlanId: string;
}): Promise<ListMealPlanEntriesForGrocerySelectionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId } = mealPlanIdSchema.parse(values);
    const entries = await mealPlanService.getMealPlanEntriesForGrocerySelection(
      userId,
      mealPlanId,
    );
    return { status: "success", entries };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type GenerateGroceryListActionState =
  { status: "success"; listId: string } | { status: "error"; message: string };

export async function generateGroceryListFromMealPlan(values: {
  mealPlanId: string;
  title: string;
  plannedDate: Date | string;
  entryIds?: string[];
}): Promise<GenerateGroceryListActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, ...input } =
      generateGroceryListFromMealPlanSchema.parse(values);
    const listId = await mealPlanService.generateGroceryListFromMealPlan(
      userId,
      mealPlanId,
      input,
    );
    revalidateMealPlan(mealPlanId);
    revalidateGroceryList(listId);
    return { status: "success", listId };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export type ResyncMealPlanGroceryListsActionState =
  | { status: "success"; summary: GroceryListResyncSummary | null }
  | { status: "error"; message: string };

export async function resyncMealPlanGroceryLists(values: {
  mealPlanId: string;
  /** The Grocery List page this "Sync now" click came from — its own
   * outcome is returned so that page can report exactly what changed,
   * rather than an aggregate across every sibling list this Meal Plan
   * feeds (every active linked list still resyncs regardless). */
  listId?: string;
}): Promise<ResyncMealPlanGroceryListsActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, listId } =
      resyncMealPlanGroceryListsSchema.parse(values);
    const summary = await mealPlanService.resyncMealPlanGroceryLists(
      userId,
      mealPlanId,
      listId,
    );
    revalidateMealPlan(mealPlanId);
    revalidatePath(LISTS_PATH);
    return { status: "success", summary };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function setMealPlanGroceryListEntryIncluded(values: {
  mealPlanId: string;
  entryId: string;
  listId: string;
  included: boolean;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId, listId, included } =
      setMealPlanGroceryListEntryIncludedSchema.parse(values);
    await mealPlanService.setMealPlanGroceryListEntryIncluded(
      userId,
      mealPlanId,
      listId,
      entryId,
      included,
    );
    revalidatePath(`${LISTS_PATH}/${listId}`);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function updateMealPlanLinkedGroceryList(values: {
  mealPlanId: string;
  listId: string;
  title: string;
  plannedDate: Date | string;
  entryIds: string[];
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, listId, ...input } =
      updateMealPlanLinkedGroceryListSchema.parse(values);
    await mealPlanService.updateMealPlanLinkedGroceryList(
      userId,
      mealPlanId,
      listId,
      input,
    );
    revalidateMealPlan(mealPlanId);
    revalidateGroceryList(listId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function setPlannedMealEaten(values: {
  mealPlanId: string;
  plannedMealId: string;
  eaten: boolean;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, plannedMealId, eaten } =
      setPlannedMealEatenSchema.parse(values);
    await mealPlanService.setPlannedMealEaten(
      userId,
      mealPlanId,
      plannedMealId,
      eaten,
    );
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function markScheduleDayEaten(values: {
  mealPlanId: string;
  date: Date | string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, date } = markScheduleDayEatenSchema.parse(values);
    await mealPlanService.markScheduleDayEaten(userId, mealPlanId, date);
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
