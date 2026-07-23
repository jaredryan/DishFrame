# Milestone 2 — Results

## Summary

Implemented Milestone 2 in full: SEO/metadata, sitemap/robots, JSON-LD, a
temporary social image + icon set, a web manifest, branded error/404/loading
states, conservative security headers, Vercel Speed Insights, a `pnpm check`
script, tests, `POST_LAUNCH_TODO.md`, and README updates. No recipe-domain
work was touched, and no existing infrastructure (auth, DB, deployment,
Contact/Resend) was modified — only extended.

Two standing rules were also recorded for this session and going forward:
run all verification in one consolidated pass at the end, and never
commit/push without an explicit ask. These were added to `AGENTS.md`
(checked into the repo) and to persistent memory.

## SEO

- `src/lib/site.ts` centralizes `NEXT_PUBLIC_APP_URL` (reads it directly,
  not through the full env schema, so metadata files don't need unrelated
  secrets like `BETTER_AUTH_SECRET` just to resolve a public URL).
- Root layout (`src/app/layout.tsx`): `metadataBase`, title template,
  description, canonical `/`, Open Graph, Twitter card, `viewport`
  (theme-color light/dark).
- `/about`, `/contact` get their own canonical + Open Graph; `/sign-in` and
  the whole `(app)` shell are `noindex, nofollow`.
- `src/app/sitemap.ts` → `/sitemap.xml` (only `/`, `/about`, `/contact`);
  `src/app/robots.ts` → `/robots.txt` (disallows the app + `/api/*`, points
  at the sitemap).
- `src/components/marketing/json-ld.tsx` renders a `WebApplication`
  JSON-LD block on the homepage, `<` escaped.

## Brand assets

- `src/app/icon.tsx` / `apple-icon.tsx` / `opengraph-image.tsx` /
  `twitter-image.tsx` — all generated via `next/og`, reusing the same
  nested-frame motif as `mark.tsx`. Replaced the leftover default Next.js
  `favicon.ico`.
- `src/app/manifest.ts` → `/manifest.webmanifest`, no service
  worker/offline behavior.

## Production reliability

- `src/app/not-found.tsx`, `error.tsx`, `global-error.tsx`, plus
  `loading.tsx` for `(app)` and `/sign-in` (real server session lookups).
- `next.config.ts`: `poweredByHeader: false`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy` on every route. No enforcing CSP
  (deferred, tracked in the TODO doc).
- `@vercel/speed-insights` installed and mounted in the root layout.
- `pnpm check` = format:check + lint + typecheck + test + build.

## Tests

Ran everything in one final pass: `format:check`, `lint`, `typecheck` (48
unit tests / 15 files), `build`, and `test:e2e` (15 Playwright tests) — all
green. Also verified real output against a local production server
(`robots.txt`, `sitemap.xml`, `manifest.webmanifest`, canonical tags,
noindex, OG/Twitter meta, JSON-LD, security headers, 404 status).

Along the way, two **pre-existing** issues unrelated to this milestone were
found and fixed (confirmed via `git stash` that they already failed on
`main`): the "Contact loads" e2e test asserted the submit button was
disabled when it never actually was, and `site.ts` was decoupled from the
full env schema after finding it would otherwise require
`BETTER_AUTH_SECRET` just to render the homepage in tests.

## Post-launch document

Created `POST_LAUNCH_TODO.md` with sections A–J: immediate manual checks,
search launch, custom domain, Resend domain upgrade, security hardening,
monitoring, preview isolation, final brand assets, PWA/cooking-mode
(deferred), and legal/policy.

## Manual actions

- Enable/confirm **Speed Insights** in the Vercel dashboard for this
  project (the component is installed, but the dashboard toggle is
  separate).
- After merging, inspect `robots.txt`, `sitemap.xml`, JSON-LD, canonical
  tags, and the OG image on the live production URL (checklist in
  `POST_LAUNCH_TODO.md` §A).

## Deployment status

Nothing was pushed, committed, or deployed — all changes are local and
unstaged, per instructions.
