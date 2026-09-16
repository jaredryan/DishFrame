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
    Pick<QueuedMutation, "lastError" | "terminal" | "attempts" | "lastAttemptAt">
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

/** Already in `createdAt` order (the underlying index is sorted) — the
 * drain loop in `sync-engine.ts` is responsible for not parallelizing
 * mutations that touch the same entity, so they always apply in the order
 * they were queued. */
export async function listPendingMutations(): Promise<QueuedMutation[]> {
  const all = await listMutations();
  return all.filter(
    (m) => (m.status === "pending" || m.status === "failed") && !m.terminal,
  );
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
