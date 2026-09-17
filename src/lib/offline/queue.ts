"use client";

import { deleteMutation, listMutations, putMutation } from "@/lib/offline/db";
import { generateClientId } from "@/lib/offline/ids";
import type {
  EntityType,
  MutationStatus,
  QueuedMutation,
  SyncStatusSummary,
} from "@/lib/offline/types";

const MAX_ATTEMPTS = 8;

/** Queues a mutation for later replay against `/api/sync/*`. `mutationId`
 * defaults to a fresh client id, but a caller that creates a row should
 * pass that row's own client-generated id instead — see `ids.ts`'s doc
 * comment: the sync route's idempotency-receipt lookup is what makes a
 * retried mutation safe to apply twice, and reusing the entity's own id as
 * the mutation id gives creates a second, redundant safety net. */
export async function enqueueMutation(input: {
  mutationId?: string;
  entityType: EntityType;
  entityId: string;
  op: string;
  payload: unknown;
}): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    mutationId: input.mutationId ?? generateClientId(),
    entityType: input.entityType,
    entityId: input.entityId,
    op: input.op,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    status: "pending",
    lastError: null,
    terminal: false,
  };
  await putMutation(mutation);
  return mutation;
}

export async function markMutationStatus(
  mutationId: string,
  status: MutationStatus,
  patch?: Partial<
    Pick<
      QueuedMutation,
      "lastError" | "terminal" | "attempts" | "lastAttemptAt"
    >
  >,
): Promise<void> {
  const all = await listMutations();
  const existing = all.find((m) => m.mutationId === mutationId);
  if (!existing) return;
  await putMutation({ ...existing, status, ...patch });
}

export async function removeMutation(mutationId: string): Promise<void> {
  await deleteMutation(mutationId);
}

/**
 * A deliberate "try again" retry (the conflict dialog's "Keep my change")
 * must re-evaluate the mutation against the server's *current* state, not
 * replay the outcome from the attempt that conflicted. `SyncMutationReceipt`
 * (`offline-sync/http.ts`) is keyed by `mutationId` and replays a stored
 * outcome verbatim on any request reusing it — correct for an ambiguous
 * network retry (the whole point of the idempotency ledger), wrong here:
 * resetting the same queued mutation's status back to "pending"
 * (`markMutationStatus`, the old behavior) would resend the identical
 * `mutationId` and the server would just hand back the same stored 409
 * forever. Minting a fresh id makes this an honest new attempt.
 */
export async function requeueWithFreshMutationId(
  mutationId: string,
): Promise<QueuedMutation | null> {
  const all = await listMutations();
  const existing = all.find((m) => m.mutationId === mutationId);
  if (!existing) return null;
  await deleteMutation(existing.mutationId);
  return enqueueMutation({
    entityType: existing.entityType,
    entityId: existing.entityId,
    op: existing.op,
    payload: existing.payload,
  });
}

/**
 * How long a mutation may sit `"syncing"` before a stalled or abandoned
 * direct attempt is treated as dead and made eligible for an ordinary
 * drain again. `mutate.ts`'s `runOrQueueMutation` marks a mutation
 * `"syncing"` (with a fresh `lastAttemptAt`) for the duration of its own
 * direct `/api/sync/*` attempt, specifically so `drainQueue` can't also
 * send the *same* mutation while that attempt is still in flight. A
 * genuine in-flight attempt always clears the mark itself (success,
 * terminal failure, or falling back to "queued" — see `mutate.ts`); this
 * lease only matters when that never happens, i.e. the page was torn down
 * mid-request. Long enough that a live, slow request is never mistaken for
 * abandoned; short enough that an interrupted one recovers promptly on
 * the next drain trigger. `public/sw.js`'s `backgroundDrain` mirrors this
 * same threshold for its own eligibility check.
 */
const DIRECT_ATTEMPT_LEASE_MS = 20_000;

function isSyncingLeaseExpired(mutation: QueuedMutation, now: number): boolean {
  if (!mutation.lastAttemptAt) return true;
  return (
    now - new Date(mutation.lastAttemptAt).getTime() >= DIRECT_ATTEMPT_LEASE_MS
  );
}

/** Already in `createdAt` order (the underlying index is sorted) — the
 * drain loop in `sync-engine.ts` is responsible for not parallelizing
 * mutations that touch the same entity, so they always apply in the order
 * they were queued.
 *
 * A `"syncing"` mutation is included only once its lease has expired (see
 * `DIRECT_ATTEMPT_LEASE_MS`) — while the lease still holds, a concurrent
 * `runOrQueueMutation` direct attempt owns it and a drain must not also
 * send it. */
export async function listPendingMutations(): Promise<QueuedMutation[]> {
  const all = await listMutations();
  const now = Date.now();
  return all.filter((m) => {
    if (m.terminal) return false;
    if (m.status === "pending" || m.status === "failed") return true;
    return m.status === "syncing" && isSyncingLeaseExpired(m, now);
  });
}

export async function getSyncStatusSummary(): Promise<SyncStatusSummary> {
  const all = await listMutations();
  return {
    pending: all.filter((m) => m.status === "pending").length,
    syncing: all.filter((m) => m.status === "syncing").length,
    failed: all.filter((m) => m.status === "failed" && !m.terminal).length,
    conflict: all.filter((m) => m.status === "conflict").length,
  };
}

export function hasExceededRetryBudget(mutation: QueuedMutation): boolean {
  return mutation.attempts >= MAX_ATTEMPTS;
}

/** Exponential backoff, capped at 5 minutes — used by the drain loop to
 * skip a mutation that failed recently rather than hammering the network
 * on every foreground-recovery/Background-Sync tick. */
export function nextRetryDelayMs(attempts: number): number {
  return Math.min(5 * 60_000, 1000 * 2 ** attempts);
}

export function isRetryDue(mutation: QueuedMutation, now: number): boolean {
  if (mutation.attempts === 0 || !mutation.lastAttemptAt) return true;
  return (
    now - new Date(mutation.lastAttemptAt).getTime() >=
    nextRetryDelayMs(mutation.attempts - 1)
  );
}
