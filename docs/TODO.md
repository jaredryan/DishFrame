# DishFrame — TODO

Track unfinished software work, verification, and open product decisions here.
Remove completed items; maintain implementation details in living reference docs.
Conditional public-launch work belongs in `PRE_LAUNCH_TODO.md`; optional product
ideas belong in `PRODUCT_ROADMAP.md`.

Production: https://dish-frame.vercel.app

## 1. Targeted engineering work

- [x] `ingredient-gather.ts` repeated traversal — added a bounded,
  per-operation `IngredientGatherCache` (2026-09-15): `gatherIngredientSlots`
  now takes an optional cache, memoizing (a) each top-level `dishVersionId`'s
  fully-resolved slots and (b) each nested Part's raw (unscaled) DB content
  by `(ownerId, targetDishId, targetVersionId)`, so a Part shared by several
  selected Recipes/Parts, or the same Recipe/Part appearing twice, is fetched
  once per call instead of once per occurrence. `generateGroceryList` and
  `collectMealPlanOccurrences` now create and share one cache across their
  own `sources`/`entries` loop; every other call site keeps its own
  single-call cache (behavior-neutral). The cache is never persisted or
  shared across requests, and multiplier composition is unchanged — only the
  DB fetch and the top-level walk are reused. Regression coverage in
  `grocery-list.integration.test.ts`/`mealplans.integration.test.ts`, each
  asserting per-occurrence quantities and the final aggregate, not just that
  fetching was deduplicated: a shared nested Part reached through two
  Recipes with *different multipliers* (2x and 3x) in one
  `generateGroceryList` call; the exact same Recipe/Version selected twice
  with *different scale factors* (1x and 2.5x) in one `generateGroceryList`
  call, isolating the `topLevel` slots-array cache specifically; the exact
  same Recipe/Version planned on two dates with the same implicit scale
  factor (no cross-entry drop); and the exact same Recipe/Version planned
  twice with *different target yields* (scale factors 1x and 2.5x) in one
  `generateGroceryListFromMealPlan` call, the `collectMealPlanOccurrences`
  analogue of the scale-factor-isolation case. Follow-up review (2026-09-15)
  re-inspected the cache for mutation/aliasing risk: the `content` cache
  holds only raw, read-only Prisma rows that are never mutated (multiplier
  application always produces new objects in `toVariant`/`sectionSlots`),
  and the `topLevel` cache holds `IngredientSlot[]` that `resolveIngredientOccurrences`
  only ever maps into new occurrence objects, never mutates in place — so
  sharing either cached reference across different multipliers/scale
  factors is safe by construction, confirmed by the tests above.
- [x] `queryDishLibrary` fetching/ranking/sorting — reviewed
  (2026-09-15). A prior audit (`docs/performance-architecture-audit.md`,
  "Recipe library/list loading and filtering") already found this the
  best-optimized flow in the app and explicitly accepted no DB-level
  pagination at this app's personal-library scale. Pushing ranking/sorting
  into SQL isn't practical without disproportionate complexity: relevance
  tiering (`computeSearchTier`), the principal-rating computation, and the
  last-cooked lookup are cross-cutting business rules that would have to be
  duplicated (and kept in sync) in SQL, for no benefit at current library
  sizes — left as an accepted tradeoff, matching the audit. Fixed the one
  real, bounded inefficiency found: `cuisineNames` was sorted/mapped twice
  per candidate during an active search (once for `computeSearchTier`, once
  for the final shape) — now computed once into a `cuisineNamesById` map and
  reused. Search/filter/sort/rating/pagination behavior is unchanged.
  Regression coverage: a cuisine-name-consistency test added to
  `dish-library.integration.test.ts` covering both the searched and
  unfiltered paths.
