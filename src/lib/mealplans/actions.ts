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
  addPlannedMealSchema,
  removePlannedMealSchema,
  generateGroceryListFromMealPlanSchema,
  recommendationFiltersSchema,
  type ActionState,
} from "@/lib/mealplans/schema";
import type { Recommendation } from "@/lib/mealplans/recommendations";

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

export async function addPlannedMeal(values: {
  mealPlanId: string;
  entryId: string;
  label: string;
  date: Date | string;
  servings: number;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId, ...input } =
      addPlannedMealSchema.parse(values);
    await mealPlanService.addPlannedMeal(userId, mealPlanId, entryId, input);
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function removePlannedMeal(values: {
  mealPlanId: string;
  entryId: string;
  plannedMealId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId, entryId, plannedMealId } =
      removePlannedMealSchema.parse(values);
    await mealPlanService.removePlannedMeal(
      userId,
      mealPlanId,
      entryId,
      plannedMealId,
    );
    revalidateMealPlan(mealPlanId);
    return { status: "success" };
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

export type GenerateGroceryListActionState =
  { status: "success"; listId: string } | { status: "error"; message: string };

export async function generateGroceryListFromMealPlan(values: {
  mealPlanId: string;
  title: string;
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

export type RecommendationsActionState =
  | {
      status: "success";
      recommendations: Recommendation[];
      totalRecipeCount: number;
      eligibleRecipeCount: number;
    }
  | { status: "error"; message: string };

export async function getMealPlanRecommendations(values: {
  includeExperimental?: boolean;
  includeIdea?: boolean;
  favoritesOnly?: boolean;
}): Promise<RecommendationsActionState> {
  try {
    const userId = await requireUserId();
    const filters = recommendationFiltersSchema.parse(values);
    const { recommendations, totalRecipeCount, eligibleRecipeCount } =
      await mealPlanService.getRecommendations(userId, filters);
    return {
      status: "success",
      recommendations,
      totalRecipeCount,
      eligibleRecipeCount,
    };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}

export async function resyncMealPlanGroceryLists(values: {
  mealPlanId: string;
}): Promise<ActionState> {
  try {
    const userId = await requireUserId();
    const { mealPlanId } = mealPlanIdSchema.parse(values);
    await mealPlanService.resyncMealPlanGroceryLists(userId, mealPlanId);
    revalidateMealPlan(mealPlanId);
    revalidatePath(LISTS_PATH);
    return { status: "success" };
  } catch (error) {
    return { status: "error", message: toActionErrorMessage(error) };
  }
}
