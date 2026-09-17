"use client";

import * as React from "react";
import { runOrQueueMutation } from "@/lib/offline/mutate";
import { generateClientId } from "@/lib/offline/ids";
import type { CookingModeTimer } from "@/components/domain/cooking/cooking-mode-types";
import type { CookingModeSessionProps } from "@/lib/cooking/session-view";

const ADJUST_DEBOUNCE_MS = 500;

type TimerOverride = Partial<
  Pick<
    CookingModeTimer,
    "state" | "targetEndAt" | "remainingSeconds" | "durationSeconds"
  >
>;

/** Patches one timer, by id, across every unit in a
 * `CookingModeSessionProps`-shaped local-replica doc. */
function patchTimer(
  doc: unknown,
  timerId: string,
  patch: TimerOverride,
): unknown {
  const props = doc as CookingModeSessionProps | undefined;
  if (!props) return doc;
  return {
    ...props,
    units: props.units.map((unit) => ({
      ...unit,
      timers: unit.timers.map((timer) =>
        timer.id === timerId ? { ...timer, ...patch } : timer,
      ),
    })),
  };
}

/**
 * Mirrors the server's own Timer math (lib/cooking/service.ts) client-side
 * so Play/Pause/±1 minute/Reset/Dismiss update the visible countdown
 * immediately (item 10's "same responsiveness principle" applied to
 * timers) instead of waiting on the mutation + a `router.refresh()`. `±1
 * minute` clicks are additionally debounced/summed per timer so a rapid
 * burst becomes one `adjustTimer` call rather than several racing writes
 * to the same row. Every mutation goes through `runOrQueueMutation`
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md's stable sync API), so a timer
 * action taken with no connection queues and applies once one returns,
 * with `targetEndAt` recomputed from the deadline exactly as it already is
 * when connected (§4.2 of the plan — deadline-based, never a duration
 * counter that could drift against wall-clock suspension time).
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

  async function mutate(
    op: string,
    timerId: string,
    payload: unknown,
    patch: TimerOverride,
  ) {
    const result = await runOrQueueMutation({
      op,
      entityType: "cookingSession",
      entityId: sessionId,
      payload,
      optimisticDoc: (current: unknown) => patchTimer(current, timerId, patch),
      mutationId: generateClientId(),
    });
    if (!result.ok) {
      clearOverride(timerId);
      onError(result.message);
    }
  }

  function start(timer: CookingModeTimer, currentRemaining: number) {
    const remaining = Math.max(0, Math.round(currentRemaining));
    const targetEndAt = new Date(Date.now() + remaining * 1000).toISOString();
    setOverride(timer.id, {
      state: "RUNNING",
      targetEndAt,
      remainingSeconds: null,
    });
    void mutate(
      "cooking.startTimer",
      timer.id,
      { sessionId, timerId: timer.id },
      { state: "RUNNING", targetEndAt, remainingSeconds: null },
    );
  }

  function pause(timer: CookingModeTimer, currentRemaining: number) {
    const remainingSeconds = Math.max(0, Math.round(currentRemaining));
    setOverride(timer.id, {
      state: "PAUSED",
      remainingSeconds,
      targetEndAt: null,
    });
    void mutate(
      "cooking.pauseTimer",
      timer.id,
      { sessionId, timerId: timer.id },
      { state: "PAUSED", remainingSeconds, targetEndAt: null },
    );
  }

  function reset(timer: CookingModeTimer) {
    const duration = effective(timer).durationSeconds;
    setOverride(timer.id, {
      state: "PAUSED",
      remainingSeconds: duration,
      targetEndAt: null,
    });
    void mutate(
      "cooking.resetTimer",
      timer.id,
      { sessionId, timerId: timer.id },
      { state: "PAUSED", remainingSeconds: duration, targetEndAt: null },
    );
  }

  function dismiss(timer: CookingModeTimer) {
    setOverride(timer.id, { state: "DISMISSED" });
    void mutate(
      "cooking.dismissTimer",
      timer.id,
      { sessionId, timerId: timer.id },
      { state: "DISMISSED" },
    );
  }

  function adjust(
    timer: CookingModeTimer,
    deltaSeconds: number,
    currentRemaining: number,
  ) {
    const current = effective(timer);
    const nextDuration = Math.max(0, current.durationSeconds + deltaSeconds);
    let patch: TimerOverride;
    if (current.state === "RUNNING" && current.targetEndAt) {
      patch = {
        durationSeconds: nextDuration,
        targetEndAt: new Date(
          new Date(current.targetEndAt).getTime() + deltaSeconds * 1000,
        ).toISOString(),
      };
    } else {
      patch = {
        durationSeconds: nextDuration,
        remainingSeconds: Math.max(
          0,
          Math.round(currentRemaining) + deltaSeconds,
        ),
      };
    }
    setOverride(timer.id, patch);

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
      void mutate(
        "cooking.adjustTimer",
        timer.id,
        { sessionId, timerId: timer.id, deltaSeconds: delta },
        patch,
      );
    }, ADJUST_DEBOUNCE_MS);
  }

  return { effective, start, pause, reset, dismiss, adjust };
}
