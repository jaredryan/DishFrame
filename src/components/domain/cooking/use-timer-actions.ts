"use client";

import * as React from "react";
import {
  startTimer,
  pauseTimer,
  resetTimer,
  adjustTimer,
  dismissTimer,
} from "@/lib/cooking/actions";
import type { CookingModeTimer } from "@/components/domain/cooking/cooking-mode-types";

const ADJUST_DEBOUNCE_MS = 500;

type TimerOverride = Partial<
  Pick<
    CookingModeTimer,
    "state" | "targetEndAt" | "remainingSeconds" | "durationSeconds"
  >
>;

/**
 * Mirrors the server's own Timer math (lib/cooking/service.ts) client-side
 * so Play/Pause/±1 minute/Reset/Dismiss update the visible countdown
 * immediately (item 10's "same responsiveness principle" applied to
 * timers) instead of waiting on the mutation + a `router.refresh()`. `±1
 * minute` clicks are additionally debounced/summed per timer so a rapid
 * burst becomes one `adjustTimer` call rather than several racing writes
 * to the same row.
 */
export function useTimerActions(
  sessionId: string,
  onError: (message: string) => void,
) {
  const [overrides, setOverrides] = React.useState<
    Record<string, TimerOverride>
  >({});
  const adjustBuffer = React.useRef<Record<string, number>>({});
  const adjustPending = React.useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  React.useEffect(() => {
    const timers = adjustPending.current;
    return () => {
      for (const timer of Object.values(timers)) {
        clearTimeout(timer);
      }
    };
  }, []);

  function effective(timer: CookingModeTimer): CookingModeTimer {
    const override = overrides[timer.id];
    return override ? { ...timer, ...override } : timer;
  }

  function clearOverride(timerId: string) {
    setOverrides((prev) => {
      if (!(timerId in prev)) return prev;
      const next = { ...prev };
      delete next[timerId];
      return next;
    });
  }

  function setOverride(timerId: string, override: TimerOverride) {
    setOverrides((prev) => ({
      ...prev,
      [timerId]: { ...prev[timerId], ...override },
    }));
  }

  function start(timer: CookingModeTimer, currentRemaining: number) {
    const remaining = Math.max(0, Math.round(currentRemaining));
    setOverride(timer.id, {
      state: "RUNNING",
      targetEndAt: new Date(Date.now() + remaining * 1000).toISOString(),
      remainingSeconds: null,
    });
    void startTimer({ sessionId, timerId: timer.id }).then((result) => {
      if (result.status === "error") {
        clearOverride(timer.id);
        onError(result.message);
      }
    });
  }

  function pause(timer: CookingModeTimer, currentRemaining: number) {
    setOverride(timer.id, {
      state: "PAUSED",
      remainingSeconds: Math.max(0, Math.round(currentRemaining)),
      targetEndAt: null,
    });
    void pauseTimer({ sessionId, timerId: timer.id }).then((result) => {
      if (result.status === "error") {
        clearOverride(timer.id);
        onError(result.message);
      }
    });
  }

  function reset(timer: CookingModeTimer) {
    const duration = effective(timer).durationSeconds;
    setOverride(timer.id, {
      state: "PAUSED",
      remainingSeconds: duration,
      targetEndAt: null,
    });
    void resetTimer({ sessionId, timerId: timer.id }).then((result) => {
      if (result.status === "error") {
        clearOverride(timer.id);
        onError(result.message);
      }
    });
  }

  function dismiss(timer: CookingModeTimer) {
    setOverride(timer.id, { state: "DISMISSED" });
    void dismissTimer({ sessionId, timerId: timer.id }).then((result) => {
      if (result.status === "error") {
        clearOverride(timer.id);
        onError(result.message);
      }
    });
  }

  function adjust(
    timer: CookingModeTimer,
    deltaSeconds: number,
    currentRemaining: number,
  ) {
    const current = effective(timer);
    const nextDuration = Math.max(0, current.durationSeconds + deltaSeconds);
    if (current.state === "RUNNING" && current.targetEndAt) {
      setOverride(timer.id, {
        durationSeconds: nextDuration,
        targetEndAt: new Date(
          new Date(current.targetEndAt).getTime() + deltaSeconds * 1000,
        ).toISOString(),
      });
    } else {
      setOverride(timer.id, {
        durationSeconds: nextDuration,
        remainingSeconds: Math.max(
          0,
          Math.round(currentRemaining) + deltaSeconds,
        ),
      });
    }

    adjustBuffer.current[timer.id] =
      (adjustBuffer.current[timer.id] ?? 0) + deltaSeconds;
    if (adjustPending.current[timer.id]) {
      clearTimeout(adjustPending.current[timer.id]);
    }
    adjustPending.current[timer.id] = setTimeout(() => {
      delete adjustPending.current[timer.id];
      const delta = adjustBuffer.current[timer.id] ?? 0;
      delete adjustBuffer.current[timer.id];
      if (delta === 0) return;
      void adjustTimer({
        sessionId,
        timerId: timer.id,
        deltaSeconds: delta,
      }).then((result) => {
        if (result.status === "error") {
          clearOverride(timer.id);
          onError(result.message);
        }
      });
    }, ADJUST_DEBOUNCE_MS);
  }

  return { effective, start, pause, reset, dismiss, adjust };
}
