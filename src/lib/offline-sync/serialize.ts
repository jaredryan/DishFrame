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
