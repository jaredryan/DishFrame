import { prisma } from "@/lib/db/prisma";
import * as mealPlanService from "@/lib/mealplans/service";
import {
  getOwnedMealPlanOrThrow,
  toMealPlanDetailDto,
  loadMealPlanEditorOptions,
} from "@/lib/mealplans/queries";
import {
  toJsonSafe,
  assertRevisionOrThrow,
} from "@/lib/offline-sync/serialize";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";
import {
  createMealPlanSchema,
  updateMealPlanSchema,
  duplicateMealPlanSchema,
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
import { buildGroceryListSnapshot } from "@/lib/offline-sync/grocery";
import { snapshotResult as cookingSessionSnapshotResult } from "@/lib/offline-sync/cooking";

/** Ships exactly `<MealPlanView>`'s prop shape (`toMealPlanDetailDto`, the
 * same mapper the view page itself calls) so the offline boundary renders
 * from the replica with no second mapping step — same pattern as Dishes'
 * `detail` field and Cooking's `session-view.ts`. */
export type MealPlanSnapshotDoc = MealPlanDetailDto;

export async function buildMealPlanSnapshot(
  userId: string,
  mealPlanId: string,
) {
  const mealPlan = await getOwnedMealPlanOrThrow(userId, mealPlanId);
  return {
    doc: toJsonSafe(toMealPlanDetailDto(mealPlan)),
    serverRevision: mealPlan.updatedAt.toISOString(),
  };
}

async function snapshotResult(userId: string, mealPlanId: string) {
  const { doc, serverRevision } = await buildMealPlanSnapshot(
    userId,
    mealPlanId,
  );
  return {
    entityType: "mealPlan",
    entityId: mealPlanId,
    snapshot: doc,
    serverRevision,
  };
}

const baseRevisionSchema = z.object({ baseRevision: z.string().optional() });

/** Whole-plan optimistic-concurrency check (docs/OFFLINE_IMPLEMENTATION_PLAN.md
 * §3/§6) — mirrors Dishes' `baseVersionId` check, using the plan's own
 * `updatedAt` instead. Skipped entirely when the payload carries no
 * `baseRevision` (an older queued mutation, or nothing to compare a create
 * against). */
async function assertMealPlanRevision(
  mealPlanId: string,
  baseRevision?: string,
) {
  if (baseRevision == null) return;
  const plan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    select: { updatedAt: true },
  });
  if (!plan) return;
  await assertRevisionOrThrow(plan.updatedAt, baseRevision);
}

async function assertMealPlanEntryRevision(
  entryId: string,
  baseRevision?: string,
) {
  if (baseRevision == null) return;
  const entry = await prisma.mealPlanEntry.findUnique({
    where: { id: entryId },
    select: { updatedAt: true },
  });
  if (!entry) return;
  await assertRevisionOrThrow(entry.updatedAt, baseRevision);
}

/** The Meal Plan editor's candidate-Dish/tag/cuisine/flavor-profile option
 * lists — shared reference data, not per-plan, shipped once at bootstrap
 * under a fixed id (`referenceData` entity type). */
export async function buildMealPlanEditorOptionsSnapshot(userId: string) {
  const options = await loadMealPlanEditorOptions(userId);
  return { doc: toJsonSafe(options), serverRevision: null as string | null };
}

const clientMealPlanIdSchema = z.object({
  clientMealPlanId: z.string().min(1),
});

