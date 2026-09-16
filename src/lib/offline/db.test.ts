import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  deleteDb,
  deleteEntity,
  getEntity,
  getMeta,
  listAllConflicts,
  listEntities,
  listMutations,
  putEntity,
  putMutation,
  pruneEntitiesNotIn,
  setMeta,
} from "@/lib/offline/db";
import type { EntityRecord, QueuedMutation } from "@/lib/offline/types";

function makeEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    entityType: "dish",
    id: "dish-1",
    doc: { title: "Soup" },
    serverRevision: null,
    localUpdatedAt: new Date().toISOString(),
    dirty: false,
    conflict: null,
    ...overrides,
  };
}

function makeMutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    mutationId: "mut-1",
    entityType: "dish",
    entityId: "dish-1",
    op: "dish.edit",
    payload: {},
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    status: "pending",
    lastError: null,
    terminal: false,
    ...overrides,
  };
}

describe("offline/db", () => {
  afterEach(async () => {
    await deleteDb();
  });

  it("round-trips an entity by [entityType, id]", async () => {
    await putEntity(makeEntity());
    const record = await getEntity("dish", "dish-1");
    expect(record?.doc).toEqual({ title: "Soup" });
  });

  it("lists entities by type only", async () => {
    await putEntity(makeEntity({ id: "dish-1" }));
    await putEntity(makeEntity({ id: "dish-2" }));
    await putEntity(makeEntity({ entityType: "mealPlan", id: "plan-1" }));

    const dishes = await listEntities("dish");
    expect(dishes.map((d) => d.id).sort()).toEqual(["dish-1", "dish-2"]);
  });

  it("prunes entities missing from a full snapshot, but never a dirty one", async () => {
    await putEntity(makeEntity({ id: "dish-keep" }));
    await putEntity(makeEntity({ id: "dish-gone" }));
    await putEntity(makeEntity({ id: "dish-dirty-gone", dirty: true }));

    await pruneEntitiesNotIn("dish", new Set(["dish-keep"]));

    const remaining = (await listEntities("dish")).map((d) => d.id).sort();
    expect(remaining).toEqual(["dish-dirty-gone", "dish-keep"]);
  });

  it("finds conflicted entities across every entity type", async () => {
    await putEntity(makeEntity({ id: "dish-1", conflict: null }));
    await putEntity(
      makeEntity({
        entityType: "mealPlan",
        id: "plan-1",
        conflict: {
          kind: "field-conflict",
          message: "changed elsewhere",
          detectedAt: new Date().toISOString(),
        },
      }),
    );

    const conflicts = await listAllConflicts();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe("plan-1");
  });

  it("round-trips a queued mutation and deletes it", async () => {
    await putMutation(makeMutation());
    expect(await listMutations()).toHaveLength(1);
    await deleteEntity("dish", "dish-1"); // unrelated store, should not affect mutations
    expect(await listMutations()).toHaveLength(1);
  });

  it("stores and retrieves meta values", async () => {
    await setMeta("sync:cursor", "2026-01-01T00:00:00.000Z");
    expect(await getMeta("sync:cursor")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("deleteDb wipes entities, mutations, and meta", async () => {
    await putEntity(makeEntity());
    await putMutation(makeMutation());
    await setMeta("sync:cursor", "x");

    await deleteDb();

    expect(await listEntities("dish")).toHaveLength(0);
    expect(await listMutations()).toHaveLength(0);
    expect(await getMeta("sync:cursor")).toBeUndefined();
  });
});
