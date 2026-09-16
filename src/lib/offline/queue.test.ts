import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { deleteDb } from "@/lib/offline/db";
import {
  enqueueMutation,
  getSyncStatusSummary,
  hasExceededRetryBudget,
  isRetryDue,
  listPendingMutations,
  markMutationStatus,
  nextRetryDelayMs,
  removeMutation,
} from "@/lib/offline/queue";

describe("offline/queue", () => {
  afterEach(async () => {
    await deleteDb();
  });

  it("enqueues a mutation with sane defaults", async () => {
    const mutation = await enqueueMutation({
      entityType: "cookingSession",
      entityId: "session-1",
      op: "cooking.toggleChecklistItem",
      payload: { itemId: "item-1", checked: true },
    });
    expect(mutation.status).toBe("pending");
    expect(mutation.attempts).toBe(0);
    expect(mutation.terminal).toBe(false);
  });

  it("reuses a caller-supplied mutationId (the idempotency-key convention)", async () => {
    const mutation = await enqueueMutation({
      mutationId: "dish-edit:dish-1",
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: {},
    });
    expect(mutation.mutationId).toBe("dish-edit:dish-1");
  });

  it("a second enqueue with the same mutationId replaces the first (coalescing offline edits)", async () => {
    await enqueueMutation({
      mutationId: "dish-edit:dish-1",
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: { title: "First draft" },
    });
    await enqueueMutation({
      mutationId: "dish-edit:dish-1",
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: { title: "Final draft" },
    });

    const pending = await listPendingMutations();
    expect(pending).toHaveLength(1);
    expect(pending[0].payload).toEqual({ title: "Final draft" });
  });

  it("listPendingMutations excludes terminal mutations", async () => {
    await enqueueMutation({
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: {},
    });
    const failed = await enqueueMutation({
      entityType: "dish",
      entityId: "dish-2",
      op: "dish.edit",
      payload: {},
    });
    await markMutationStatus(failed.mutationId, "failed", { terminal: true });

    const pending = await listPendingMutations();
    expect(pending.map((m) => m.entityId)).toEqual(["dish-1"]);
  });

  it("getSyncStatusSummary counts by status, excluding terminal failures from the failed count", async () => {
    const a = await enqueueMutation({ entityType: "dish", entityId: "a", op: "dish.edit", payload: {} });
    const b = await enqueueMutation({ entityType: "dish", entityId: "b", op: "dish.edit", payload: {} });
    await markMutationStatus(a.mutationId, "syncing");
    await markMutationStatus(b.mutationId, "failed", { terminal: true });

    const summary = await getSyncStatusSummary();
    expect(summary).toEqual({ pending: 0, syncing: 1, failed: 0, conflict: 0 });
  });

  it("removeMutation deletes it from the queue", async () => {
    const mutation = await enqueueMutation({
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: {},
    });
    await removeMutation(mutation.mutationId);
    expect(await listPendingMutations()).toHaveLength(0);
  });

  it("hasExceededRetryBudget is true once attempts reaches the cap", () => {
    expect(hasExceededRetryBudget({ attempts: 7 } as never)).toBe(false);
    expect(hasExceededRetryBudget({ attempts: 8 } as never)).toBe(true);
  });

  it("nextRetryDelayMs grows exponentially and caps at 5 minutes", () => {
    expect(nextRetryDelayMs(0)).toBe(1000);
    expect(nextRetryDelayMs(1)).toBe(2000);
    expect(nextRetryDelayMs(10)).toBe(5 * 60_000);
  });

  it("isRetryDue is true immediately for a never-attempted mutation, false until backoff elapses", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const fresh = { attempts: 0, lastAttemptAt: null } as never;
    expect(isRetryDue(fresh, now)).toBe(true);

    const justFailed = {
      attempts: 1,
      lastAttemptAt: new Date(now - 500).toISOString(),
    } as never;
    expect(isRetryDue(justFailed, now)).toBe(false);

    const longAgo = {
      attempts: 1,
      lastAttemptAt: new Date(now - 5000).toISOString(),
    } as never;
    expect(isRetryDue(longAgo, now)).toBe(true);
  });
});
