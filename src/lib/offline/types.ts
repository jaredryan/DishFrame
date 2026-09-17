/**
 * Shared types for the offline local-replica + sync-queue framework.
 * See docs/OFFLINE_IMPLEMENTATION_PLAN.md for the architecture this
 * implements. Deliberately generic across domains (Dishes, Cooking
 * Sessions, Meal Plans, Grocery Lists) — domain-specific document shapes
 * live in each domain's own `offline/*.ts`, not here.
 */

export const ENTITY_TYPES = [
  "dish",
  "cookingSession",
  "mealPlan",
  "groceryList",
  "referenceData",
  "importDraft",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** One locally-replicated document, plus the sync bookkeeping needed to
 * classify it as clean / locally-changed / conflicted (the plan's "Data
 * synchronization/bootstrap" section). `doc` is intentionally `unknown`
 * here — each domain's `offline/*.ts` narrows it via its own typed
 * accessors on top of `db.ts`. */
export type EntityRecord<TDoc = unknown> = {
  entityType: EntityType;
  id: string;
  doc: TDoc;
  /** Server `updatedAt` (or equivalent revision marker) as of the last
   * successful sync of this entity, or `null` for a not-yet-synced,
   * locally-created entity. */
  serverRevision: string | null;
  /** Local wall-clock time this record was last written on this device. */
  localUpdatedAt: string;
  /** True while a mutation touching this entity is queued/in-flight and
   * hasn't been confirmed by the server yet. */
  dirty: boolean;
  conflict: ConflictInfo | null;
};

export type ConflictInfo = {
  kind: "field-conflict" | "session-ended-elsewhere" | "requires-online";
  message: string;
  detectedAt: string;
  /** The server's current copy at conflict-detection time, when available,
   * so a resolution UI can show "yours" vs. "theirs" without a refetch. */
  serverDoc?: unknown;
};

export type MutationStatus =
  "pending" | "syncing" | "failed" | "conflict" | "done";

/**
 * One queued offline mutation. `mutationId` is client-generated and doubles
 * as the idempotency key `/api/sync/*` checks against `SyncMutationReceipt`
 * — see `ids.ts`'s doc comment. For a create-shaped operation, callers
 * should mint it once and use the same value as the created row's own id.
 */
export type QueuedMutation = {
  mutationId: string;
  entityType: EntityType;
  entityId: string;
  /** Domain-namespaced operation name, e.g. "dish.create",
   * "cooking.toggleChecklistItem" — the namespace before the "." selects
   * which `/api/sync/*` route handles it (see `sync-engine.ts`). */
  op: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  status: MutationStatus;
  lastError: string | null;
  /** Terminal classification once failed/conflict — a retry button only
   * makes sense when this is false. */
  terminal: boolean;
};

/** What `/api/sync/*` returns for a single mutation, and what the client's
 * queue drain loop dispatches on. */
export type SyncApplyResult =
  | {
      status: "applied" | "already-applied";
      entityId: string;
      /** Full current server-side snapshot of the affected entity, in the
       * same shape `/api/sync/bootstrap` and `/api/sync/pull` return it —
       * the drain loop overwrites the local replica with this verbatim
       * rather than trying to merge a partial result. */
      snapshot?: unknown;
      serverRevision: string | null;
      /** Op-specific extra data outside the replicated snapshot — e.g.
       * `mealplan.resyncGroceryLists`' added/removed/changed counts. Most
       * callers ignore it. */
      meta?: unknown;
    }
  | { status: "conflict"; message: string; serverDoc?: unknown }
  | { status: "error"; message: string; terminal: boolean };

export type SyncStatusSummary = {
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
};

/** One entry in a bootstrap/incremental-pull response. */
export type SyncEntitySnapshot = {
  entityType: EntityType;
  id: string;
  doc: unknown;
  serverRevision: string | null;
  /** Present (and true) only for a pull entry representing a server-side
   * deletion — see `sync-engine.ts`'s `applyServerSnapshot`. */
  deleted?: boolean;
};

export type BootstrapResponse = {
  syncedAt: string;
  entities: SyncEntitySnapshot[];
};
