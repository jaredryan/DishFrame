/**
 * Planned-meal allocation feedback (PRODUCT_SPEC.md §77.2) — pure, DB-free.
 * DishFrame warns when allocated servings over/under-shoot a cooking
 * entry's expected yield; it never blocks the plan (§77.2's "leftovers or
 * extra food" may be intentional).
 */

export type AllocationStatus = "unknown" | "under" | "balanced" | "over";

export function computeAllocationStatus(
  targetYieldQuantity: number | null,
  plannedMeals: Array<{ servings: number }>,
): AllocationStatus {
  if (targetYieldQuantity == null) return "unknown";
  const allocated = plannedMeals.reduce((sum, m) => sum + m.servings, 0);
  if (allocated < targetYieldQuantity) return "under";
  if (allocated > targetYieldQuantity) return "over";
  return "balanced";
}
