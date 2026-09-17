"use client";

import {
  getEntity,
  putEntity,
  pruneEntitiesNotIn,
  getMeta,
  setMeta,
} from "@/lib/offline/db";
import {
  listPendingMutations,
  markMutationStatus,
  removeMutation,
  requeueWithFreshMutationId,
  hasExceededRetryBudget,
  isRetryDue,
} from "@/lib/offline/queue";
import type {
  BootstrapResponse,
  EntityRecord,
  EntityType,
  QueuedMutation,
  SyncApplyResult,
} from "@/lib/offline/types";

/** Maps an op's namespace ("dish.edit" -> "dish") to the `/api/sync/*`
 * route that applies it — one route per domain, mirroring the existing
 * per-domain service/action file layout rather than one generic CRUD
 * endpoint. */
const OP_NAMESPACE_TO_ENDPOINT: Record<string, string> = {
  dish: "/api/sync/dishes",
  cooking: "/api/sync/cooking",
  mealplan: "/api/sync/mealplans",
  grocery: "/api/sync/grocery",
};

function endpointForOp(op: string): string {
  const namespace = op.split(".")[0];
  const endpoint = OP_NAMESPACE_TO_ENDPOINT[namespace];
  if (!endpoint) throw new Error(`No sync endpoint registered for op "${op}".`);
  return endpoint;
}

/** Entity types `/api/sync/bootstrap` always returns a full snapshot of
 * (see that route) — deletion-reconciled below even when the snapshot's
 * count for one of these is zero. `importDraft` is deliberately excluded:
 * it's purely local/offline-created and never appears in a bootstrap
 * response, so it must never be pruned by this mechanism. */
const RECONCILABLE_ENTITY_TYPES: EntityType[] = [
  "dish",
  "cookingSession",
  "mealPlan",
  "groceryList",
  "referenceData",
];

let draining = false;
let drainAgainRequested = false;
const listeners = new Set<() => void>();

export function onSyncActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

/** Exported so `mutate.ts` can notify subscribers (e.g.
 * `CookingModeOfflineBoundary`) immediately after writing an optimistic
 * local-replica update — not only after a queue drain. */
export function notifySyncActivity() {
  notify();
}

async function applyMutation(
  mutation: QueuedMutation,
): Promise<SyncApplyResult> {
  const endpoint = endpointForOp(mutation.op);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mutationId: mutation.mutationId,
      op: mutation.op,
      entityId: mutation.entityId,
      payload: mutation.payload,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    return {
      status: "error",
      message: "You're signed out — sign in to sync this change.",
      terminal: true,
    };
  }
  if (response.status === 404) {
    const body = await response.json().catch(() => null);
    return {
      status: "error",
      message: body?.message ?? "This no longer exists on the server.",
      terminal: true,
    };
  }
  if (response.status === 409) {
    const body = await response.json().catch(() => null);
    return {
      status: "conflict",
      message:
        body?.message ??
        "This changed elsewhere before your offline change could sync.",
      serverDoc: body?.serverDoc,
    };
  }
  if (response.status === 422 || response.status === 400) {
    const body = await response.json().catch(() => null);
    return {
      status: "error",
      message: body?.message ?? "This change couldn't be saved.",
      terminal: true,
    };
  }
  if (!response.ok) {
    return {
      status: "error",
      message: `Sync failed (${response.status}).`,
      terminal: false,
    };
  }
  return (await response.json()) as SyncApplyResult;
}

async function reconcileEntityAfterSync(
  entityType: EntityType,
  entityId: string,
  result: Extract<SyncApplyResult, { status: "applied" | "already-applied" }>,
  remainingMutationsForEntity: number,
): Promise<void> {
  const existing = await getEntity(entityType, entityId);
  if (!existing && result.snapshot === undefined) return;
  await putEntity<unknown>({
    entityType,
    id: entityId,
    doc: result.snapshot ?? existing?.doc,
    serverRevision: result.serverRevision,
    localUpdatedAt: new Date().toISOString(),
    // Only clear dirty once nothing else touching this entity is still
    // queued behind it — otherwise a later mutation's own eventual sync
    // would incorrectly look "clean" the instant this one landed.
    dirty: remainingMutationsForEntity > 0,
    conflict: null,
  } as EntityRecord<unknown>);
}

