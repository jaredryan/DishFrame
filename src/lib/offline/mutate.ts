"use client";

import { generateClientId } from "@/lib/offline/ids";
import { enqueueMutation } from "@/lib/offline/queue";
import { drainQueue, notifySyncActivity } from "@/lib/offline/sync-engine";
import { isNetworkError } from "@/lib/offline/network";
import { getEntity, putEntity } from "@/lib/offline/db";
import type { EntityType, SyncApplyResult } from "@/lib/offline/types";

const OP_NAMESPACE_TO_ENDPOINT: Record<string, string> = {
  dish: "/api/sync/dishes",
  cooking: "/api/sync/cooking",
  mealplan: "/api/sync/mealplans",
  grocery: "/api/sync/grocery",
};

export type MutateResult =
  | { ok: true; queued: false; snapshot: unknown }
  | { ok: true; queued: true }
  | { ok: false; message: string };

/**
 * The one call site every offline-capable domain action goes through
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md's stable sync API requirement):
 * tries `/api/sync/*` directly when online, falls back to the local queue
 * on a genuine network failure or when already offline, and — either way —
 * writes the caller's optimistic `doc` into the local replica immediately,
 * so the UI never waits on a round trip to reflect the user's own action.
 *
 * This deliberately replaces calling the domain's Server Action directly
 * for any operation that's in an `/api/sync/*` registry — both paths call
 * the exact same underlying service function, so there's no behavioral
 * difference online, and only one code path needs to handle "this failed,
 * queue it" instead of two.
 */
export async function runOrQueueMutation(input: {
  op: string;
  entityType: EntityType;
  entityId: string;
  payload: unknown;
  /** The optimistic local document to store immediately, before the
   * network call resolves either way — either a full replacement value, or
   * a function patching whatever's currently in the local replica (the
   * common case for a fine-grained mutation like a single checklist
   * toggle, which only has a small delta to apply, not the whole
   * document). */
  optimisticDoc: unknown | ((current: unknown) => unknown);
  /** Reuse this as both the queued-mutation id and (for a create) the
   * entity's own id — see `ids.ts`'s doc comment. Defaults to a fresh id. */
  mutationId?: string;
}): Promise<MutateResult> {
  const mutationId = input.mutationId ?? generateClientId();

  const optimisticDoc = await putOptimistic(
    input.entityType,
    input.entityId,
    input.optimisticDoc,
  );
  notifySyncActivity();

  const endpoint = OP_NAMESPACE_TO_ENDPOINT[input.op.split(".")[0]];
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;

  if (!isOffline && endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mutationId,
          op: input.op,
          entityId: input.entityId,
          payload: input.payload,
        }),
      });
      if (response.ok) {
        const result = (await response.json()) as SyncApplyResult;
        if (result.status === "applied" || result.status === "already-applied") {
          await putEntity({
            entityType: input.entityType,
            id: input.entityId,
            doc: result.snapshot ?? optimisticDoc,
            serverRevision: result.serverRevision,
            localUpdatedAt: new Date().toISOString(),
            dirty: false,
            conflict: null,
          });
          notifySyncActivity();
          return { ok: true, queued: false, snapshot: result.snapshot };
        }
        if (result.status === "conflict") {
          const existing = await getEntity(input.entityType, input.entityId);
          if (existing) {
            await putEntity({
              ...existing,
              conflict: {
                kind: "field-conflict",
                message: result.message,
                detectedAt: new Date().toISOString(),
                serverDoc: result.serverDoc,
              },
            });
          }
          return { ok: false, message: result.message };
        }
        if (result.status === "error") {
          return { ok: false, message: result.message };
        }
        return { ok: false, message: "Sync failed." };
      }
      // A non-network HTTP failure (validation, auth, etc.) — don't queue
      // something the server has already told us is invalid; surface it.
      const body = await response.json().catch(() => null);
      return { ok: false, message: body?.message ?? `Request failed (${response.status}).` };
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      // Fall through to queue below — a genuine network failure while
      // "online" per navigator.onLine still needs the offline fallback.
    }
  }

  await enqueueMutation({
    mutationId,
    entityType: input.entityType,
    entityId: input.entityId,
    op: input.op,
    payload: input.payload,
  });
  void drainQueue();
  return { ok: true, queued: true };
}

async function putOptimistic(
  entityType: EntityType,
  id: string,
  docOrUpdater: unknown | ((current: unknown) => unknown),
): Promise<unknown> {
  const existing = await getEntity(entityType, id);
  const doc =
    typeof docOrUpdater === "function"
      ? (docOrUpdater as (current: unknown) => unknown)(existing?.doc)
      : docOrUpdater;
  await putEntity({
    entityType,
    id,
    doc,
    serverRevision: existing?.serverRevision ?? null,
    localUpdatedAt: new Date().toISOString(),
    dirty: true,
    conflict: null,
  });
  return doc;
}
