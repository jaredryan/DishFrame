/**
 * Client-generated identifiers for offline-created entities.
 *
 * docs/OFFLINE_IMPLEMENTATION_PLAN.md's "offline creates and identifiers"
 * decision: every Prisma model in this app uses `id String @id @default(cuid())`
 * (never an autoincrement int), so a client-generated id is a legitimate,
 * permanent primary key from the moment it's minted — the server accepts it
 * verbatim on create (see the optional `clientIds`/`clientMealPlanId`/etc.
 * parameters threaded through `createDishWithVersion`, `startCookingSession`,
 * `createMealPlan`, `generateGroceryList`, `addManualGroceryItem`). There is
 * no temporary-id/remapping step anywhere in this system: an offline-created
 * Dish, CookingSession, MealPlan, or GroceryList keeps the same id forever,
 * online or off, and every relationship authored against it (a PartLink
 * targeting an offline-created Part, a MealPlanEntry referencing an
 * offline-created Dish) is valid immediately, without waiting for sync.
 *
 * `crypto.randomUUID()` (not cuid2) — collision-safe, needs no server
 * coordination, and Prisma's `id String` columns don't care about format.
 * `queue.ts`'s `QueuedMutation.mutationId` doubles as the idempotency key
 * `/api/sync/*` checks against `SyncMutationReceipt` — for a create-shaped
 * mutation, callers pass the same value as both the mutation id and the
 * entity's own id, which gives idempotency two independent ways: the
 * receipt-table lookup (uniform across every mutation kind), and, for
 * creates specifically, "does a row with this id already exist" as a
 * second, redundant safety net.
 */
export function generateClientId(): string {
  return crypto.randomUUID();
}
