// Reads NEXT_PUBLIC_APP_URL directly rather than through `@/lib/env/server`
// so metadata files (sitemap, robots, manifest, layout, JSON-LD) don't pull
// in the full env schema — and its unrelated required vars — just to read
// one public URL.
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";
export const SITE_NAME = "DishFrame";
export const SITE_TITLE =
  "DishFrame — Recipes that get better every time you cook";
export const SITE_DESCRIPTION =
  "DishFrame is a personal cooking framework: turn scattered notes into structured, living Recipes you can cook from, improve over time, plan around, and share.";

/** Resolves a site-relative path to an absolute URL against the configured app origin. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}
