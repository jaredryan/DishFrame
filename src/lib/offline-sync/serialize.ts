import { ConflictError } from "@/lib/errors";

/**
 * Generic Prisma-result -> JSON-safe conversion for the Meal Plan/Grocery
 * List snapshot builders, which (unlike the hand-shaped Dish/Cooking
 * snapshots) pass a query result close to verbatim. `Prisma.Decimal` and
 * `Date` both implement `toJSON()`, so a plain stringify/parse round trip
 * already converts every Decimal to its numeric string and every Date to
 * an ISO string — no per-field mapping needed, at the cost of numeric
 * fields arriving as strings rather than `number` (the same tradeoff many
 * JSON APIs make for decimal-precision values; call `Number(...)` at the
 * point of use, same as `decimalToNumber` does for the Prisma object
 * itself elsewhere in this codebase).
 */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Revision-based conflict detection for the Meal Plan/Grocery List domains
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §3/§6) — a queued mutation's payload
 * carries `baseRevision`, the `updatedAt` this device last saw for the
 * entity/row it's about to mutate (threaded in automatically by
 * `mealPlanMutate`/`groceryMutate` from the local replica, mirroring
 * Dishes' `baseVersionId` optimistic-concurrency check). A missing
 * `baseRevision` (an old queued mutation from before this check existed,
 * or a create with nothing to compare against) skips the check rather than
 * failing closed. `ConflictError` maps to the sync API's existing 409
 * handling (`offline-sync/http.ts`), which the conflict-resolution dialog
 * already surfaces — no new UI plumbing needed.
 */
export async function assertRevisionOrThrow(
  actual: Date,
  baseRevision: string | null | undefined,
  message = "This was changed elsewhere since you loaded it — review the current version and try again.",
): Promise<void> {
  if (baseRevision == null) return;
  if (actual.toISOString() !== baseRevision) {
    throw new ConflictError(message);
  }
}
