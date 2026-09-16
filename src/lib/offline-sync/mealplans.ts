import { prisma } from "@/lib/db/prisma";
import * as mealPlanService from "@/lib/mealplans/service";
import { getOwnedMealPlanOrThrow } from "@/lib/mealplans/queries";
import { toJsonSafe } from "@/lib/offline-sync/serialize";
import {
  createMealPlanSchema,
  updateMealPlanSchema,
  mealPlanIdSchema,
  addMealPlanEntrySchema,
  updateMealPlanEntrySchema,
  entryIdSchema,
  setMealPlanEntryStatusSchema,
  saveMealPlanEntryChangesSchema,
  generateGroceryListFromMealPlanSchema,
  resyncMealPlanGroceryListsSchema,
  setPlannedMealEatenSchema,
  markScheduleDayEatenSchema,
} from "@/lib/mealplans/schema";
import { z } from "zod";
import type { SyncOpRegistry } from "@/lib/offline-sync/http";

export type MealPlanSnapshotDoc = ReturnType<typeof toJsonSafe<Awaited<ReturnType<typeof getOwnedMealPlanOrThrow>>>>;

export async function buildMealPlanSnapshot(userId: string, mealPlanId: string) {
  const mealPlan = await getOwnedMealPlanOrThrow(userId, mealPlanId);
  return {
    doc: toJsonSafe(mealPlan),
    // MealPlan doesn't yet carry its own `updatedAt` column (see docs/
    // OFFLINE_IMPLEMENTATION_PLAN.md's account of the pre-existing, unrelated
    // pending schema work adding one) — conflict detection for this domain
    // therefore doesn't use a revision timestamp; see `mealplans` conflict
    // handling in the offline plan for the accepted last-write-wins scope.
    serverRevision: null as string | null,
  };
}

async function snapshotResult(userId: string, mealPlanId: string) {
  const { doc, serverRevision } = await buildMealPlanSnapshot(userId, mealPlanId);
  return { entityType: "mealPlan", entityId: mealPlanId, snapshot: doc, serverRevision };
}

const clientMealPlanIdSchema = z.object({ clientMealPlanId: z.string().min(1) });

const addEntryPayloadSchema = addMealPlanEntrySchema.extend({
  clientEntryId: z.string().min(1),
});

export const mealPlanSyncOps: SyncOpRegistry = {
  "mealplan.create": async (userId, _entityId, rawPayload) => {
    const { clientMealPlanId } = clientMealPlanIdSchema.parse(rawPayload);
    const input = createMealPlanSchema.parse(rawPayload);
    await mealPlanService.createMealPlan(userId, input, clientMealPlanId);
    return snapshotResult(userId, clientMealPlanId);
  },

  "mealplan.update": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, ...input } = updateMealPlanSchema.parse(rawPayload);
    await mealPlanService.updateMealPlan(userId, mealPlanId, input);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.delete": async (userId, _entityId, rawPayload) => {
    const { mealPlanId } = mealPlanIdSchema.parse(rawPayload);
    await mealPlanService.deleteMealPlan(userId, mealPlanId);
    return { entityType: "mealPlan", entityId: mealPlanId, snapshot: null, serverRevision: null };
  },

  "mealplan.complete": async (userId, _entityId, rawPayload) => {
    const { mealPlanId } = mealPlanIdSchema.parse(rawPayload);
    await mealPlanService.completeMealPlan(userId, mealPlanId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.reactivate": async (userId, _entityId, rawPayload) => {
    const { mealPlanId } = mealPlanIdSchema.parse(rawPayload);
    await mealPlanService.reactivateMealPlan(userId, mealPlanId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.addEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, clientEntryId, ...input } = addEntryPayloadSchema.parse(rawPayload);
    await mealPlanService.addMealPlanEntry(userId, mealPlanId, input, clientEntryId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.updateEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId, ...input } = updateMealPlanEntrySchema.parse(rawPayload);
    await mealPlanService.updateMealPlanEntry(userId, mealPlanId, entryId, input);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.removeEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId } = entryIdSchema.parse(rawPayload);
    await mealPlanService.removeMealPlanEntry(userId, mealPlanId, entryId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.setEntryStatus": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId, status } = setMealPlanEntryStatusSchema.parse(rawPayload);
    await mealPlanService.setMealPlanEntryStatus(userId, mealPlanId, entryId, status);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.saveEntryChanges": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, ...input } = saveMealPlanEntryChangesSchema.parse(rawPayload);
    await mealPlanService.saveMealPlanEntryChanges(userId, mealPlanId, input);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.setPlannedMealEaten": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, plannedMealId, eaten } = setPlannedMealEatenSchema.parse(rawPayload);
    await mealPlanService.setPlannedMealEaten(userId, mealPlanId, plannedMealId, eaten);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.markScheduleDayEaten": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, date } = markScheduleDayEatenSchema.parse(rawPayload);
    await mealPlanService.markScheduleDayEaten(userId, mealPlanId, date);
    return snapshotResult(userId, mealPlanId);
  },

  // Both grocery-generation ops below are genuinely heavy, cross-aggregate
  // transactional operations (§ the offline plan's Meal Plans research:
  // `resyncLinkedLists` touches every active list linked to the plan, inside
  // a 15s-timeout transaction) — deliberately NOT reimplemented client-side.
  // Queuing them still makes the *action* offline-capable (the click is
  // captured and applied automatically once connectivity returns); the
  // actual reconciliation computation stays server-authoritative, exactly
  // as it already is online today.
  "mealplan.generateGroceryList": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, ...input } = generateGroceryListFromMealPlanSchema.parse(rawPayload);
    const listId = await mealPlanService.generateGroceryListFromMealPlan(userId, mealPlanId, input);
    return {
      entityType: "mealPlan",
      entityId: mealPlanId,
      snapshot: { ...(await buildMealPlanSnapshot(userId, mealPlanId)).doc, generatedListId: listId },
      serverRevision: null,
    };
  },

  "mealplan.resyncGroceryLists": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, listId, reconciliation } = resyncMealPlanGroceryListsSchema.parse(rawPayload);
    await mealPlanService.resyncMealPlanGroceryLists(userId, mealPlanId, listId, reconciliation);
    return snapshotResult(userId, mealPlanId);
  },
};

export async function listAllMealPlanSnapshots(userId: string) {
  const plans = await prisma.mealPlan.findMany({ where: { ownerId: userId }, select: { id: true } });
  return Promise.all(plans.map((plan) => buildMealPlanSnapshot(userId, plan.id)));
}
