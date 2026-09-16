import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import * as cookingService from "@/lib/cooking/service";
import * as reviewService from "@/lib/reviews/service";
import { buildCookingModeSessionProps } from "@/lib/cooking/session-view";
import {
  startCookingSessionSchema,
  removeSessionUnitSchema,
  restoreSessionUnitSchema,
  reorderSessionUnitsSchema,
  endCookingSessionSchema,
  toggleChecklistItemSchema,
  setUnitCompletionSchema,
  updateSessionScaleSchema,
  updateUnitScaleSchema,
  createTimerSchema,
  renameTimerSchema,
  timerIdSchema,
  adjustTimerSchema,
} from "@/lib/cooking/schema";
import { updateCookingNotesSchema, saveSessionReviewSchema } from "@/lib/reviews/schema";
import type { SyncOpRegistry } from "@/lib/offline-sync/http";

async function snapshotResult(userId: string, sessionId: string) {
  const props = await buildCookingModeSessionProps(userId, sessionId);
  return {
    entityType: "cookingSession",
    entityId: sessionId,
    snapshot: props,
    // CookingSession doesn't carry a client-visible revision string of its
    // own beyond "the current props" — every mutation here is naturally
    // idempotent (set-state style) or guarded by the receipt ledger, so a
    // simple "now" timestamp is enough for the replica's own bookkeeping.
    serverRevision: new Date().toISOString(),
  };
}

const clientUnitIdsSchema = z
  .record(
    z.string(),
    z.object({
      unitId: z.string().optional(),
      checklistItemIds: z.array(z.string()).optional(),
    }),
  )
  .optional();

const startSessionPayloadSchema = z.object({
  clientSessionId: z.string().min(1),
  input: startCookingSessionSchema,
  clientUnitIds: clientUnitIdsSchema,
});

const addUnitsPayloadSchema = z.object({
  sessionId: z.string().min(1),
  unitKeys: z.array(z.string()),
  clientUnitIds: clientUnitIdsSchema,
});

