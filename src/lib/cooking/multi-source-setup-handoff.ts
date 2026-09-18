/**
 * Multi-source Cooking Sessions (owner spec, 2026-09-17) — the generic
 * Start Cooking picker's selection can't travel to the new `/cook/setup`
 * route as a plain query param (an array of {dishId, dishVersionId} pairs,
 * one per selected source, doesn't fit a clean URL the way a single
 * `?versionId=` already does for the direct-entry route). `sessionStorage`
 * is the standard, ephemeral, client-only hand-off for exactly this shape
 * of "next page needs what this dialog just collected" — it is never a
 * Cooking Session and never reaches the server on its own; `/cook/setup`
 * re-derives everything server-side from the dishId/dishVersionId pairs
 * this holds (see `getMultiSourceSetupData`), the same "never trusted from
 * the client" rule the rest of Cooking Setup already follows. Reading it
 * clears it, so a refresh or a second visit without going through the
 * picker again correctly finds nothing and redirects back to `/cook`.
 */

const STORAGE_KEY = "dishframe:cooking-setup:multi-source-selection";

export type MultiSourceSetupSelection = {
  from: "home" | "cook";
  sources: Array<{ dishId: string; dishVersionId: string | null }>;
};

export function writeMultiSourceSetupSelection(
  selection: MultiSourceSetupSelection,
): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Private browsing / storage disabled — /cook/setup finds nothing and
    // redirects back to /cook, same as never having selected anything.
  }
}

export function readAndClearMultiSourceSetupSelection(): MultiSourceSetupSelection | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MultiSourceSetupSelection;
    if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