- [x] Next.js callback-prop serializability warnings — investigated
  (2026-09-15). Root cause confirmed by reading the actual rule
  (`node_modules/next/dist/server/typescript/rules/client-boundary.js`): the
  warning fires only for a component exported directly from a file with its
  own `"use client"` directive, on that file's own declared prop types —
  regardless of whether any real caller is a Server Component. Several
  purely client-to-client leaf components had a redundant `"use client"`
  (never imported by a Server Component/page — every import site was itself
  already client, so the directive did nothing per Next's own docs: a file
  reached only through a client parent's module graph doesn't need its own
  directive) and had their callback props renamed to a fake `...Action`
  suffix specifically to dodge the warning. Removed the redundant directive
  and reverted the disguised names, verifying every import site first:
  `components/ui/confirm-dialog.tsx` (`onOpenChangeAction`→`onOpenChange`,
  `onConfirmAction`→`onConfirm` — ~15 call sites, plus its test),
  `components/domain/mealplans/schedule-shared.tsx` (`onAddMealAction`→
  `onAddMeal`, `onEditItemAction`→`onEditItem`, `onDeleteItemAction`→
  `onDeleteItem`, `onReorderAction`→`onReorder`, `onToggleEatenAction`→
  `onToggleEaten`, `onMarkAllEatenAction`→`onMarkAllEaten`),
  `components/domain/dish/filter-popover.tsx` (`onToggleAction`→`onToggle`,
  `onClearAction`→`onClear`), `components/domain/dish/sort-select.tsx`
  (`onChangeAction`→`onChange`), `components/domain/dish/file-dropzone.tsx`
  (`onFileSelectedAction`→`onFileSelected`),
  `components/domain/mealplans/plan-modal.tsx` (`onOpenChangeAction`→
  `onOpenChange`, `onSubmitAction`→`onSubmit`). Genuine entry points reached
  directly from a Server Component page (`dish-editor.tsx`,
  `grocery-source-picker.tsx`, `grocery-list-detail-view.tsx`,
  `meal-plan-editor.tsx`, `start-cooking-button.tsx`) were left untouched —
  their own top-level exported props carry no function members, so they
  don't trigger the warning and don't need a boundary change.
  **Follow-up (2026-09-15): completed the deferred import-boundary
  tracing.** Wrote a full upward-closure trace (every importer, recursively,
  stopping at a confirmed `"use client"` ancestor or flagging a real
  `src/app/**/page.tsx`/`layout.tsx` reach) for the five files this pass had
  left unresolved — no barrel/index re-export files exist in this codebase,
  so the trace is exact, not approximate:
  - `email-chip-input.tsx`, `start-timer-dialog.tsx`, `version-picker.tsx`,
    `version-picker-field.tsx` — every production import path resolves to an
    already-`"use client"` ancestor; none is ever reached from a Server
    Component. Directive removed and disguised props reverted to honest
    names, verifying every call site:
    - `components/ui/email-chip-input.tsx`: `onChangeAction`→`onChange`.
    - `components/domain/cooking/start-timer-dialog.tsx`:
      `onOpenChangeAction`→`onOpenChange`, `onCreatedAction`→`onCreated`
      (3 call sites: `cooking-mode-desktop-layout.tsx`,
      `cooking-mode-mobile-layout.tsx`, `cooking-mode-tablet-layout.tsx`).
    - `components/domain/dish/version-picker.tsx`: `onChangeAction`→
      `onChange`.
    - `components/domain/dish/version-picker-field.tsx`
      (`RichVersionPickerField`, `RichDishVersionPicker`, and the internal
      `useDishVersionOptions` hook): `onChangeAction`→`onChange`. This one
      prop name was shared by every remaining caller across the app
      (`start-cooking-button.tsx`, `cooking-setup.tsx`,
      `bulk-publish-dialog.tsx`, `direct-share-single-item-dialog.tsx`,
      `direct-share-collection-dialog.tsx`, `share-dialog.tsx`,
      `dish-detail-actions.tsx`, `part-link-picker-dialog.tsx`,
      `version-compare-picker.tsx`, `version-selector.tsx`,
      `grocery-source-picker.tsx`, `grocery-list-detail-view.tsx`,
      `meal-plan-editor.tsx`), all updated; `dish-editor.tsx`'s own separate,
      genuinely-required `onCreatedAction` prop (a different concept — an
      optional post-create callback, not a version-picker `onChange`) was
      left untouched, since `dish-editor.tsx` is one of the confirmed
      genuine Server-reachable entry points from the original pass.
  - `dish-detail-actions.tsx` — **has a real, load-bearing boundary and
    keeps `"use client"`.** Traced to
    `src/app/(app)/recipes/[dishId]/page.tsx` and
    `src/app/(app)/parts/[dishId]/page.tsx`, both Server Components, via
    `dish-detail-view.tsx` (no `"use client"` of its own — a genuine Server
    Component that renders `<DishDetailActions>` directly). This is the
    concrete boundary requiring the declaration. Its own exported
    `DishDetailActions` props (`dishId`, `dishTitle`, `kind`, `stage`,
    `currentVersionId`) carry no function members, so it was never actually
    triggering the warning itself and needed no change — the `...Action`
    names found nearby in this file are internal call sites of
    `ConfirmDialog`/`VersionPicker`/`RichVersionPickerField` (already fixed
    above), not a declaration of its own.
  No remaining "not confidently traced" item from this section.

