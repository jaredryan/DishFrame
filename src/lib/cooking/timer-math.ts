/**
 * Pure Timer countdown math (PRODUCT_SPEC.md §29.4) — no Prisma/React
 * dependency, mirroring `units/scaling.ts`'s pattern. A running Timer
 * persists a target end timestamp; a paused one persists remaining
 * duration. Countdown display is always derived from these at read time
 * (client tick or server render), never written to the DB every second.
 */

export type TimerSnapshot = {
  state: "RUNNING" | "PAUSED" | "EXPIRED" | "DISMISSED";
  targetEndAt: string | null;
  remainingSeconds: number | null;
  durationSeconds: number;
};

/** Seconds remaining right now (clamped to 0), given `now` in epoch ms. */
export function remainingSecondsAt(
  timer: TimerSnapshot,
  nowMs: number,
): number {
  if (timer.state === "RUNNING" && timer.targetEndAt) {
    const targetMs = new Date(timer.targetEndAt).getTime();
    return Math.max(0, Math.round((targetMs - nowMs) / 1000));
  }
  return Math.max(0, timer.remainingSeconds ?? timer.durationSeconds);
}

/** A timer is "expired" purely by comparing its persisted target time to
 * `now` — DishFrame never writes a separate EXPIRED row for this (Slice 8
 * scope decision, see docs/SLICE_8.md): a RUNNING timer whose target has
 * passed is expired for display/alert purposes until dismissed. */
export function isTimerExpired(timer: TimerSnapshot, nowMs: number): boolean {
  if (timer.state !== "RUNNING" || !timer.targetEndAt) return false;
  return new Date(timer.targetEndAt).getTime() <= nowMs;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}
