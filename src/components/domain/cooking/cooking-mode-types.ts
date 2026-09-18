export type CookingModeChecklistItem = {
  id: string;
  kind: "INGREDIENT" | "INSTRUCTION";
  displayText: string;
  displayQuantity: string | null;
  displayUnit: string | null;
  checkedAt: string | null;
  conflict: { type: "needs-more" | "exceeds"; amount: number } | null;
};

export type CookingModeTimer = {
  id: string;
  name: string;
  durationSeconds: number;
  targetEndAt: string | null;
  remainingSeconds: number | null;
  state: "RUNNING" | "PAUSED" | "EXPIRED" | "DISMISSED";
};

export type CookingModeUnit = {
  id: string;
  label: string;
  sourceDishTitle: string;
  sourceDishVersionLabel: string;
  /** Restrained multi-source attribution (owner spec, 2026-09-17) — null
   * for every single-source session (nothing rendered, unchanged today's
   * compact look); otherwise the contributing source title(s), e.g.
   * "Chicken Bowl" or "Chicken Bowl + Beef Bowl" for a shared/consolidated
   * unit. */
  sourceLabel: string | null;
  /** Per-source allocation for a consolidated shared Part (owner spec,
   * "preserve accurate per-source allocation information... surface that
   * allocation where useful without overwhelming ordinary units") — null
   * for every single-contribution unit; one entry per contributing source
   * otherwise, already scaled by this unit's own current `scaleFactor` (the
   * same live per-unit override its checklist quantities reflect), so a
   * "Scale this unit" change updates the allocation numbers exactly like it
   * updates the checklist. */
  contributors: Array<{
    sourceDishTitle: string;
    contributionQuantity: number | null;
    contributionUnit: string | null;
  }> | null;
  removedAt: string | null;
  removedAfterProgress: boolean;
  completedAt: string | null;
  scaleFactor: number;
  outputQuantity: number | null;
  outputUnit: string | null;
  checklistItems: CookingModeChecklistItem[];
  timers: CookingModeTimer[];
};

/** Per-Section derived data the desktop nav rail and center panel both need.
 * Timers are never shown here — Section navigation stays Recipe/Section
 * navigation only; every timer lives solely in the dedicated Timers area
 * (PRODUCT_SPEC.md §29.7). */
export type UnitViewModel = {
  unit: CookingModeUnit;
  instructionProgress: { checked: number; total: number };
};

/** A timer plus the Section it belongs to, for the desktop timer rail — which
 * shows every active timer regardless of the currently selected Section. */
export type RailTimer = {
  timer: CookingModeTimer;
  sectionLabel: string;
};
