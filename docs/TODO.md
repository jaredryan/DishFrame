# DishFrame — TODO

Durable tracking of genuinely unfinished, deferred, or open work. This is
the one temporary planning/status document in `docs/`; the other docs are
living reference documents. Update this file as work is completed or new
deferred work is identified.

Production URL: `https://dish-frame.vercel.app`

---

## A. Current finish line

### 1. Meal Plans / Grocery Lists

Complete the remaining hands-on product/design review before treating these
flows as stable:

- **Meal-Plan grocery-generation UI scope.** Whole-plan-only (current
  behavior) vs. exposing the selected-entries/date-range capability already
  supported by the service layer.
- **Grocery pre-generation customization.** Decide whether
  optional-ingredient/substitute choices should remain post-generation only
  or gain a pre-generation step.
- **Removed-item resync behavior.** Revisit whether a manually removed
  optional grocery item should be remembered/suppressed instead of
  reappearing after an unrelated Meal-Plan resync while its producing entry
  remains live.
- **`Sync now` discoverability.** Judge during the Meal Plan review whether
  the affordance is sufficiently obvious when nothing visibly looks stale.
- **Yield-unit pluralization.** Decide whether the broader yield model should
  support singular/plural forms rather than special-casing strings such as
  `Makes 1 servings`.
- Finish any remaining design/functionality polish discovered through normal
  use of Meal Plans and Grocery Lists.

### 2. Remaining E2E / manual QA

After Meal Plans and Grocery Lists stabilize:

- Add/complete Playwright coverage for account deletion,
  onboarding-adjacent areas, and the Meal Plans/Grocery Lists UI. Server-side
  outcomes already have integration coverage.
- Run the Slice 22 multi-recipe sharing production checklist:
  - real two-account Google-sign-in smoke test for claim-on-signup +
    `/share` reconciliation;
  - ~12-recipe family-sized collection timing;
  - 50-recipe maximum-size stress check for Vercel/Neon timeout and
    all-or-nothing behavior;
  - seeded-state visual/UX review of collection dialogs and Sent/Received.
  If the 50-item test exposes share-graph performance problems, revisit the
  currently sequential sibling-PartLink traversal rather than weakening the
  atomicity guarantee.
- Real-device barcode scanning on iOS Safari and Android Chrome: permission
  allow/deny, immediate close during startup, stream/camera shutdown after
  success/cancel/timeout/close, recognized/unrecognized barcode, and
  no-camera desktop fallback.
- Account/security manual checks: multi-device session listing/revocation,
  sign out all other sessions, stale-session reauthentication, disposable
  account deletion, survival of another user's accepted copy/shared image,
  and sender rendering after recipient-account deletion.
- Chrome/Safari Print Preview and Save-as-PDF: Letter vs. A4, long/nested-Part
  page breaks, Safari `@page` margin quirks.
- Cuisine `<datalist>` dropdown: cross-browser visual acceptability check.
- Consider a documented empty/first-run QA seed account as a standing fixture.

Direct-sharing accept/decline/sender-cancel E2E coverage already exists and
has been exercised as part of owner-run verification.

### 3. Recipe Gallery migration

Move the existing ~40 Recipe Gallery recipes into DishFrame.

Preferred workflow: normalize each source recipe into a predictable
DishFrame-friendly text structure before using the existing
`/recipes/import` paste-and-review flow, rather than relying on heterogeneous
source formatting to parse consistently. This is a one-time content migration;
it does not require building a dedicated Recipe Gallery importer.

## B. Accepted limitations / scale assumptions

These are not active bugs. Keep them here so they are not repeatedly
rediscovered as cleanup work.

- Print output does not show source-recipe provenance for an
  accepted/imported copy; explicitly out of scope.
- Client-to-client callback props (`onRemove`, `onDetach`, etc.) can trigger a
  false-positive "props must be serializable" warning from the Next.js TS
  plugin; do not contort component architecture to silence it.
- `ingredient-gather.ts` can re-walk the same Dish/Part ingredient tree across
  separate calls (for example, multiple Meal Plan entries referencing the
  same Part). Revisit only if profiling or Meal Plan use shows meaningful
  latency.
- `queryDishLibrary` currently fetches the matching library set and
  ranks/sorts in memory. This is acceptable at personal-library scale; revisit
  only if real library sizes grow enough to make it measurable.

## C. Deployment / launch follow-ups

### Search launch

