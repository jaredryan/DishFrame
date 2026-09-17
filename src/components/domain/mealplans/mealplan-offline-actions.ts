"use client";

import {
  mealPlanMutate,
  generateClientId,
} from "@/lib/mealplans/offline-mutate";
import { runOrQueueMutation } from "@/lib/offline/mutate";
import type { ActionState } from "@/lib/mealplans/schema";

/**
 * Drop-in, offline-capable replacements for the subset of
 * `@/lib/mealplans/actions` Server Actions `<MealPlanView>` calls — same
 * names/signatures/return shapes, so its existing call sites are
 * unchanged. See `grocery-offline-actions.ts` for the identical pattern
 * applied to Grocery Lists.
 */

export async function createMealPlan(values: {
  title: string;
  startDate: Date | string;
  endDate: Date | string;
  notes?: string | null;
}): Promise<
  | { status: "success"; mealPlanId: string }
  | { status: "error"; message: string }
> {
  const clientMealPlanId = generateClientId();
  const result = await runOrQueueMutation({
    op: "mealplan.create",
    entityType: "mealPlan",
    entityId: clientMealPlanId,
    payload: { ...values, clientMealPlanId },
    optimisticDoc: {
      id: clientMealPlanId,
      title: values.title,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
      notes: values.notes ?? null,
      completedAt: null,
      entries: [],
      linkedGroceryLists: [],
    },
    mutationId: clientMealPlanId,
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", mealPlanId: clientMealPlanId };
}

export async function updateMealPlan(values: {
  mealPlanId: string;
  title?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  notes?: string | null;
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.update",
    values.mealPlanId,
    values,
    (plan) => ({
      ...plan,
      ...(values.title !== undefined ? { title: values.title } : {}),
      ...(values.startDate !== undefined
        ? { startDate: new Date(values.startDate).toISOString() }
        : {}),
      ...(values.endDate !== undefined
        ? { endDate: new Date(values.endDate).toISOString() }
        : {}),
      ...(values.notes !== undefined ? { notes: values.notes } : {}),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

/** Entry/schedule batch save — deliberately a no-op optimistic patch. The
 * editor's own local form state already reflects every change the user
 * made; this only affects what the read-only view page shows afterward,
 * which is correct the moment this mutation actually syncs (online
 * immediately, or once reconnected). Reimplementing the remove/replace/
 * update/new-entry-with-`localKey` resolution client-side to preview it
 * would duplicate real business logic for a low-value instant-preview. */
export async function saveMealPlanEntryChanges(values: {
  mealPlanId: string;
  removedEntryIds: string[];
  replacedEntries: unknown[];
  updatedEntries: unknown[];
  versionAdoptedEntryIds: string[];
  newEntries: unknown[];
  scheduleAssignments?: unknown;
}): Promise<
  | { status: "success"; hadEntryError: boolean }
  | { status: "error"; message: string }
> {
  const result = await mealPlanMutate(
    "mealplan.saveEntryChanges",
    values.mealPlanId,
    values,
    (plan) => plan,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", hadEntryError: false };
}

export async function duplicateMealPlan(values: {
  mealPlanId: string;
  title: string;
  startDate: Date | string;
  endDate: Date | string;
}): Promise<
  | { status: "success"; mealPlanId: string }
  | { status: "error"; message: string }
> {
  const clientMealPlanId = generateClientId();
  const result = await mealPlanMutate(
    "mealplan.duplicate",
    values.mealPlanId,
    { ...values, clientMealPlanId },
    (plan) => plan,
  );
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", mealPlanId: clientMealPlanId };
}

export async function deleteMealPlan(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.delete",
    values.mealPlanId,
    values,
    (p) => p,
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function completeMealPlan(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.complete",
    values.mealPlanId,
    values,
    (plan) => ({
      ...plan,
      completedAt: new Date().toISOString(),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function reactivateMealPlan(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.reactivate",
    values.mealPlanId,
    values,
    (plan) => ({
      ...plan,
      completedAt: null,
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function setMealPlanEntryStatus(values: {
  mealPlanId: string;
  entryId: string;
  status: "PLANNED" | "COOKED" | "SKIPPED";
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.setEntryStatus",
    values.mealPlanId,
    values,
    (plan) => ({
      ...plan,
      entries: plan.entries.map((entry) =>
        entry.id === values.entryId
          ? { ...entry, status: values.status }
          : entry,
      ),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function startSessionFromEntry(values: {
  mealPlanId: string;
  entryId: string;
}): Promise<
  | { status: "success"; sessionId: string }
  | { status: "error"; message: string }
> {
  const clientSessionId = generateClientId();
  const result = await runOrQueueMutation({
    op: "mealplan.startSessionFromEntry",
    entityType: "cookingSession",
    entityId: clientSessionId,
    payload: { ...values, clientSessionId },
    optimisticDoc: (current: unknown) => current,
    mutationId: generateClientId(),
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", sessionId: clientSessionId };
}

export async function generateGroceryListFromMealPlan(values: {
  mealPlanId: string;
  title: string;
  plannedDate: Date | string;
  entryIds?: string[];
}): Promise<
  { status: "success"; listId: string } | { status: "error"; message: string }
> {
  const clientListId = generateClientId();
  const result = await runOrQueueMutation({
    op: "mealplan.generateGroceryList",
    entityType: "groceryList",
    entityId: clientListId,
    payload: { ...values, clientListId },
    optimisticDoc: (current: unknown) => current,
    mutationId: generateClientId(),
  });
  if (!result.ok) return { status: "error", message: result.message };
  return { status: "success", listId: clientListId };
}

export async function setPlannedMealEaten(values: {
  mealPlanId: string;
  plannedMealId: string;
  eaten: boolean;
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.setPlannedMealEaten",
    values.mealPlanId,
    values,
    (plan) => ({
      ...plan,
      entries: plan.entries.map((entry) => ({
        ...entry,
        plannedMeals: entry.plannedMeals.map((meal) =>
          meal.id === values.plannedMealId
            ? { ...meal, eaten: values.eaten }
            : meal,
        ),
      })),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}

export async function markScheduleDayEaten(values: {
  mealPlanId: string;
  date: string;
}): Promise<ActionState> {
  const result = await mealPlanMutate(
    "mealplan.markScheduleDayEaten",
    values.mealPlanId,
    values,
    (plan) => ({
      ...plan,
      entries: plan.entries.map((entry) => ({
        ...entry,
        plannedMeals: entry.plannedMeals.map((meal) =>
          meal.date.slice(0, 10) === values.date
            ? { ...meal, eaten: true }
            : meal,
        ),
      })),
    }),
  );
  return result.ok
    ? { status: "success" }
    : { status: "error", message: result.message };
}
