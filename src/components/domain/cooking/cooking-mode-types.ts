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
