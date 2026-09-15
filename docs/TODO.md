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
