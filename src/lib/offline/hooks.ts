"use client";

import * as React from "react";
import { getSyncStatusSummary } from "@/lib/offline/queue";
import { onSyncActivity, drainQueue } from "@/lib/offline/sync-engine";
import {
  getEntity,
  listAllConflicts,
  listMutations,
  listMutationsByEntity,
  deleteEntity,
} from "@/lib/offline/db";
import { runIncrementalPull, retryMutation } from "@/lib/offline/sync-engine";
import type {
  EntityRecord,
  EntityType,
  QueuedMutation,
  SyncStatusSummary,
} from "@/lib/offline/types";

const EMPTY_SUMMARY: SyncStatusSummary = { pending: 0, syncing: 0, failed: 0, conflict: 0 };

/** Live sync-queue status for the small status indicator (offline plan
 * §5.5) — re-reads on every queue mutation via `onSyncActivity`, and kicks
 * a drain attempt on mount so a page opened after reconnecting doesn't
 * just sit on a stale "pending" count. */
export function useSyncStatus(): SyncStatusSummary {
  const [summary, setSummary] = React.useState<SyncStatusSummary>(EMPTY_SUMMARY);

  React.useEffect(() => {
    let cancelled = false;
    function refresh() {
      void getSyncStatusSummary().then((next) => {
        if (!cancelled) setSummary(next);
      });
    }
    refresh();
    const unsubscribe = onSyncActivity(refresh);
    void drainQueue();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return summary;
}

/** Every queued mutation, live — used by the conflict/failed-mutation
 * surfaces that need more than a count (e.g. "which sessions have a
 * conflict, and what should I show for each"). */
export function useQueuedMutations(): QueuedMutation[] {
  const [mutations, setMutations] = React.useState<QueuedMutation[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    function refresh() {
      void listMutations().then((next) => {
        if (!cancelled) setMutations(next);
      });
    }
    refresh();
    const unsubscribe = onSyncActivity(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return mutations;
}

/** Every locally-conflicted entity, live — backs the app-wide conflict
 * resolution surface. */
export function useConflicts(): EntityRecord[] {
  const [conflicts, setConflicts] = React.useState<EntityRecord[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    function refresh() {
      void listAllConflicts().then((next) => {
        if (!cancelled) setConflicts(next);
      });
    }
    refresh();
    const unsubscribe = onSyncActivity(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return conflicts;
}

/** Resolution actions for one conflicted entity — "keep mine" discards the
 * server's conflicting copy and re-queues the local doc as a fresh
 * mutation (letting the user's own change win on the next sync attempt);
 * "discard mine" drops the local doc/conflict outright and re-pulls the
 * server's version. Deliberately simple (no field-level merge UI) — see
 * docs/OFFLINE_IMPLEMENTATION_PLAN.md §6.1: "do not build a complex
 * collaborative real-time merge system." */
export function useConflictResolution() {
  async function discardMine(record: EntityRecord) {
    await deleteEntity(record.entityType, record.id);
    await runIncrementalPull().catch(() => {});
  }
  /** Retries the conflicted mutation(s) queued against this entity — the
   * server's own logic (e.g. `dishes.editDish`'s `baseVersionId` check)
   * still gets the final say, so this can conflict again if the server
   * side moved further in the meantime; it isn't a forced overwrite. */
  async function keepMine(record: EntityRecord) {
    const mutations = await listMutationsByEntity(record.entityType, record.id);
    for (const mutation of mutations) {
      await retryMutation(mutation.mutationId);
    }
  }
  return { discardMine, keepMine };
}

/** Live local-replica read for one entity — re-reads whenever the sync
 * engine reports activity, so a component showing "conflict" / "pending"
 * state for a specific Dish/Session/etc. doesn't need its own polling. */
export function useLocalEntity<TDoc>(
  entityType: EntityType,
  id: string | null,
): EntityRecord<TDoc> | undefined {
  const [record, setRecord] = React.useState<EntityRecord<TDoc> | undefined>(undefined);

  React.useEffect(() => {
    if (!id) {
      setRecord(undefined);
      return;
    }
    let cancelled = false;
    function refresh() {
      void getEntity<TDoc>(entityType, id!).then((next) => {
        if (!cancelled) setRecord(next);
      });
    }
    refresh();
    const unsubscribe = onSyncActivity(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [entityType, id]);

  return record;
}
