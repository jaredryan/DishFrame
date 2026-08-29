/**
 * Schedule-section allocation limit (PRODUCT_SPEC.md §77.2) — pure, DB-free.
 * A Meal's total scheduled servings, across every schedule entry for it, may
 * not exceed its target yield; DishFrame prevents an over-allocation rather
 * than merely warning about it (`setScheduleForEntry` in `service.ts`
 * enforces this server-side).
 */

/**
 * Servings still available to schedule for a Meal, given what's already
 * scheduled for it — `null` when the Meal has no target yield to compare
 * against (nothing to cap). Never negative.
 */
export function remainingServings(
  targetYieldQuantity: number | null,
  alreadyScheduled: number,
): number | null {
  if (targetYieldQuantity == null) return null;
  return Math.max(0, targetYieldQuantity - alreadyScheduled);
}
