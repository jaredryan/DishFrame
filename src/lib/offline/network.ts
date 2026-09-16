"use client";

/**
 * Connectivity detection deliberately does not rely on `navigator.onLine`
 * alone (the plan's explicit requirement) — it only reflects link-layer
 * connectivity (e.g. Wi-Fi associated), not whether *this origin* is
 * actually reachable (captive portals, VPN issues, a Vercel outage all
 * report `onLine: true` while every real fetch fails).
 *
 * For UI display, `useOffline` from `next/offline` (enabled via
 * `experimental.useOffline` in next.config.ts) is the primary signal — it
 * already combines the `online`/`offline` browser events with real
 * fetch-failure detection on navigations/prefetches/Server Actions. For
 * this module's own `/api/sync/*` calls (plain `fetch`, not a Server
 * Action or navigation, so Next's built-in mechanism doesn't cover them),
 * `isNetworkError` below is what actually decides "queue this for later"
 * on a failed attempt.
 */

/**
 * True for a failure that plausibly means "no network path to the server
 * right now" (a `fetch` that never got a response, a `TypeError` from the
 * fetch spec's own network-error case) — as opposed to a real HTTP
 * response (4xx/5xx), which is a server-side outcome, not a connectivity
 * one, and is handled by the caller's own status-code logic instead of
 * being queued for later retry.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NetworkError")
  ) {
    return true;
  }
  return false;
}

/**
 * Wraps a fetch-based call so both "explicitly offline" and "network error
 * mid-request" land in the same `{ ok: false, offline: true }` branch —
 * the plan's "network failures from an attempted online mutation should
 * also fall back to the offline queue," not only a `navigator.onLine`
 * check made in advance.
 */
export async function attemptOnline<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; offline: true }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, offline: true };
  }
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    if (isNetworkError(error)) {
      return { ok: false, offline: true };
    }
    throw error;
  }
}