Production metadata/crawler behavior, sitemap, canonicals, JSON-LD, public and
private `noindex` behavior, Open Graph presentation, the branded 404, and the
orphan-image Cron were source-audited and live-checked on 2026-08-27. The
production `cleanup-orphan-images` Cron is configured with `CRON_SECRET` and
successfully completed a manual production invocation.

Still open:

- Add `https://dish-frame.vercel.app` to Google Search Console, submit the
  sitemap, and check indexing status when desired.
- Repeat Search Console setup for a future custom domain, since properties are
  origin-specific.

### Custom domain (only if/when wanted)

- Choose/purchase a domain, attach it in Vercel, and decide apex vs. `www`.
- Update `NEXT_PUBLIC_APP_URL`, `BETTER_AUTH_URL`, Better Auth trusted origins,
  and Google OAuth authorized origin/redirect URI.
- Re-verify canonicals, OG URLs, sitemap, and `robots.txt`; preserve redirects
  from `dish-frame.vercel.app`.

### Resend domain upgrade (optional)

Email currently works through `onboarding@resend.dev`.

- Verify a DishFrame-owned domain in Resend, configure SPF/DKIM, replace
  `CONTACT_FROM_EMAIL`, and retest the contact form's `replyTo`.

### Security hardening for broader public use

- Evaluate a report-only CSP before enforcing one.
- Review dependency vulnerabilities periodically (`pnpm audit` and/or
  Vercel/GitHub alerts).
- Revisit Better Auth's current 30-day/no-device-limit session policy if the
  product opens beyond personal/family use.
- Add durable rate limiting for `/api/*` and the contact form if real public
  traffic warrants it.

### Monitoring / analytics (optional)

Only add once there is a concrete need: Vercel Web Analytics, error monitoring
such as Sentry, uptime monitoring for production and `/api/health`, Neon
usage/compute alerts, or Resend delivery monitoring.

### Preview/environment isolation (future)

- Separate Neon branch/database for Vercel Preview deployments.
- Decide a preview OAuth strategy.
- Prevent preview Resend traffic from using the production sender identity or
  notifying the real `CONTACT_TO_EMAIL`.

## D. Legal before broad commercial launch

`/privacy` and `/terms` exist and are grounded in the implementation, but
neither has had professional legal review. Obtain review before any broad
commercial launch.

Add cookie disclosure only if/when analytics or other tooling makes one
necessary.

## E. Tier 3 / future product ideas

Optional and not committed. See `PRODUCT_ROADMAP.md` for broader rationale.

- **Structured Dish/account JSON restore/import.** Structured export exists,
  but restore is deliberately deferred as a standalone feature. A future
  implementation should restore non-destructively into fresh IDs, remap
  relationships, recreate active public-publication state with fresh
  tokens/links, and not reconstruct direct-sharing sender/recipient
  relationships.
- **Contact-page topic selector.** Deliberately deferred; adding it would touch
  schema, email template, and action together.
- Offline recipe viewing / Cooking Mode, service worker, background sync, wake
  lock, and timer persistence across navigation/refresh.
- Rotation/meal-planning insights, recipe/cooking statistics, website recipe
  import, automatic ingredient-level nutrition calculation, native mobile
  app, public-directory enhancements, advanced cooking scheduling, and OCR
  recipe import.
- Recipe Gallery-specific importer. The generic paste-and-review importer is
  the deliberate current substitute; the one-time Recipe Gallery migration
  above does not by itself justify a dedicated importer. No `/parts/import`
  equivalent exists either.

## F. Future audit / review guardrail

A comprehensive repository-wide engineering/code-quality audit was completed
on **2026-08-27**, covering recipe/Part core, Cooking Mode, Meal Plans/Grocery
Lists, Sharing/Export, shared infrastructure/auth, tooling/tests/CI, migrations,
and related tests. All actionable findings were resolved or transferred into
this TODO. Subsequent targeted follow-ups also closed the orphan-image cleanup,
metadata/crawler, export/version-scaling, direct-sharing E2E, and related
correctness gaps.

**Do not schedule another broad repository audit from scratch unless DishFrame's
architecture or major subsystems materially change.** Future engineering
reviews should target the areas that changed or a concrete observed concern.

The public pages and already-completed top-level authenticated pages have also
received design/UX/accessibility review. Once Meal Plans and Grocery Lists
finish their remaining review, do only targeted regression/reintegration checks
for shared code they materially changed rather than repeating the earlier
audits.
