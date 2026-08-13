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

export type TimerChip = {
  id: string;
  name: string;
  remainingSeconds: number;
  isExpired: boolean;
  state: CookingModeTimer["state"];
};

/** Per-Section derived data the desktop nav rail and center panel both need. */
export type UnitViewModel = {
  unit: CookingModeUnit;
  instructionProgress: { checked: number; total: number };
  timerChips: TimerChip[];
};

/** A timer plus the Section it belongs to, for the desktop timer rail — which
 * shows every active timer regardless of the currently selected Section. */
export type RailTimer = {
  timer: CookingModeTimer;
  sectionLabel: string;
};
