/**
 * A dynamic-segment value reserved for the offline route-shell mechanism
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md §1) — never a real record id (every
 * real id is a `crypto.randomUUID()`/cuid, never this literal string).
 * Every supported dynamic page checks for this value *before* any auth
 * check or data fetch and, when present, renders the plain
 * `OfflineShellPlaceholder` instead — a neutral, data-free render that
 * `public/sw.js` fetches and caches proactively (install time) per route
 * pattern, so a genuinely first-ever offline visit to that pattern has
 * *something* neutral to paint before the real offline boundary hydrates
 * and reads the actual record from the replica. Shared here (not
 * duplicated per page) so the page-side check and the service worker's
 * own URL list can never drift apart.
 */
export const OFFLINE_SHELL_SENTINEL = "_offline_shell_";