## 2. Security hardening for current use

- [x] Report-only CSP added (2026-09-15, `next.config.ts`) — `default-src
  'self'` plus per-directive allowances for this app's actual surface
  (self-hosted `next/font`, same-origin Blob image proxy, same-origin
  Vercel Speed Insights beacon at `/_vercel/speed-insights/*`, no external
  script/style/font/image hosts anywhere in the app). `script-src`/
  `style-src` both still carry `'unsafe-inline'` — next.config.ts's own doc
  comment on `cspReportOnly` lists exactly what's needed before dropping it
  (a nonce-issuing middleware threaded into next-themes' bootstrap
  script/style and the JSON-LD script; Radix/@dnd-kit inline `style`
  attributes need `'unsafe-inline'` regardless, via `style-src-attr`).
  Reports post to `/api/csp-report` (new route — rate-limited, logs via
  `console.warn`, nothing persisted); a `Report-To` header pairs with it
  for browsers using the modern Reporting API. Also fixed a live bug found
  while touching this header block: `Permissions-Policy`'s `camera=()`
  was blocking the in-app barcode scanner's `getUserMedia` call outright —
  now `camera=(self)`. Added `X-Frame-Options: DENY` and CSP
  `frame-ancestors 'none'` (this app is never meant to be iframed).
  **Watch `/api/csp-report` output for a while before enforcing.**
