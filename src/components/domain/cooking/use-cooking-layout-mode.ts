"use client";

import * as React from "react";

export type CookingLayoutMode = "mobile" | "tablet" | "desktop";

const TABLET_QUERY = "(min-width: 768px)";
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Resolves which single responsive Cooking Mode layout should mount.
 * `null` until the first client-side effect runs (matching the no-`window`
 * SSR render, so there's no hydration mismatch) — the shell renders none of
 * the three layouts during that instant rather than guessing, which is what
 * guarantees exactly one interactive/content tree ever mounts instead of
 * three CSS-hidden copies.
 */
function resolveMode(): CookingLayoutMode {
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "mobile";
}

function subscribe(onChange: () => void) {
  const tabletQuery = window.matchMedia(TABLET_QUERY);
  const desktopQuery = window.matchMedia(DESKTOP_QUERY);
  tabletQuery.addEventListener("change", onChange);
  desktopQuery.addEventListener("change", onChange);
  return () => {
    tabletQuery.removeEventListener("change", onChange);
    desktopQuery.removeEventListener("change", onChange);
  };
}

function getServerSnapshot(): CookingLayoutMode | null {
  return null;
}

export function useCookingLayoutMode(): CookingLayoutMode | null {
  return React.useSyncExternalStore(subscribe, resolveMode, getServerSnapshot);
}
