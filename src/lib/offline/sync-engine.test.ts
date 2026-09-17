import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDb,
  getEntity,
  listMutations,
  putEntity,
} from "@/lib/offline/db";
import { enqueueMutation } from "@/lib/offline/queue";
import { drainQueue, runBootstrapSync } from "@/lib/offline/sync-engine";

describe("offline/sync-engine drainQueue", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteDb();
  });

  it("applies a mutation and writes the returned snapshot into the local replica", async () => {
    await putEntity({
      entityType: "dish",
      id: "dish-1",
      doc: { title: "Draft" },
      serverRevision: null,
      localUpdatedAt: new Date().toISOString(),
      dirty: true,
      conflict: null,
    });
    await enqueueMutation({
      mutationId: "mut-1",
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: { title: "Draft" },
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "applied",
          entityId: "dish-1",
          snapshot: { title: "Draft (synced)" },
          serverRevision: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200 },
      ),
    );

    await drainQueue();

    expect(await listMutations()).toHaveLength(0);
    const record = await getEntity("dish", "dish-1");
    expect(record?.doc).toEqual({ title: "Draft (synced)" });
    expect(record?.dirty).toBe(false);
  });

  it("marks a 409 response as a conflict, without deleting the queued mutation", async () => {
    await putEntity({
      entityType: "dish",
      id: "dish-1",
      doc: { title: "Mine" },
      serverRevision: null,
      localUpdatedAt: new Date().toISOString(),
      dirty: true,
      conflict: null,
    });
    await enqueueMutation({
      mutationId: "mut-1",
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: {},
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "Someone else changed this first." }),
        {
          status: 409,
        },
      ),
    );

    await drainQueue();

    const mutations = await listMutations();
    expect(mutations).toHaveLength(1);
    expect(mutations[0].status).toBe("conflict");
    expect(mutations[0].terminal).toBe(true);

    const record = await getEntity("dish", "dish-1");
    expect(record?.conflict?.message).toBe("Someone else changed this first.");
  });

  it("marks a 404 response terminal (never retried again)", async () => {
    await enqueueMutation({
      mutationId: "mut-1",
      entityType: "cookingSession",
      entityId: "session-1",
      op: "cooking.toggleChecklistItem",
      payload: {},
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "This session no longer exists." }),
        {
          status: 404,
        },
      ),
    );

    await drainQueue();

    const mutations = await listMutations();
    expect(mutations[0].status).toBe("failed");
    expect(mutations[0].terminal).toBe(true);
    expect(mutations[0].lastError).toBe("This session no longer exists.");
  });

  it("a network error leaves the mutation pending for retry, not terminal", async () => {
    await enqueueMutation({
      mutationId: "mut-1",
      entityType: "dish",
      entityId: "dish-1",
      op: "dish.edit",
      payload: {},
    });

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await drainQueue();

    const mutations = await listMutations();
    expect(mutations[0].status).toBe("pending");
    expect(mutations[0].terminal).toBe(false);
    expect(mutations[0].attempts).toBe(1);
  });

  it("stops applying further queued mutations for an entity once one of them conflicts", async () => {
    await enqueueMutation({
      mutationId: "mut-1",
      entityType: "cookingSession",
      entityId: "session-1",
      op: "cooking.toggleChecklistItem",
      payload: {},
      // createdAt ordering matters — enqueue in order.
    });
    await enqueueMutation({
      mutationId: "mut-2",
      entityType: "cookingSession",
      entityId: "session-1",
      op: "cooking.toggleChecklistItem",
      payload: {},
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "This session ended elsewhere." }),
        {
          status: 409,
        },
      ),
    );

    await drainQueue();

    // Only the first mutation's request should have been attempted this pass.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const mutations = await listMutations();
    expect(mutations.find((m) => m.mutationId === "mut-1")?.status).toBe(
      "conflict",
    );
    expect(mutations.find((m) => m.mutationId === "mut-2")?.status).toBe(
      "pending",
    );
  });
});

describe("offline/sync-engine bootstrap", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await deleteDb();
  });

  it("never overwrites a dirty (unsynced) local entity with a bootstrap snapshot", async () => {
    await putEntity({
      entityType: "dish",
      id: "dish-1",
      doc: { title: "My unsynced edit" },
      serverRevision: null,
      localUpdatedAt: new Date().toISOString(),
      dirty: true,
      conflict: null,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          syncedAt: "2026-01-01T00:00:00.000Z",
          entities: [
            {
              entityType: "dish",
              id: "dish-1",
              doc: { title: "Someone else's older version" },
              serverRevision: "2025-12-31T00:00:00.000Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await runBootstrapSync();

    const record = await getEntity("dish", "dish-1");
    expect(record?.doc).toEqual({ title: "My unsynced edit" });
    expect(record?.dirty).toBe(true);
  });

  it("prunes a clean entity missing from a full bootstrap snapshot (server-side deletion)", async () => {
    await putEntity({
      entityType: "dish",
      id: "dish-deleted",
      doc: { title: "Gone" },
      serverRevision: "2025-01-01T00:00:00.000Z",
      localUpdatedAt: new Date().toISOString(),
      dirty: false,
      conflict: null,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ syncedAt: "2026-01-01T00:00:00.000Z", entities: [] }),
        {
          status: 200,
        },
      ),
    );

    await runBootstrapSync();

    expect(await getEntity("dish", "dish-deleted")).toBeUndefined();
  });
});