export const cookingSyncOps: SyncOpRegistry = {
  "cooking.startSession": async (userId, _entityId, rawPayload) => {
    const payload = startSessionPayloadSchema.parse(rawPayload);
    const input = startCookingSessionSchema.parse(payload.input);
    await cookingService.startCookingSession(userId, input, {
      sessionId: payload.clientSessionId,
      units: payload.clientUnitIds,
    });
    return snapshotResult(userId, payload.clientSessionId);
  },

  "cooking.addSessionUnits": async (userId, _entityId, rawPayload) => {
    const payload = addUnitsPayloadSchema.parse(rawPayload);
    await cookingService.addSessionUnits(
      userId,
      payload.sessionId,
      payload.unitKeys,
      payload.clientUnitIds,
    );
    return snapshotResult(userId, payload.sessionId);
  },

  "cooking.removeSessionUnit": async (userId, _entityId, rawPayload) => {
    const { sessionId, unitId } = removeSessionUnitSchema.parse(rawPayload);
    await cookingService.removeSessionUnit(userId, sessionId, unitId);
    return snapshotResult(userId, sessionId);
  },

  "cooking.restoreSessionUnit": async (userId, _entityId, rawPayload) => {
    const { sessionId, unitId } = restoreSessionUnitSchema.parse(rawPayload);
    await cookingService.restoreSessionUnit(userId, sessionId, unitId);
    return snapshotResult(userId, sessionId);
  },

  "cooking.reorderSessionUnits": async (userId, _entityId, rawPayload) => {
    const { sessionId, orderedUnitIds } = reorderSessionUnitsSchema.parse(rawPayload);
    await cookingService.reorderSessionUnits(userId, sessionId, orderedUnitIds);
    return snapshotResult(userId, sessionId);
  },

  "cooking.endSession": async (userId, _entityId, rawPayload) => {
    const { sessionId, outcome } = endCookingSessionSchema.parse(rawPayload);
    await cookingService.endCookingSession(userId, sessionId, outcome);
    return snapshotResult(userId, sessionId);
  },

  "cooking.toggleChecklistItem": async (userId, _entityId, rawPayload) => {
    const { sessionId, itemId, checked } = toggleChecklistItemSchema.parse(rawPayload);
    await cookingService.toggleChecklistItem(userId, sessionId, itemId, checked);
    return snapshotResult(userId, sessionId);
  },

  "cooking.setUnitCompletion": async (userId, _entityId, rawPayload) => {
    const { sessionId, unitId, completed } = setUnitCompletionSchema.parse(rawPayload);
    await cookingService.setUnitCompletion(userId, sessionId, unitId, completed);
    return snapshotResult(userId, sessionId);
  },

  "cooking.updateSessionScale": async (userId, _entityId, rawPayload) => {
    const { sessionId, scaleFactor } = updateSessionScaleSchema.parse(rawPayload);
    await cookingService.updateSessionScale(userId, sessionId, scaleFactor);
    return snapshotResult(userId, sessionId);
  },

  "cooking.updateUnitScale": async (userId, _entityId, rawPayload) => {
    const { sessionId, unitId, scaleFactor } = updateUnitScaleSchema.parse(rawPayload);
    await cookingService.updateUnitScale(userId, sessionId, unitId, scaleFactor);
    return snapshotResult(userId, sessionId);
  },

  "cooking.createTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, unitId, name, durationSeconds } = createTimerSchema.parse(rawPayload);
    await cookingService.createTimer(userId, sessionId, unitId, name, durationSeconds);
    return snapshotResult(userId, sessionId);
  },

  "cooking.renameTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, timerId, name } = renameTimerSchema.parse(rawPayload);
    await cookingService.renameTimer(userId, sessionId, timerId, name);
    return snapshotResult(userId, sessionId);
  },

  "cooking.startTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, timerId } = timerIdSchema.parse(rawPayload);
    await cookingService.startTimer(userId, sessionId, timerId);
    return snapshotResult(userId, sessionId);
  },

  "cooking.pauseTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, timerId } = timerIdSchema.parse(rawPayload);
    await cookingService.pauseTimer(userId, sessionId, timerId);
    return snapshotResult(userId, sessionId);
  },

  "cooking.resetTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, timerId } = timerIdSchema.parse(rawPayload);
    await cookingService.resetTimer(userId, sessionId, timerId);
    return snapshotResult(userId, sessionId);
  },

  "cooking.adjustTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, timerId, deltaSeconds } = adjustTimerSchema.parse(rawPayload);
    await cookingService.adjustTimer(userId, sessionId, timerId, deltaSeconds);
    return snapshotResult(userId, sessionId);
  },

  "cooking.dismissTimer": async (userId, _entityId, rawPayload) => {
    const { sessionId, timerId } = timerIdSchema.parse(rawPayload);
    await cookingService.dismissTimer(userId, sessionId, timerId);
    return snapshotResult(userId, sessionId);
  },

  "cooking.updateNotes": async (userId, _entityId, rawPayload) => {
    const { sessionId, cookingNotes } = updateCookingNotesSchema.parse(rawPayload);
    await reviewService.updateCookingNotes(userId, sessionId, cookingNotes);
    return snapshotResult(userId, sessionId);
  },

  "cooking.saveReview": async (userId, _entityId, rawPayload) => {
    const input = saveSessionReviewSchema.parse(rawPayload);
    await reviewService.saveSessionReview(userId, input);
    return snapshotResult(userId, input.sessionId);
  },
};

/**
 * Only IN_PROGRESS sessions replicate for offline bootstrap — a Recipe/Part
 * has (per the app's own partial-unique-index guard) at most one active
 * session at a time, so this is cheap regardless of how many Dishes a user
 * has cooked historically. A completed/ended session's Review/history pages
 * are out of this pass's offline scope (same "requires connection for deep
 * history" boundary as Dishes' version-history/compare pages) — opening one
 * while offline shows the standard offline-unavailable message rather than
 * a cached copy.
 */
export async function listAllCookingSessionSnapshots(userId: string) {
  const sessions = await prisma.cookingSession.findMany({
    where: { ownerId: userId, state: "IN_PROGRESS" },
    select: { id: true },
  });
  return Promise.all(sessions.map((s) => snapshotResult(userId, s.id)));
}
