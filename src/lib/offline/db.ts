"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { ENTITY_TYPES, type EntityRecord, type EntityType, type QueuedMutation } from "@/lib/offline/types";

/**
 * The local structured-data replica + mutation queue, in one IndexedDB
 * database with one fixed name — not one named per account. See
 * `account-scope.ts` for why: isolation is enforced by wiping this whole
 * database (and every Cache Storage cache) the moment the signed-in account
 * stops matching what a `localStorage` marker remembers, not by keeping
 * every account's data around side-by-side under separate names.
 */
const DB_NAME = "dishframe-offline";
const DB_VERSION = 1;

export const ENTITIES_STORE = "entities";
export const MUTATIONS_STORE = "mutations";
export const META_STORE = "meta";

interface DishFrameOfflineSchema extends DBSchema {
  entities: {
    key: [EntityType, string];
    value: EntityRecord;
    indexes: { byEntityType: EntityType };
  };
  mutations: {
    key: string;
    value: QueuedMutation;
    indexes: { byStatus: string; byCreatedAt: string };
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

let dbPromise: Promise<IDBPDatabase<DishFrameOfflineSchema>> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export function openDb(): Promise<IDBPDatabase<DishFrameOfflineSchema>> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(
      new Error("IndexedDB is not available in this environment."),
    );
  }
  if (dbPromise) return dbPromise;

  dbPromise = openDB<DishFrameOfflineSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(ENTITIES_STORE)) {
        const entities = db.createObjectStore(ENTITIES_STORE, {
          keyPath: ["entityType", "id"],
        });
        entities.createIndex("byEntityType", "entityType");
      }
      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        const mutations = db.createObjectStore(MUTATIONS_STORE, {
          keyPath: "mutationId",
        });
        mutations.createIndex("byStatus", "status");
        mutations.createIndex("byCreatedAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    },
  });

  return dbPromise;
}

/** Deletes the entire local database — used on sign-out, account switch,
 * and account deletion (`account-scope.ts`). Drops the cached connection
 * so a subsequent `openDb()` reopens fresh. */
export async function deleteDb(): Promise<void> {
  if (!isIndexedDbAvailable()) return;
  const existing = dbPromise;
  dbPromise = null;
  try {
    (await existing)?.close();
  } catch {
    // Nothing to close.
  }
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

// --- Entities store ----------------------------------------------------

export async function getEntity<TDoc>(
  entityType: EntityType,
  id: string,
): Promise<EntityRecord<TDoc> | undefined> {
  const db = await openDb();
  return db.get(ENTITIES_STORE, [entityType, id]) as Promise<
    EntityRecord<TDoc> | undefined
  >;
}

export async function putEntity<TDoc>(record: EntityRecord<TDoc>): Promise<void> {
  const db = await openDb();
  await db.put(ENTITIES_STORE, record as EntityRecord);
}

export async function deleteEntity(entityType: EntityType, id: string): Promise<void> {
  const db = await openDb();
  await db.delete(ENTITIES_STORE, [entityType, id]);
}

export async function listEntities<TDoc>(
  entityType: EntityType,
): Promise<EntityRecord<TDoc>[]> {
  const db = await openDb();
  return db.getAllFromIndex(ENTITIES_STORE, "byEntityType", entityType) as Promise<
    EntityRecord<TDoc>[]
  >;
}

/** Removes every locally-replicated entity of the given type not present in
 * `keepIds` — used after a full bootstrap to reconcile server-side
 * deletions (a deletion made elsewhere is only picked up at the next full
 * bootstrap, not on an incremental pull — see `sync-engine.ts`). Never
 * removes an entity with a dirty/unsynced local mutation still pending, so
 * an offline edit is never silently dropped just because the server didn't
 * know about it yet at bootstrap time. */
export async function pruneEntitiesNotIn(
  entityType: EntityType,
  keepIds: Set<string>,
): Promise<void> {
  const all = await listEntities(entityType);
  for (const record of all) {
    if (!keepIds.has(record.id) && !record.dirty) {
      await deleteEntity(entityType, record.id);
    }
  }
}

/** Every locally-replicated entity, of any type, currently flagged with a
 * conflict — backs the app-wide conflict resolution surface (docs/
 * OFFLINE_IMPLEMENTATION_PLAN.md §6.1's "one clear conflict" requirement). */
export async function listAllConflicts(): Promise<EntityRecord[]> {
  const all = await Promise.all(ENTITY_TYPES.map((type) => listEntities(type)));
  return all.flat().filter((record) => record.conflict != null);
}

// --- Mutations queue store ----------------------------------------------

export async function putMutation(mutation: QueuedMutation): Promise<void> {
  const db = await openDb();
  await db.put(MUTATIONS_STORE, mutation);
}

export async function deleteMutation(mutationId: string): Promise<void> {
  const db = await openDb();
  await db.delete(MUTATIONS_STORE, mutationId);
}

export async function listMutations(): Promise<QueuedMutation[]> {
  const db = await openDb();
  const all = await db.getAllFromIndex(MUTATIONS_STORE, "byCreatedAt");
  return all;
}

export async function listMutationsByEntity(
  entityType: EntityType,
  entityId: string,
): Promise<QueuedMutation[]> {
  const all = await listMutations();
  return all.filter((m) => m.entityType === entityType && m.entityId === entityId);
}

// --- Meta store -----------------------------------------------------------

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const result = await db.get(META_STORE, key);
  return result?.value as T | undefined;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  await db.put(META_STORE, { key, value });
}
