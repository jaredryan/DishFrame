# DishFrame — TODO

Durable tracking of genuinely unfinished, deferred, or open work. This is
the one temporary planning/status document in `docs/` — everything else
in `docs/` is a living reference document (see `PRODUCT_SPEC.md`,
`BRANDING.md`, `PRODUCT_ROADMAP.md`, `ARCHITECTURE_PROPOSAL.md`,
`BUILD_PLAN.md`). Update this file as items are completed or as new
deferred work is identified — it is not a one-time snapshot.

Production URL: `https://dish-frame.vercel.app`

---

## A. Open product/design decisions needing owner input

- **`/home` real content.** All three dashboard sections ("Recent
  Recipes," "Active Dishes," "Saved Parts") are still static placeholder
  stubs regardless of account data — no canonical doc currently targets
  Home's real content. Needs a decision: what counts as "Active," sort
  order, item counts, then scope into a slice.
- **Sitewide badge-text contrast gap.** Small colored badge text on
  ~10%-tint backgrounds ("Proven," "Saved part," version tags, star
  ratings — used throughout the signed-in app) generally measures
  3.1–3.3:1, below the 4.5:1 AA text threshold, though these read as
  compact status badges rather than body text. Needs a decision:
  introduce darker accessible accent-text variants system-wide, or
  declare these badges exempt from the AA text threshold. See
  `BRANDING.md` §23.
- **Meal-Plan grocery-generation UI scope.** Whole-plan-only (current
  behavior) vs. exposing a selected-entries/date-range picker — the
  service layer already supports the latter, just not the UI.
- **Grocery pre-generation customization.** Optional-ingredient/substitute
  customization is currently post-generation only (via the generated
  list's own UI); there's no pre-generation per-ingredient step at the
  source-selection screen. Open product-scope choice, not yet checked in
  on with the owner.
- **Contact page topic-selector field** — deliberately deferred, not
  added (would touch schema, email template, and action together). Still
  a "maybe later" if wanted.
- **Meal Plan yield-unit pluralization.** "Makes 1 servings" doesn't
  pluralize — a pre-existing, consistent convention across the whole app
  (same non-pluralized interpolation exists on the canonical Recipe/Part
  detail page), not an isolated typo. Needs a decision on whether yield
  units should carry singular/plural forms before fixing broadly.

## B. Known gaps and small fixes (no owner decision needed)

- `groceryService.reorderGroceryCategories` has the same "only validates
  submitted ids, doesn't check the complete owned set" gap that was found
  and fixed for `reorderTasters`.
- `duplicateDish` (ordinary same-account "Duplicate," not sharing) still
  silently drops MATERIALIZED PartLink content, unlike the sharing copy
  engine that was later built to handle it correctly — worth matching if
  Duplicate is expected to be equally faithful.
- `PartUsageResolutionKind` (`dishes/service.ts`) and
  `PartUsageResolutionValue` (`dishes/schema.ts`) are the same string
  union defined under two different names — harmless, worth reconciling.
- Cosmetic: client-to-client callback props (`onRemove`, `onDetach`,
  etc.) trigger a false-positive "props must be serializable" warning
  from the Next.js TS plugin — left as-is.
- Cuisine combobox's browser-native `<datalist>` dropdown styling needs a
  cross-browser acceptability check.
- About page's "01"/"02" numerals sit close to their card's
  `overflow-hidden` edge — cosmetic, very low severity.
- Home's `#framework` timeline (the numbered list, not the step strip)
  doesn't fill its container width at ≥1536px — minor, cosmetic.
- `AboutFrameworkThreadSegment`'s fixed `h-20` height is hard-pinned to
  the row `gap-28` spacing value — if that gap value ever changes, the
  thread height must be updated to match (not automatically derived).
- Three explicitly-scoped-but-unbuilt public-page design opportunities,
  recommended for after authenticated-page design work, not urgent:
  extending the connector-line motif into `ClosingCta`'s background; a
  literal connective thread through About's icon circles; a more
  distinctly-DishFrame navbar active-link treatment and a faint
  connector texture behind Contact's form background.

## C. Test debt

- `page.test.tsx` and `public-header.test.tsx` assert stale copy ("Start
  building") against the now-rewritten public-page components and will
  fail as committed — known, intentional (design was still iterating),
  but still real test debt.
- `dish-editor.test.tsx` has one stale assertion querying button names
  "Expand Sauce"/"Collapse Sauce" that should now read "Edit Sauce."
- No Playwright/E2E coverage exists for: sharing accept/decline/cancel
  flows, account deletion (destructive/session-ending flow), several
  onboarding-adjacent areas, and the Meal Plans/Grocery Lists/Slice
  16–17 sharing UI generally — integration tests cover the server-side
  outcomes; manual click-throughs were recommended as a stand-in before
  production reliance.
- CoachMark styling/placement has had no responsive/visual design pass.

## D. Manual QA still to run

- **Slice 22 (multi-Recipe sharing) production checklist**, none of
  which has been exercised yet: a real two-account Google-sign-in smoke
  test proving claim-on-signup + `/share` reconciliation works live; a
  ~12-Recipe "family-sized" collection send/accept timing check; a
  50-Recipe maximum-size stress check for Vercel/Neon timeout and
  all-or-nothing behavior (if unsafe, lower the product max to ~20–25
  rather than weaken the atomicity guarantee); a general seeded-state
  visual/UX review of the collection dialogs and Sent/Received sections.
- Barcode scanning on real iOS Safari and Android Chrome: camera
  permission allow/deny, immediate dialog close during scanner startup,
  camera indicator/stream stopping after success/cancel/timeout/close, a
  recognized and unrecognized retail barcode, no-camera desktop fallback.
- Account/security, manual-only (not seedable): multi-device session
  listing/revocation, "sign out all other sessions," stale-session
  (~24h) reauthentication prompts, disposable-account deletion and
  survival of another user's accepted copy/shared image, sender-facing
  rendering of a canceled share after the recipient's account is
  deleted.
- Chrome/Safari real Print Preview and Save-as-PDF: Letter vs. A4,
  long/nested-Part page breaks, Safari `@page` margin quirks.
- Full mobile/tablet design audit, dark-theme audit, and a comprehensive
  accessibility audit for the redesigned public pages — explicitly
  deferred, not yet done, along with a general manual desktop/mobile
  browser verification pass of the redesign itself.
- `/meal-plans`'s "Sync now" affordance discoverability — is it obvious
  enough, or does it read as a dead button when nothing looks stale?
  Judge manually during a review pass.
- Consider adding a documented "empty"/first-run counterpart QA seed
  account as a standing fixture — the Slice 21 structural/empty-state
  audits could only reach empty states via a manually-created throwaway
  account.

## E. Accepted edge cases (not bugs — logged so they aren't rediscovered)

- A manually-removed optional grocery item can reappear after a later
  unrelated Meal-Plan resync if the producing entry is still live and
  untouched (`applyGroceryListSourceRefresh`'s "added" fold-in has no
  memory of deliberate removal). Pre-existing since Slice 12, not a
  regression.
- An `ImageAsset` created via upload-token issuance that's never attached
  to a saved `DishVersion` (abandoned edit) has no cleanup path — no
  scheduled-job infrastructure exists yet to sweep it.
- `DirectShare.frozenImageAssetIds` has no GIN index (unindexed
  array-containment scan in orphan cleanup) — fine at current
  personal/family scale, revisit only if volume grows materially.
- Export's Version-selection dropdown lists every Version with no
  pagination — untested at large Version-history scale.
- Print output does not show source-recipe provenance for an
  accepted/imported copy — explicitly out of scope, not a bug.

## F. Deployment / infrastructure follow-ups

Immediate manual checks after any redeploy:

- Confirm `robots.txt` allows `/`, `/about`, `/contact`, `/privacy`,
  `/terms`, disallows the signed-in app and `/api/*`, and references the
  production sitemap.
- Confirm `sitemap.xml` lists the public routes at the production
  origin.
- Spot-check homepage JSON-LD, canonical tags, the Open Graph image (via
  a social-share debugger), the branded 404 page, and `noindex` on
  private routes (e.g. `/sign-in`).
- Confirm Speed Insights is enabled for the `dishframe` Vercel project
  (the `<SpeedInsights />` component is already mounted; the dashboard
  toggle is separate).
- Check production runtime/build logs after any change to the
  route-level metadata files (`sitemap.xml`, `robots.txt`,
  `manifest.webmanifest`, icons, OG images).

Search launch:

- Add the production URL as a property in Google Search Console, submit
  the sitemap, and check indexing status once public copy/structure have
  stabilized.
- Repeat for the final custom domain once attached (Search Console
  properties are origin-specific).

Custom domain (not yet attached):

- Choose/purchase a domain, attach it in Vercel, decide apex vs. `www`.
- Update `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, Better Auth trusted
  origins, and the Google OAuth authorized origin/redirect URI.
- Re-verify canonical tags, OG URLs, sitemap, and `robots.txt` after
  redeploying; add the domain to Search Console; preserve redirects from
  `dish-frame.vercel.app`.

Resend domain upgrade (optional; email already works via
`onboarding@resend.dev`):

- Verify a DishFrame-owned domain in Resend, configure SPF/DKIM, replace
  `CONTACT_FROM_EMAIL`, retest the contact form's `replyTo`.

Security hardening:

- Evaluate a report-only CSP first (`Content-Security-Policy-Report-Only`)
  — only the conservative headers (`X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`) ship today.
  Enforce only after a report-only period shows no unexpected
  violations.
- Review dependency vulnerabilities periodically (`pnpm audit` or
  Vercel/GitHub's automated alerts).
- Revisit Better Auth's session-cookie configuration (30-day sessions, no
  device limit — chosen as proportionate to a personal/family product)
  if the product ever opens beyond personal/family use.
- Consider durable rate limiting for `/api/*` and the contact form once
  real public traffic warrants it (the honeypot + time-trap on the
  contact form is a spam deterrent, not a hard security boundary).

Monitoring/analytics (optional, install only once there's a concrete
need): Vercel Web Analytics, error monitoring (e.g. Sentry), uptime
monitoring for the production URL and `/api/health`, Neon usage/compute
alerts, Resend delivery monitoring.

Preview/environment isolation:

- Separate Neon branch/database for Vercel Preview deployments, with
  Preview `DATABASE_URL`/`DIRECT_URL` scoped accordingly.
- Decide a preview OAuth strategy (Preview URLs are already trusted via
  `VERCEL_URL` in `src/lib/auth/auth.ts`, but aren't individually
  registered with Google).
- Decide preview Resend restrictions so preview traffic can't send from
  the production sender identity or notify the real `CONTACT_TO_EMAIL`.

Final brand assets: final typography review (Manrope/Inter are still
provisional per `BRANDING.md`) and final contrast testing across light
and dark themes. (Logo, favicon/app-icon set, and social card are
already final — done.)

## G. Legal

`/privacy` and `/terms` exist and are grounded in the actual
implementation (see `BRANDING.md` "Privacy and Terms"), but **neither has
had professional legal review** — required before any broad commercial
launch. Also still open: a cookie disclosure (only if/when analytics is
added, per Monitoring above); a public recipe-sharing policy note (now
relevant, since direct/link sharing is built).

## H. Tier 3 / post-launch product ideas (optional, not committed)

Dependent on future product decisions — see `PRODUCT_ROADMAP.md` §8 for
the full list and rationale. Not scoped into any slice:

- Installable PWA, offline recipe viewing, offline cooking mode, service
  worker, background sync, wake lock, timer persistence across
  navigation/refresh, home-screen icons tuned for standalone use —
  dependent on a future cooking-mode specification.
- Rotation/meal-planning insights, recipe/cooking statistics, website
  recipe import, automatic ingredient-level nutrition calculation,
  native mobile app, public directory enhancements, advanced cooking
  scheduling, OCR recipe import.
- Recipe Gallery-specific importer (the generic paste-and-review importer
  at `/recipes/import` is the deliberate interim substitute — no
  `/parts/import` equivalent exists either).

## I. Future audit

- After the remaining logged-in flows finish their design/UX review,
  perform a final comprehensive engineering/accessibility audit of the
  application. The public pages and already-completed top-level
  authenticated pages have already received an architecture/performance,
  code-hygiene, reliability/data-integrity, Lighthouse, and accessibility
  review — don't independently redo that work later unless those pages or
  their shared implementation have materially changed. The future audit
  should concentrate especially on the flows still being redesigned, then
  do only the necessary regression/reintegration review of previously
  audited shared code.
