"use client";

import * as React from "react";

/**
 * Screen Wake Lock API (docs/OFFLINE_IMPLEMENTATION_PLAN.md §4.4) — kept
 * active while `active` is true (the same `isActive && hasRunningTimer`
 * condition `CookingModeShell` already uses for its `beforeunload` guard,
 * so "keep the screen on" and "warn before leaving" share one signal).
 *
 * Chrome releases a wake lock automatically when the tab is hidden and
 * does not restore it on its own — this re-acquires on `visibilitychange`
 * back to visible, which the spec expects callers to handle themselves.
 * Unsupported browsers (no `navigator.wakeLock`, or a non-secure context)
 * fail silently: no lock, no error surfaced, since there's nothing the
 * user could do about it.
 */
export function useWakeLock(active: boolean): void {
  const lockRef = React.useRef<WakeLockSentinel | null>(null);

  React.useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
      } catch {
        // Denied, unsupported, or the page isn't visible yet — no
        // user-actionable fix, so this fails silently.
      }
    }

    void acquire();

    function handleVisibilityChange() {
      if (document.visibilityState === "visible" && !lockRef.current) {
        void acquire();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