async function markEntityConflict(
  entityType: EntityType,
  entityId: string,
  message: string,
  serverDoc: unknown,
): Promise<void> {
  const existing = await getEntity(entityType, entityId);
  if (!existing) return;
  await putEntity<unknown>({
    ...existing,
    conflict: {
      kind: "field-conflict",
      message,
      detectedAt: new Date().toISOString(),
      serverDoc,
    },
  } as EntityRecord<unknown>);
}

/**
 * Drains every pending/retry-eligible mutation, one at a time and in
 * queued order, stopping a given entity's remaining mutations on its first
 * failure/conflict so a later mutation never applies out of order against
 * an entity whose earlier mutation didn't land. Safe to call repeatedly —
 * re-entrant calls coalesce into one more pass after the current one
 * finishes rather than running in parallel.
 */
export async function drainQueue(): Promise<void> {
  if (draining) {
    drainAgainRequested = true;
    return;
  }
  draining = true;
  try {
    do {
      drainAgainRequested = false;
      const pending = await listPendingMutations();
      const now = Date.now();
      const blockedEntities = new Set<string>();

      for (const mutation of pending) {
        const entityKey = `${mutation.entityType}:${mutation.entityId}`;
        if (blockedEntities.has(entityKey)) continue;
        if (!isRetryDue(mutation, now)) continue;

        await markMutationStatus(mutation.mutationId, "syncing", {
          lastAttemptAt: new Date(now).toISOString(),
        });
        notify();

        let result: SyncApplyResult;
        try {
          result = await applyMutation(mutation);
        } catch (error) {
          result = {
            status: "error",
            message: error instanceof Error ? error.message : "Network error.",
            terminal: false,
          };
        }

        if (
          result.status === "applied" ||
          result.status === "already-applied"
        ) {
          await removeMutation(mutation.mutationId);
          const remaining = (await listPendingMutations()).filter(
            (m) =>
              m.entityType === mutation.entityType &&
              m.entityId === mutation.entityId,
          ).length;
          await reconcileEntityAfterSync(
            mutation.entityType,
            mutation.entityId,
            result,
            remaining,
          );
        } else if (result.status === "conflict") {
          await markEntityConflict(
            mutation.entityType,
            mutation.entityId,
            result.message,
            result.serverDoc,
          );
          await markMutationStatus(mutation.mutationId, "conflict", {
            lastError: result.message,
            terminal: true,
          });
          blockedEntities.add(entityKey);
        } else if (result.status === "error") {
          const attempts = mutation.attempts + 1;
          const terminal =
            result.terminal ||
            hasExceededRetryBudget({ ...mutation, attempts });
          await markMutationStatus(
            mutation.mutationId,
            terminal ? "failed" : "pending",
            {
              lastError: result.message,
              terminal,
              attempts,
            },
          );
          blockedEntities.add(entityKey);
        }
        notify();
      }
    } while (drainAgainRequested);
  } finally {
    draining = false;
  }
}

/**
 * Explicit retry for a single failed/conflicted mutation (the conflict
 * dialog's "Keep my change" — this function's only caller,
 * `useConflictResolution`'s `keepMine`). Mints a fresh mutation id rather
 * than resetting this one's status: `SyncMutationReceipt` is keyed by
 * `mutationId` and replays a stored outcome verbatim, so resending the
 * same id would just replay the same stored 409 conflict forever instead
 * of re-evaluating the mutation against the server's current state.
 */
export async function retryMutation(mutationId: string): Promise<void> {
  await requeueWithFreshMutationId(mutationId);
  await drainQueue();
}

// --- Bootstrap / incremental pull --------------------------------------

const SYNC_CURSOR_KEY = "sync:cursor";
const BOOTSTRAP_DONE_KEY = "sync:bootstrapped";

async function applyServerSnapshot(
  entities: BootstrapResponse["entities"],
  requestedBefore?: string,
): Promise<void> {
  for (const item of entities) {
    const existing = await getEntity(item.entityType, item.id);
    // Never clobber a locally-dirty (unsynced) entity with a server
    // snapshot — its own queued mutation is what will reconcile it once it
    // syncs; overwriting it here would silently discard the local edit.
    if (existing?.dirty) continue;
    // Same staleness hazard `pruneEntitiesNotIn` guards against: this
    // snapshot reflects server state as of `requestedBefore`, so a locally
    // confirmed write newer than that (already synced, so no longer dirty)
    // must win over this slower, older response rather than being reverted
    // by it.
    if (
      requestedBefore &&
      existing &&
      existing.localUpdatedAt >= requestedBefore
    ) {
      continue;
    }

    if (item.deleted) {
      const { deleteEntity } = await import("@/lib/offline/db");
      await deleteEntity(item.entityType, item.id);
      continue;
    }
    await putEntity({
      entityType: item.entityType,
      id: item.id,
      doc: item.doc,
      serverRevision: item.serverRevision,
      localUpdatedAt: new Date().toISOString(),
      dirty: false,
      conflict: null,
    });
  }
}

