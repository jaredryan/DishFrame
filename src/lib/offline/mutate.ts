"use client";

import { generateClientId } from "@/lib/offline/ids";
import {
  enqueueMutation,
  markMutationStatus,
  removeMutation,
} from "@/lib/offline/queue";
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
  | { ok: true; queued: false; snapshot: unknown; meta?: unknown }
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

  // Queued *before* attempting the direct online call, not only in the
  // caught-network-error fallback below: a hard navigation (or tab close)
  // that lands mid-fetch simply tears down this call's JS execution — no
  // exception is ever thrown, so the old "queue only on a caught error"
  // structure left the optimistic write above stranded `dirty` forever,
  // with no queued entry for any later drain to retry. This queued row is
  // exactly that recovery path; every outcome this call itself observes
  // below removes it again, so only a genuinely interrupted attempt ever
  // rides on it into a later drain.
  await enqueueMutation({
    mutationId,
    entityType: input.entityType,
    entityId: input.entityId,
    op: input.op,
    payload: input.payload,
  });

  const endpoint = OP_NAMESPACE_TO_ENDPOINT[input.op.split(".")[0]];
  const isOffline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (!isOffline && endpoint) {
    // Leases the row for the duration of this direct attempt (see
    // `queue.ts`'s `DIRECT_ATTEMPT_LEASE_MS`) — `listPendingMutations`
    // excludes a `"syncing"` row until its lease expires, so a concurrent
    // `drainQueue()` (another mutation's fallback, a 'focus'/'online'
    // trigger firing mid-request, Background Sync) can't also send this
    // exact mutation while this fetch is still outstanding. Every branch
    // below either removes the row or — on a genuine network error —
    // releases the lease back to `"pending"` so the very next trigger can
    // retry immediately; if none of that runs because the page was torn
    // down first, the lease simply expires on its own and a later drain
    // picks it up.
    await markMutationStatus(mutationId, "syncing", {
      lastAttemptAt: new Date().toISOString(),
    });
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
        if (
          result.status === "applied" ||
          result.status === "already-applied"
        ) {
          await putEntity({
            entityType: input.entityType,
            id: input.entityId,
            doc: result.snapshot ?? optimisticDoc,
            serverRevision: result.serverRevision,
            localUpdatedAt: new Date().toISOString(),
            dirty: false,
            conflict: null,
          });
          await removeMutation(mutationId);
          notifySyncActivity();
          return {
            ok: true,
            queued: false,
            snapshot: result.snapshot,
            meta: result.meta,
          };
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
          // Handled directly (the conflict marker above) — leaving this
          // queued would just retry the same stale `baseRevision` and hit
          // the same conflict again on every future drain.
          await removeMutation(mutationId);
          return { ok: false, message: result.message };
        }
        if (result.status === "error") {
          // An application-level error response (distinct from the caught
          // network-error branch below, which is what genuinely gets
          // queued for retry) is handled the moment it's received — the
          // server told us, at the HTTP/application level, this exact
          // request didn't succeed. Surface it directly rather than
          // silently retrying it.
          await removeMutation(mutationId);
          return { ok: false, message: result.message };
        }
        await removeMutation(mutationId);
        return { ok: false, message: "Sync failed." };
      }
      // A non-network HTTP failure (validation, auth, etc.) — don't leave
      // something the server has already told us is invalid queued for a
      // pointless retry; surface it directly.
      const body = await response.json().catch(() => null);
      await removeMutation(mutationId);
      return {
        ok: false,
        message: body?.message ?? `Request failed (${response.status}).`,
      };
    } catch (error) {
      if (!isNetworkError(error)) {
        await removeMutation(mutationId).catch(() => {});
        throw error;
      }
      // Genuine network failure while "online" per navigator.onLine — the
      // mutation is already queued above, but still leased `"syncing"`.
      // Release it back to `"pending"` (rather than waiting out
      // `DIRECT_ATTEMPT_LEASE_MS`) so the offline fallback below, or the
      // very next foreground/online trigger, can retry it right away.
      await markMutationStatus(mutationId, "pending", { lastAttemptAt: null });
    }
  }

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