- [x] Dependency vulnerabilities reviewed (2026-09-15, `pnpm audit`) — was 2
  critical / 21 high / 22 moderate / 1 low. Fixed: `next` 16.2.11→16.3.5
  (the 2 criticals — unauthenticated RCE on Windows hosts and in AVIF image
  optimization — plus most of the postcss/nanoid chain bundled inside
  Next's own build pipeline), `sharp` ^0.34.5→^0.35.4 (libvips CVEs),
  `eslint-config-next` bumped to match, `vitest` ^4.1.10→^4.1.11. Added
  `pnpm.overrides` (see `package.json`) pinning `postcss`, `nanoid`,
  `undici`, `ip-address`, `qs`, `js-yaml`, `fast-uri`, `hono`,
  `@hono/node-server`, `find-my-way`, `valibot`, `mysql2` to their patched
  versions — all patch/minor bumps within their existing major, all
  transitive through dev-only tooling (`eslint`, `shadcn`'s CLI, `prisma`'s
  own dev/config tooling), never shipped to production or reachable by an
  end user. Result: 0 critical / 1 high / 0 moderate / 0 low.
  **Remaining, accepted:** `deepmerge-ts` (high, stack-exhaustion DoS)
  nested under `prisma`'s own internal `@prisma/config` dev tooling —
  fixed version is a major bump (7→8) of a package we don't depend on
  directly; forcing it via override risks breaking Prisma's own CLI for a
  path that's dev-only and never network-exposed. Revisit when `prisma`
  itself bumps it upstream.
  **Ongoing review:** re-run `pnpm audit` periodically (e.g. monthly, or
  before each `release:production`) and apply the same
  patch/minor-only-unless-directly-affected-and-necessary policy; a major
  bump on a directly-depended package (e.g. Prisma 7→8, seen as available
  during this pass) is a separate, deliberate upgrade decision, not a
  vulnerability fix.
- [x] Durable, cross-instance rate limiting added (2026-09-15) — a Postgres-
  backed fixed-window counter (`RateLimitHit` table,
  `src/lib/rate-limit/limit.ts`, atomic single-statement upsert), not an
  in-memory counter, so the limit holds across every concurrent Vercel
  serverless instance. New migration `add_rate_limit_hit`
  (not yet applied — run `pnpm db:migrate:local` locally, then deploy the
  usual way; no new env vars). Wired into: the contact form (5/15min per
  IP, `src/app/(marketing)/contact/actions.ts`), image upload (30/10min
  per user), account/dish export (20/10min per user, shared bucket), the
  new `/api/csp-report` sink (60/min per IP), and Better Auth's
  credential/account-creation paths — `sign-in/social` (the only one this
  app actually uses today; email/password isn't configured in `auth.ts`),
  `sign-in/email`, `sign-up/email`, `reset-password` (20/5min per IP,
  `src/app/api/auth/[...all]/route.ts`) — deliberately **not** `get-session`
  or other high-frequency paths, which would throttle ordinary usage.
  Left alone: `GET /api/images/[assetId]` (every image render — high
  legitimate frequency) and the cron endpoint (already gated by
  `CRON_SECRET`). Better Auth's own built-in rate limiter (enabled by
  default in production) is still in-memory/per-instance by default; its
  Prisma "database" storage mode expects an internally-shaped `rateLimit`
  table that isn't part of Better Auth's own CLI schema generator for this
  version, so wiring it in blind was judged too risky for the auth path —
  the custom route-level limiter above covers the same paths durably
  instead.
  **Follow-up (2026-09-15), three items checked, two fixed:**
  - *Storage cleanup* — rows were never deleted, so a distinct key
    (mostly IPs) that stops recurring left its row behind forever. Added
    `cleanupExpiredRateLimitHits()` (deletes rows with `windowStart` older
    than 24h, well past every window this app uses), called from the
    existing daily `/api/cron/cleanup-orphan-images` cron rather than a
    second schedule.
  - *Identity/keying* — anonymous keys now prefer `x-vercel-forwarded-for`,
    falling back to `x-forwarded-for`/`x-real-ip`
    (`src/lib/rate-limit/limit.ts`'s `getClientIp`). Confirmed against
    Vercel's own docs: on Vercel's standard infrastructure (no
    customer-added proxy in front, which this deployment doesn't have)
    these are Vercel-set and not client-spoofable — "we currently
    overwrite the X-Forwarded-For header and do not forward external
    IPs." Authenticated routes (image upload, export) already keyed by
    `userId`, not IP, so unrelated users behind the same NAT were never
    sharing those quotas — confirmed, no change needed there.
  - *CSP report endpoint* — hardened against attacker-controlled input:
    a `Content-Length` pre-check plus a post-read byte-length check (413
    if either exceeds 16KB — real reports are under 1KB), a cap on how
    many report entries one request can make it log (20) and how many
    fields one report object can contribute (40), and sanitized logging
    (query strings/fragments stripped from URL-shaped fields — `url`,
    `document-uri`/`documentURL`, `blocked-uri`/`blockedURL`, `referrer`,
    `source-file`/`sourceFile` — and every logged string truncated to
    300 chars).
  While checking the above, found and fixed two regressions from this
  pass, unrelated to the three checks themselves:
  - The `pnpm.overrides` added for the dependency-vulnerability fixes used
    unbounded `>=` ranges for several packages, which let pnpm resolve to
    a newer **major** than intended (`nanoid` 3→6, `js-yaml` 4→5,
    `fast-uri` 3→4, `@hono/node-server` 1→2, `undici` 7→8) — exactly the
    major-version churn this pass was supposed to avoid, and the `undici`
    jump broke `jsdom`'s internal `require('undici/lib/handler/...')`
    path, failing every frontend Vitest test at startup. Every override in
    `package.json` now has an explicit upper bound (`>=X <nextMajor.0.0`);
    reinstalled and confirmed each resolves within its original major and
    `pnpm audit` is still clean (only the accepted `deepmerge-ts` residual
    remains).
  - `src/lib/auth/session.ts`'s `getServerSession` caught Next's internal
    `DYNAMIC_SERVER_USAGE` control-flow signal (thrown by `headers()`
    during a static-rendering attempt — every route under
    `(app)/layout.tsx` is unconditionally dynamic, since it always calls
    this) in its bare `catch`, before that signal could reach Next's own
    boundary, logging it as a spurious "Session lookup failed" error on
    every route under `(app)`. Likely dormant before this pass and
    surfaced by the `next` version bump changing which routes attempt
    static rendering first. Fixed by calling `unstable_rethrow(error)` at
    the top of the catch block (Next's documented API for exactly this:
    "rethrow internal Next.js errors so they can be handled by the
    framework"), so only genuine lookup failures are still caught/logged.
- [x] Session policy reviewed (2026-09-15) — no changes made. 365-day
  rolling session, `freshAge` gate for sensitive actions (account
  deletion), multiple concurrent sessions per user by default: all as
  intended for personal/family use per existing product decisions. No
  cookie/session misconfiguration found (Better Auth's own https-based
  secure-cookie defaults apply; confirm `BETTER_AUTH_URL` is set to the
  `https://` production URL in Vercel's env vars — see deployment notes
  below).

The current personal/family session policy is **365 days**, not 30 days.
Reconsider duration/device limits for public launch, not as an unsolicited
change in this hardening pass.

### Deployment notes from this pass

- No new required env vars. `NEXT_PUBLIC_APP_URL` (already required) is
  now also read directly by `next.config.ts` to build the CSP report
  endpoint's absolute URL — confirm it's set to the real `https://`
  production origin in Vercel, not left at the `http://localhost:3000`
  fallback.
- New migration `prisma/migrations/.../add_rate_limit_hit` must be applied
  (`pnpm db:deploy`/`db:deploy:production` as usual) before deploying the
  rate-limiting code — every limited route calls `consumeRateLimit`
  unconditionally, so a missing table would surface as a 500 on those
  routes, not a silent no-op.
- `/api/csp-report` needs no configuration; it just logs. If report volume
  ends up worth tracking longer-term, that's a future decision (e.g. a
  small table or an external ingestion service), not something this pass
  added.
- Nothing here requires a new external service (no Redis/Upstash/KV) —
  rate limiting rides on the existing Neon Postgres connection.

## 3. Meal Plans / Grocery Lists

- [ ] Add manual-change reconciliation when resyncing a linked grocery list.
  If manual changes exist, show a review dialog listing them, with per-change
  controls to keep or discard them. Cover manual additions and removals, and
  inspect other supported manual edits so they are not silently lost.
  Default to preserving manual intent. Cancel should leave the list unchanged.
  Keep removed generated items suppressed when the user chooses to preserve
  their removal. Define behavior when source entries change or disappear.

Decided: customization stays **post-generation**. Do not add a pre-generation
wizard for optional ingredients, substitutes, or manually added groceries.

## 4. PWA / offline usability

- [ ] Add offline recipe viewing with a clear indication of what is available
  offline. Define caching/download scope, images, updates, and storage behavior.
- [ ] Add offline Cooking Mode for available recipes and nested Parts.
- [ ] Persist active cooking progress and timer deadlines across navigation and
  refresh; reconcile elapsed timers when reopening the app.
- [ ] Add screen wake lock where supported, with graceful fallback.
- [ ] Inspect and extend the existing PWA/service worker rather than creating
  competing cache strategies. Keep authenticated data isolated between accounts
  and clear private offline data appropriately on sign-out/account deletion.
- [ ] Implement queued synchronization for the offline actions explicitly
  supported, with retries and conflict handling. Use background sync where
  available and foreground recovery where it is unavailable.
- [ ] Validate offline/reconnect behavior and document platform limitations,
  including notification/timer behavior while the app is closed or suspended.

## 5. Ingredient-level nutrition

- [ ] Design and implement ingredient-level nutrition with automatic aggregation
  into Parts, recipes, servings, and meal totals where applicable.
- [ ] Choose the nutrition-data source and ingredient matching/correction flow;
  define unit conversions, weights, raw/cooked assumptions, and missing-data behavior.
- [ ] Preserve existing manually entered recipe/Part nutrition with clear
  calculated/manual behavior. Avoid double-counting nested Parts or presenting
  incomplete nutrition as a complete total.
- [ ] Verify quantity/yield scaling, substitutions, nested components, and
  compatibility with existing import/export behavior.

## 6. Remaining manual QA

- [ ] Website recipe import: representative sources, review/edit/save behavior,
  and unsupported/failed sources. Implemented; quality still needs hands-on review.
- [ ] Recipe Gallery-specific importer and DishFrame recipe JSON round trip:
  confirm representative real inputs preserve expected content. Both features
  exist; neither should remain listed as an unimplemented feature.
- [ ] Meal Plan / Grocery List review, including `Sync now` discoverability and
  the new manual-change reconciliation flow once implemented.
- [ ] Slice 22 multi-recipe sharing production checklist:
  - Real two-account Google-sign-in smoke test for claim-on-signup and `/share`
    reconciliation.
  - Approximately 12-recipe collection timing.
  - 50-recipe maximum-size stress check for Vercel/Neon timeouts and atomicity.
  - Seeded-state visual/UX review of collection dialogs and Sent/Received.
  - If stress checks expose share-graph latency, revisit sequential sibling-
    PartLink traversal without weakening all-or-nothing behavior.
- [ ] Real-device barcode scanning on iOS Safari and Android Chrome: permission
  allow/deny, immediate close during startup, camera shutdown after success,
  cancel, timeout, and close; recognized/unrecognized codes; desktop fallback.
- [ ] Account/security: multi-device session listing/revocation, sign out other
  sessions, stale-session reauthentication, disposable account deletion, survival
  of another user's accepted copy/shared image, and sender rendering after
  recipient-account deletion.
- [ ] Chrome/Safari Print Preview and Save-as-PDF: Letter/A4, long/nested-Part
  page breaks, and Safari margins.
- [ ] Cuisine datalist cross-browser visual acceptability.
- [ ] Real-device PWA offline, reconnect, wake-lock, and timer lifecycle checks
  after implementation.

Owner runs Playwright and final verification. Add focused automated coverage
for new behavior; the earlier account-deletion, onboarding, Meal Plans/Grocery
Lists, version-history/compare, and cooking-history coverage work is complete.

## 7. Documentation reconciliation — after targeted work

- [ ] Update current reference documentation to reflect implemented recipe JSON
  import, website import, Recipe Gallery import, the installed PWA, and the
  365-day personal/family session policy. Recipe JSON import is not full-account
  restore. Verify exact feature scope against code.
- [ ] Create `PRE_LAUNCH_TODO.md` and move conditional launch work there:
  - Custom domain purchase/Vercel setup and apex vs. www choice; corresponding
    app/auth URL, trusted-origin, Google OAuth, metadata, sitemap, robots, and
    redirect updates.
  - Search Console setup for a future custom domain. Current Vercel-origin
    Search Console setup and sitemap submission are complete.
  - Resend domain verification/SPF/DKIM, sender update, and contact reply-to check.
  - Review the 365-day/no-device-limit session policy for broader public use.
  - Professional privacy/terms review before broad commercial launch; revisit
    cookie disclosure if analytics or other added tooling makes it necessary.
  - Conditional monitoring/analytics, error/uptime monitoring, and Neon/Resend alerts.
  - Preview database isolation, preview OAuth, and preview email isolation.
- [ ] Consolidate optional product ideas in `PRODUCT_ROADMAP.md`: full-account
  restore beyond existing recipe JSON import; contact topic selector; rotation/
  meal-planning insights; recipe/cooking statistics; native mobile app; OCR/image
  recipe import; singular/plural yield-unit support as optional pre-launch polish.
  Preserve full-restore design constraints: fresh IDs and relationship remapping,
  fresh public-publication tokens/links, and no recreation of direct-sharing
  sender/recipient relationships.
- [ ] Resolve vague roadmap labels before retaining them. Identify any concrete
  unimplemented meaning of “public-directory enhancements” and “advanced cooking
  scheduling” from existing specs/code. Existing meal date/meal-label scheduling
  is implemented. Remove redundant labels; defer only distinct, defined ideas.
- [ ] Move optional empty/first-run QA seed-account work into testing improvements.
- [ ] Record accepted print-provenance omission in the relevant reference doc.
  Resolve or document outcomes of the targeted optimizations and warning fixes.
- [ ] Preserve the guardrail against repeated broad audits in agent guidance:
  the comprehensive engineering audit was completed on 2026-08-27; subsequent
  reviews should target changed areas or concrete concerns. Preserve useful
  dated audit records and add resolution notes as appropriate.
- [ ] Remove completed tasks and duplicate status information. Keep actual
  outstanding verification explicit; do not infer manual-QA completion.