/** Full account snapshot — run once on first authenticated load (or when
 * no cursor is stored yet, e.g. after an account-switch wipe). Also the
 * only point deletions reconcile for entity types the server can't
 * cheaply diff incrementally (see `/api/sync/bootstrap`'s per-domain
 * comments): anything currently in the replica that ISN'T in this full
 * snapshot for a type flagged `reconcileDeletes` was deleted server-side
 * while this device wasn't watching. */
export async function runBootstrapSync(): Promise<void> {
  // Captured before the request goes out: `keepIds` below reflects server
  // state as of this moment, not when the response happens to arrive. A
  // concurrent local mutation (e.g. a dish created while this fetch is
  // in flight — see `pruneEntitiesNotIn`'s doc comment) can otherwise be
  // wrongly pruned once this slower, stale snapshot resolves.
  const requestedAt = new Date().toISOString();
  const response = await fetch("/api/sync/bootstrap");
  if (!response.ok)
    throw new Error(`Bootstrap sync failed (${response.status}).`);
  const body: BootstrapResponse = await response.json();
  await applyServerSnapshot(body.entities, requestedAt);

  const byType = new Map<EntityType, Set<string>>(
    RECONCILABLE_ENTITY_TYPES.map((entityType) => [entityType, new Set()]),
  );
  for (const item of body.entities) {
    if (item.deleted) continue;
    byType.get(item.entityType)?.add(item.id);
  }
  for (const [entityType, ids] of byType) {
    await pruneEntitiesNotIn(entityType, ids, requestedAt);
  }

  await setMeta(SYNC_CURSOR_KEY, body.syncedAt);
  await setMeta(BOOTSTRAP_DONE_KEY, true);
  notify();
}

/** Incremental refresh — cheap, called on every app foreground/focus once
 * a full bootstrap has already run. */
export async function runIncrementalPull(): Promise<void> {
  const cursor = await getMeta<string>(SYNC_CURSOR_KEY);
  if (!cursor) {
    await runBootstrapSync();
    return;
  }
  const requestedAt = new Date().toISOString();
  const response = await fetch(
    `/api/sync/pull?since=${encodeURIComponent(cursor)}`,
  );
  if (!response.ok)
    throw new Error(`Incremental sync failed (${response.status}).`);
  const body: BootstrapResponse = await response.json();
  await applyServerSnapshot(body.entities, requestedAt);
  await setMeta(SYNC_CURSOR_KEY, body.syncedAt);
  notify();
}

export async function hasBootstrapped(): Promise<boolean> {
  return Boolean(await getMeta<boolean>(BOOTSTRAP_DONE_KEY));
}

// --- Triggers: foreground recovery + Background Sync ---------------------

const BACKGROUND_SYNC_TAG = "dishframe-sync";
let triggersRegistered = false;

/** Wires the two drain triggers the plan requires: an `online`/`focus`/
 * `visibilitychange` listener (foreground recovery, every browser) plus
 * Background Sync registration where supported (Chromium). Both call the
 * exact same `drainQueue`, so behavior never bifurcates by browser — only
 * the trigger differs. Safe to call multiple times; only registers once
 * per page load. */
export function registerSyncTriggers(): void {
  if (triggersRegistered || typeof window === "undefined") return;
  triggersRegistered = true;

  const kick = () => {
    void runIncrementalPull().catch(() => {});
    void drainQueue();
  };

  window.addEventListener("online", kick);
  window.addEventListener("focus", kick);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void drainQueue();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then(async (registration) => {
        const syncManager = (
          registration as ServiceWorkerRegistration & {
            sync?: { register(tag: string): Promise<void> };
          }
        ).sync;
        if (syncManager) {
          try {
            await syncManager.register(BACKGROUND_SYNC_TAG);
          } catch {
            // Background Sync registration can fail (permission, browser
            // policy) — foreground recovery above still covers it.
          }
        }
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "dishframe:drain-sync-queue") {
            void drainQueue();
          }
        });
      })
      .catch(() => {});
  }
}
