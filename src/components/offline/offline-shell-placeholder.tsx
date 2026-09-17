/**
 * The single, neutral placeholder every offline boundary renders whenever
 * the currently-mounted content can't be trusted for the browser's real
 * URL — a proactively-precached route shell served for a record never
 * fetched from this exact URL (`public/sw.js`'s route-shell fallback), or
 * a genuine "not replicated" case. Deliberately one shared, prop-less,
 * fully static component (no hooks, no dynamic data) used *both* for the
 * sentinel precache render (`OFFLINE_SHELL_SENTINEL`) and every boundary's
 * mismatch branch, so the two are always byte-identical — the whole point
 * is that React's hydration never has to reconcile this placeholder
 * against a *different* placeholder, only ever against itself, before a
 * boundary's own effect swaps in real content.
 */
export function OfflineShellPlaceholder() {
  return (
    <div className="text-muted-foreground mx-auto flex max-w-2xl flex-col items-center gap-3 px-4 py-16 text-center">
      <div
        className="border-muted-foreground/30 border-t-foreground size-6 animate-spin rounded-full border-2"
        aria-hidden="true"
      />
      <p className="text-sm">Loading what&apos;s saved on this device…</p>
    </div>
  );
}
