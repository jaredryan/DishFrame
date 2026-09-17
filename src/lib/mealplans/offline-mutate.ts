"use client";

import { runOrQueueMutation } from "@/lib/offline/mutate";
import { generateClientId } from "@/lib/offline/ids";
import { getEntity } from "@/lib/offline/db";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";

/** Thin Meal-Plan-domain wrapper around `runOrQueueMutation`, mirroring
 * `grocery/offline-mutate.ts#groceryMutate` — patches the replicated
 * `MealPlanDetailDto` doc directly (no nested wrapper, unlike the Grocery
 * List replica).
 *
 * Automatically threads `baseRevision` into every payload — the specific
 * Meal Plan Entry's `updatedAt` when `payload` names one (`entryId`),
 * otherwise the whole plan's — read from whatever this device's replica
 * currently holds. `offline-sync/mealplans.ts`'s sync ops check it against
 * the server's current row before applying, so a mutation queued against a
 * since-changed entity surfaces as a real conflict instead of silently
 * overwriting it (docs/OFFLINE_IMPLEMENTATION_PLAN.md §3/§6). */
export async function mealPlanMutate(
  op: string,
  mealPlanId: string,
  payload: unknown,
  patch: (plan: MealPlanDetailDto) => MealPlanDetailDto,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await getEntity<MealPlanDetailDto>("mealPlan", mealPlanId);
  const entryId = (payload as { entryId?: string } | undefined)?.entryId;
  const entry = entryId
    ? existing?.doc.entries.find((e) => e.id === entryId)
    : undefined;
  const baseRevision = entry?.updatedAt ?? existing?.doc.updatedAt;

  const result = await runOrQueueMutation({
    op,
    entityType: "mealPlan",
    entityId: mealPlanId,
    payload: { ...(payload as object), baseRevision },
    optimisticDoc: (current: unknown) => {
      const plan = current as MealPlanDetailDto | undefined;
      return plan ? patch(plan) : current;
    },
    mutationId: generateClientId(),
  });
  return result.ok ? { ok: true } : { ok: false, message: result.message };
}

export { generateClientId };
