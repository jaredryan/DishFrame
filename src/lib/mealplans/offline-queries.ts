"use client";

import { getEntity } from "@/lib/offline/db";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";
import type { MealPlanEntryForGrocerySelectionDto } from "@/lib/mealplans/actions";

/**
 * Offline equivalent of `listMealPlanEntriesForGrocerySelection` — every
 * field it returns (`id`, `title`, `cookDate`) is already part of the
 * fully-replicated `MealPlanDetailDto.entries`
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §5), so no new replication was
 * needed, just reading it back out client-side.
 */
export async function listMealPlanEntriesForGrocerySelectionOffline(
  mealPlanId: string,
): Promise<
  | { status: "success"; entries: MealPlanEntryForGrocerySelectionDto[] }
  | { status: "error"; message: string }
> {
  const record = await getEntity<MealPlanDetailDto>("mealPlan", mealPlanId);
  if (!record) {
    return {
      status: "error",
      message: "This Meal Plan isn't available offline yet.",
    };
  }
  return {
    status: "success",
    entries: record.doc.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      cookDate: entry.cookDate,
    })),
  };
}
