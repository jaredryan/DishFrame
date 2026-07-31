"use client";

import * as React from "react";
import {
  remainingSecondsAt,
  isTimerExpired,
  type TimerSnapshot,
} from "@/lib/cooking/timer-math";

export type LiveTimer = TimerSnapshot & { id: string; name: string };

export type LiveTimerState = { remainingSeconds: number; isExpired: boolean };

/**
 * Ticks a client clock once a second (only while at least one timer is
 * RUNNING) and derives each timer's remaining time / expired state from its
 * persisted `targetEndAt`/`remainingSeconds` — never writes to the DB on
 * every tick (PRODUCT_SPEC.md §29.4). Fires `onExpire` exactly once per
 * timer at the moment it crosses from not-expired to expired, for the
 * visible/accessible/audible alert (§29.6).
 */
export function useLiveTimers(
  timers: LiveTimer[],
  onExpire: (timer: LiveTimer) => void,
): Map<string, LiveTimerState> {
  const [now, setNow] = React.useState(() => Date.now());
  const previouslyExpired = React.useRef<Set<string>>(new Set());
  const onExpireRef = React.useRef(onExpire);

  React.useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const hasRunningTimer = timers.some((t) => t.state === "RUNNING");

  React.useEffect(() => {
    if (!hasRunningTimer) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  const states = React.useMemo(() => {
    const map = new Map<string, LiveTimerState>();
    for (const timer of timers) {
      map.set(timer.id, {
        remainingSeconds: remainingSecondsAt(timer, now),
        isExpired: isTimerExpired(timer, now),
      });
    }
    return map;
  }, [timers, now]);

  React.useEffect(() => {
    for (const timer of timers) {
      const state = states.get(timer.id);
      if (!state) continue;
      if (state.isExpired && !previouslyExpired.current.has(timer.id)) {
        previouslyExpired.current.add(timer.id);
        onExpireRef.current(timer);
      } else if (!state.isExpired) {
        previouslyExpired.current.delete(timer.id);
      }
    }
  }, [states, timers]);

  return states;
}
