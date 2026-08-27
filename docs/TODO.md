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

(Account/Dish export's restore/import semantics — previously open here —
are resolved as a deliberately deferred standalone feature; see section H's
"Structured Dish/account JSON restore/import.")

## B. Known gaps and small fixes (no owner decision needed)

(none open right now)

## C. Test debt

- No Playwright/E2E coverage exists for: account deletion
  (destructive/session-ending flow), several onboarding-adjacent areas,
  and the Meal Plans/Grocery Lists UI generally — integration tests cover
  the server-side outcomes; manual click-throughs were recommended as a
  stand-in before production reliance. (Direct-sharing's own
  accept/decline/sender-cancel flows now have E2E coverage —
  `tests/e2e/direct-sharing.spec.ts`, added in the 2026-08-27 second
  follow-up; see `CODE_AUDIT.md`. Written, not yet run by the owner.)

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
- `/meal-plans`'s "Sync now" affordance discoverability — is it obvious
  enough, or does it read as a dead button when nothing looks stale?
  Judge manually during a review pass.
- Consider adding a documented "empty"/first-run counterpart QA seed
  account as a standing fixture — the Slice 21 structural/empty-state
  audits could only reach empty states via a manually-created throwaway
  account.
- Cuisine combobox's browser-native `<datalist>` dropdown styling needs a
  cross-browser acceptability check — genuine cross-browser visual
  judgment, not a speculative code fix.

## E. Accepted edge cases (not bugs — logged so they aren't rediscovered)

- A manually-removed optional grocery item can reappear after a later
  unrelated Meal-Plan resync if the producing entry is still live and
  untouched (`applyGroceryListSourceRefresh`'s "added" fold-in has no
  memory of deliberate removal). Pre-existing since Slice 12, not a
  regression.
- Print output does not show source-recipe provenance for an
  accepted/imported copy — explicitly out of scope, not a bug.
- Client-to-client callback props (`onRemove`, `onDetach`, etc.) trigger a
  false-positive "props must be serializable" warning from the Next.js TS
  plugin — a known framework/tooling false positive, not a real defect;
  not worth contorting component architecture to silence.

## F. Deployment / infrastructure follow-ups

Immediate manual checks after any redeploy:

- Confirm `robots.txt` allows `/`, `/about`, `/contact`, `/privacy`,
  `/terms`, disallows the signed-in app and `/api/*`, and references the
  production sitemap. (Source-code correctness audited 2026-08-27 — see
  `robots.ts`/`sitemap.ts` and the `(cook)`/`(share)` layout `noindex`
  metadata; this is the eventual live-production spot-check, still
  owner-run.)
- Confirm `sitemap.xml` lists the public routes at the production
  origin.
- Spot-check homepage JSON-LD, canonical tags, the Open Graph image (via
  a social-share debugger), the branded 404 page, and `noindex` on
  private routes (e.g. `/sign-in`) and on public share links (`/s/*`).
- Check production runtime/build logs after any change to the
  route-level metadata files (`sitemap.xml`, `robots.txt`,
  `manifest.webmanifest`, icons, OG images).
- Set `CRON_SECRET` as a Vercel project env var (see `.env.example`) and
  confirm the `cleanup-orphan-images` Vercel Cron entry (`vercel.json`)
  is registered and firing — check the Vercel dashboard's Cron Jobs tab
  after the first deploy, since a missing/misconfigured `CRON_SECRET`
  makes the endpoint 503 rather than fail loudly.

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

## G. Legal

`/privacy` and `/terms` exist and are grounded in the actual
implementation (see `BRANDING.md` "Privacy and Terms"), but **neither has
had professional legal review** — required before any broad commercial
launch. Also still open: a cookie disclosure (only if/when analytics is
added, per Monitoring above).

## H. Tier 3 / post-launch product ideas (optional, not committed)

Dependent on future product decisions — see `PRODUCT_ROADMAP.md` §8 for
the full list and rationale. Not scoped into any slice:

- **Structured Dish/account JSON restore/import.** The structured
  Dish/account JSON export (`importExport/export-dto.ts`) exists, but
  there is deliberately no restore/import path for that format yet. As
  established during the 2026-08-27 export audit follow-up, building one
  is a real, standalone project (Dish/Version/PartLink id-remapping,
  Tasters, Cooking history, Grocery Lists, Meal Plans, preferences), not
  an accidental omission. A future restore feature should do a
  non-destructive restore into fresh ids,
  remap relationships rather than assume the originals still exist, and
  recreate any active public-publication state with fresh tokens/links.
  Direct-sharing relationships (sender/recipient identity) are
  intentionally not portable — they don't get reconstructed on restore.
- Offline recipe viewing, offline cooking mode, a service worker,
  background sync, wake lock, and timer persistence across
  navigation/refresh remain undone — dependent on a future cooking-mode
  specification. (Installable-PWA basics — the web app manifest and
  home-screen/maskable icons tuned for standalone use — already shipped;
  see "Final brand assets" under section F.)
- Rotation/meal-planning insights, recipe/cooking statistics, website
  recipe import, automatic ingredient-level nutrition calculation,
  native mobile app, public directory enhancements, advanced cooking
  scheduling, OCR recipe import.
- Recipe Gallery-specific importer (the generic paste-and-review importer
  at `/recipes/import` is the deliberate interim substitute — no
  `/parts/import` equivalent exists either).

## I. Future audit

- **A comprehensive engineering/code-quality audit of the whole repository
  is done** (2026-08-27, see `CODE_AUDIT.md`) — Recipe/Part core, Cooking
  Mode, Meal Plans, Grocery Lists, Sharing/Export, shared infra/auth, and
  tooling/tests/CI/deps were all covered, findings fixed, and a 2026-08-27
  follow-up pass resolved the three items that needed a product decision
  (MATERIALIZED PartLink fidelity, the grocery sync-flag gap, and
  publication state in export — the narrower follow-up item that surfaced
  while implementing the last of these, the export format's missing
  restore/import path, has since been resolved as a deliberately deferred
  Tier 3 feature; see section H). Don't schedule another full-repo
  engineering audit from scratch; a future pass should scope itself to
  whatever materially changed since, or to a specific area of concern.
- The public pages and already-completed top-level authenticated pages
  have also already received a design/UX/accessibility review
  (architecture/performance, code-hygiene, reliability/data-integrity,
  Lighthouse, and accessibility) — don't independently redo that work
  later unless those pages or their shared implementation have materially
  changed.
- What remains open is narrower: once the remaining logged-in flows finish
  their own design/UX review, do only the necessary regression/
  reintegration check of previously audited shared code they touch — not
  a repeat of either audit above.
