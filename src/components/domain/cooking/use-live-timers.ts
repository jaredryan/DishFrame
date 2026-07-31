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
  // `now` starts `null` (rather than `Date.now()`) so the pre-mount render
  // is identical on server and client — reading the real clock only in an
  // effect avoids a hydration mismatch on the countdown text (the server's
  // and the client hydration pass's `Date.now()` calls happen at different
  // moments, e.g. "5:00" vs "4:59").
  const [now, setNow] = React.useState<number | null>(null);
  const previouslyExpired = React.useRef<Set<string>>(new Set());
  const onExpireRef = React.useRef(onExpire);

  React.useEffect(() => {
    onExpireRef.current = onExpire;
  });

  const hasRunningTimer = timers.some((t) => t.state === "RUNNING");

  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (!hasRunningTimer) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimer]);

  const states = React.useMemo(() => {
    const map = new Map<string, LiveTimerState>();
    for (const timer of timers) {
      map.set(timer.id, {
        remainingSeconds:
          now === null
            ? Math.max(0, timer.remainingSeconds ?? timer.durationSeconds)
            : remainingSecondsAt(timer, now),
        isExpired: now === null ? false : isTimerExpired(timer, now),
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