const addEntryPayloadSchema = addMealPlanEntrySchema.extend({
  clientEntryId: z.string().min(1),
});
const generateGroceryListPayloadSchema =
  generateGroceryListFromMealPlanSchema.extend({
    clientListId: z.string().min(1),
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
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanRevision(mealPlanId, baseRevision);
    await mealPlanService.updateMealPlan(userId, mealPlanId, input);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.delete": async (userId, _entityId, rawPayload) => {
    const { mealPlanId } = mealPlanIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanRevision(mealPlanId, baseRevision);
    await mealPlanService.deleteMealPlan(userId, mealPlanId);
    return {
      entityType: "mealPlan",
      entityId: mealPlanId,
      snapshot: null,
      serverRevision: null,
    };
  },

  "mealplan.complete": async (userId, _entityId, rawPayload) => {
    const { mealPlanId } = mealPlanIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanRevision(mealPlanId, baseRevision);
    await mealPlanService.completeMealPlan(userId, mealPlanId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.reactivate": async (userId, _entityId, rawPayload) => {
    const { mealPlanId } = mealPlanIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanRevision(mealPlanId, baseRevision);
    await mealPlanService.reactivateMealPlan(userId, mealPlanId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.duplicate": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, clientMealPlanId, ...input } = duplicateMealPlanSchema
      .extend({ clientMealPlanId: z.string().min(1) })
      .parse(rawPayload);
    await mealPlanService.duplicateMealPlan(
      userId,
      mealPlanId,
      input,
      clientMealPlanId,
    );
    return snapshotResult(userId, clientMealPlanId);
  },

  "mealplan.addEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, clientEntryId, ...input } =
      addEntryPayloadSchema.parse(rawPayload);
    await mealPlanService.addMealPlanEntry(
      userId,
      mealPlanId,
      input,
      clientEntryId,
    );
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.updateEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId, ...input } =
      updateMealPlanEntrySchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanEntryRevision(entryId, baseRevision);
    await mealPlanService.updateMealPlanEntry(
      userId,
      mealPlanId,
      entryId,
      input,
    );
    return snapshotResult(userId, mealPlanId);
  },

  // Returns the new CookingSession as the primary entity, mirroring
  // `mealplan.generateGroceryList`'s cross-entity pattern — an offline
  // "Cook" click needs a real, immediately-openable session id.
  "mealplan.startSessionFromEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId, clientSessionId } = z
      .object({
        mealPlanId: z.string().min(1),
        entryId: z.string().min(1),
        clientSessionId: z.string().min(1),
      })
      .parse(rawPayload);
    await mealPlanService.startSessionFromEntry(
      userId,
      mealPlanId,
      entryId,
      clientSessionId,
    );
    return cookingSessionSnapshotResult(userId, clientSessionId);
  },

  "mealplan.removeEntry": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId } = entryIdSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanEntryRevision(entryId, baseRevision);
    await mealPlanService.removeMealPlanEntry(userId, mealPlanId, entryId);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.setEntryStatus": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, entryId, status } =
      setMealPlanEntryStatusSchema.parse(rawPayload);
    const { baseRevision } = baseRevisionSchema.parse(rawPayload);
    await assertMealPlanEntryRevision(entryId, baseRevision);
    await mealPlanService.setMealPlanEntryStatus(
      userId,
      mealPlanId,
      entryId,
      status,
    );
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.saveEntryChanges": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, ...input } =
      saveMealPlanEntryChangesSchema.parse(rawPayload);
    await mealPlanService.saveMealPlanEntryChanges(userId, mealPlanId, input);
    return snapshotResult(userId, mealPlanId);
  },

  "mealplan.setPlannedMealEaten": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, plannedMealId, eaten } =
      setPlannedMealEatenSchema.parse(rawPayload);
    await mealPlanService.setPlannedMealEaten(
      userId,
      mealPlanId,
      plannedMealId,
      eaten,
    );
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
  // Returns the new GroceryList as the primary entity (its own client-
  // generated id, threaded through exactly like standalone `grocery.create`
  // — see `list-service.ts#generateGroceryListFromMealPlan`'s `clientListId`
  // param) rather than the Meal Plan, so an offline "Generate grocery list"
  // click has a real, immediately-navigable list id without waiting on
  // sync. The Meal Plan's own `linkedGroceryLists` field catches up on the
  // next incremental pull rather than being updated here too — this
  // handler can only report one entity's snapshot per the sync contract.
  "mealplan.generateGroceryList": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, clientListId, ...input } =
      generateGroceryListPayloadSchema.parse(rawPayload);
    await mealPlanService.generateGroceryListFromMealPlan(
      userId,
      mealPlanId,
      input,
      clientListId,
    );
    const { doc, serverRevision } = await buildGroceryListSnapshot(
      userId,
      clientListId,
    );
    return {
      entityType: "groceryList",
      entityId: clientListId,
      snapshot: doc,
      serverRevision,
    };
  },

  "mealplan.resyncGroceryLists": async (userId, _entityId, rawPayload) => {
    const { mealPlanId, listId, reconciliation } =
      resyncMealPlanGroceryListsSchema.parse(rawPayload);
    const summary = await mealPlanService.resyncMealPlanGroceryLists(
      userId,
      mealPlanId,
      listId,
      reconciliation,
    );
    return { ...(await snapshotResult(userId, mealPlanId)), meta: summary };
  },
};

export async function listAllMealPlanSnapshots(userId: string) {
  const plans = await prisma.mealPlan.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  return Promise.all(
    plans.map((plan) => buildMealPlanSnapshot(userId, plan.id)),
  );
}
