"use client";

import { deleteDb } from "@/lib/offline/db";

/**
 * Per-account isolation for offline storage (docs/OFFLINE_IMPLEMENTATION_PLAN.md
 * §6.2). The session cookie is httpOnly — client JS can't read it — so the
 * signed-in user's id has to reach this module from an authenticated Server
 * Component instead (see `<OfflineAccountBoot>`, mounted in the root
 * layout). Everything here runs client-side only.
 *
 * Design: `db.ts`'s IndexedDB database and this module's Cache Storage
 * caches both use one fixed name, never a per-account one — isolation is
 * enforced by wiping everything the moment the signed-in account no longer
 * matches what a `localStorage` marker remembers, not by keeping every
 * account's data around under separate names. The marker
 * (`dishframe:accountId`) is not sensitive itself (just an id), but it's
 * the only signal this module has for "the signed-in user changed" without
 * a live network round trip, since the session cookie itself is httpOnly.
 */

const MARKER_KEY = "dishframe:accountId";

export const CACHE_NAMES = [
  "dishframe-static",
  "dishframe-documents",
  "dishframe-rsc",
  "dishframe-images",
] as const;

function readMarker(): string | null {
  try {
    return window.localStorage.getItem(MARKER_KEY);
  } catch {
    // Private-browsing/blocked storage: nothing can persist anyway, so
    // there's nothing to isolate.
    return null;
  }
}

function writeMarker(userId: string | null) {
  try {
    if (userId) window.localStorage.setItem(MARKER_KEY, userId);
    else window.localStorage.removeItem(MARKER_KEY);
  } catch {
    // Ignore — see readMarker.
  }
}

async function wipeAllLocalData(): Promise<void> {
  await deleteDb();
  if (typeof caches !== "undefined") {
    for (const name of CACHE_NAMES) {
      await caches.delete(name).catch(() => {});
    }
  }
  // A service worker mid-handling a fetch could otherwise keep serving from
  // a cache this call just deleted; tell it to drop any in-memory notion of
  // "current account" too (see public/sw.js's message handler).
  navigator.serviceWorker?.controller?.postMessage({
    type: "dishframe:account-changed",
  });
}

/**
 * Call once per app boot (root layout), passing the currently-authenticated
 * user id, or `null` when there is no session. Reconciles local storage
 * against that truth:
 * - unauthenticated boot: wipes whatever the marker remembers (§6.2's
 *   "booting into an unauthenticated state also clears... rather than
 *   relying exclusively on the normal Sign Out button" — covers an expired
 *   cookie, a cleared session, or any path that reaches an unauthenticated
 *   render without the Sign Out button);
 * - authenticated boot, no marker or marker matches: no-op beyond writing
 *   the marker;
 * - authenticated boot, marker names a *different* account: an account
 *   switch on a shared/kiosk device — wipes everything before adopting the
 *   new account.
 */
export async function reconcileAccountScope(
  authenticatedUserId: string | null,
): Promise<void> {
  const marker = readMarker();

  if (!authenticatedUserId) {
    if (marker) await wipeAllLocalData();
    writeMarker(null);
    return;
  }

  if (marker && marker !== authenticatedUserId) {
    await wipeAllLocalData();
  }
  writeMarker(authenticatedUserId);
}

/** Explicit sign-out path: wipe local data outright, not just on next boot
 * — the tab may never reload before another account signs in on the same
 * device. Call before/alongside the actual sign-out request. */
export async function clearCurrentAccountData(): Promise<void> {
  await wipeAllLocalData();
  writeMarker(null);
}

export function currentAccountMarker(): string | null {
  return readMarker();
}
