# DishFrame — TODO

Track unfinished software work, verification, and open product decisions here.
Remove completed items; maintain implementation details in living reference docs.
Conditional public-launch work belongs in `PRE_LAUNCH_TODO.md`; optional product
ideas belong in `PRODUCT_ROADMAP.md`.

Production: https://dish-frame.vercel.app

## 1. Targeted engineering work

- [ ] Review `ingredient-gather.ts` repeated traversal and implement a bounded
  optimization where worthwhile. Prefer reuse within the relevant operation;
  avoid introducing stale cross-request data or changing ingredient semantics.
- [ ] Review `queryDishLibrary` fetching/ranking/sorting and implement practical
  improvements while preserving search, ordering, filtering, and pagination.
  If a change requires disproportionate complexity, explain the specific tradeoff.
- [ ] Investigate the Next.js callback-prop serializability warnings and fix
  incorrect client/server boundaries or declarations where possible. Preserve
  legitimate client-to-client callbacks; do not disguise callbacks as server
  actions or broadly suppress diagnostics merely to silence the warning.

## 2. Security hardening for current use

- [ ] Evaluate and, where appropriate, configure report-only CSP, accounting
  for current authentication, assets, and third-party integrations before enforcement.
- [ ] Review dependency vulnerabilities and address actionable findings;
  establish a practical recurring dependency-review mechanism.
- [ ] Review existing endpoint protections and implement appropriate durable
  rate limiting for exposed API routes and the contact form where missing.
  Preserve legitimate imports, sharing, authentication, and normal family use.

The current personal/family session policy is **365 days**, not 30 days.
Reconsider duration/device limits for public launch, not as an unsolicited
change in this hardening pass.

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
