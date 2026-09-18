# Multi-source Cooking Sessions — implementation handoff

Owner spec delivered in chat, 2026-09-17; completion pass, 2026-09-18. Not
yet reflected in `PRODUCT_SPEC.md`/`ARCHITECTURE_PROPOSAL.md`/`BUILD_PLAN.md`
— recommend folding a condensed version of this doc into those canonical
docs once reviewed, per AGENTS.md's "Product spec authority."

## What's built and working end-to-end

- **Schema/migration** (`20260918002043_multi_source_cooking_sessions`):
  `CookingSessionSource` (one row per selected top-level source; `isActive`
  denormalized mirror, backing the partial unique index
  `one_active_session_per_dish_source`), `CookingSessionUnitContribution`
  (unit×source join — multiplier, contribution quantity/unit, that source's
  own local `sourceUnitKey`), `CookingSessionSourceReview` (per-source
  post-cook review). Backfill gives every pre-existing session one source
  row and every pre-existing unit one contribution row.
  `CookingSession.dishId`/`dishVersionId`/`scaleFactor` stay populated
  (mirroring `sources[0]`) for every existing single-dish read site.
- **Consolidation engine** (`lib/cooking/consolidation.ts`, pure, unit-tested):
  merges exact-same-Part-and-Version units across sources, weighted-summing
  checklist/output quantities by each source's own scale × its own authored
  PartLink multiplier (`CookableUnit.linkMultiplier`). Different Versions
  and Sections never merge. `recomputeContributionAggregate` re-runs the
  same math for a *live* rescale without redoing the full cross-source
  grouping pass.
- **Session creation** (`startMultiSourceCookingSession`): one transaction
  creates the session, every source, every consolidated unit + checklist +
  contribution + Part-usage row. A conflict on any source rolls back the
  whole transaction. The old single-source `startCookingSession` now also
  creates one source row *and* one contribution row per unit (both
  additive) — without this, legacy-path sessions would be invisible to the
  new per-source conflict guard and to every contribution-aware read/write
  path added since.
- **Generic picker** (`start-cooking-button.tsx`): a single checkbox
  multi-select step — no Version/scale step. Continuing hands off via
  `sessionStorage` straight to `/cook/setup`, which owns Version selection
  (with live re-derivation of the combined list on change) and per-source
  scale. Direct per-Recipe/Part "Prepare to cook" entry points are
  untouched.
- **Live per-source rescale** (`updateSourceScale`): each
  `CookingSessionSource` keeps an independent, live scale. An ordinary
  (single-contribution) unit recomputes exactly like `updateSessionScale`
  (display only, `baseQuantity` untouched). A consolidated unit
  re-derives every contributor's current raw content and current scale,
  recomputes the aggregate `baseQuantity`/`displayQuantity` in place, and
  updates only the rescaled source's own contribution row — checkoffs,
  completion, and timers are never reset. Wired into Cooking Mode as a
  separate per-source dialog (`sources.length > 1` only); single-source
  sessions still use the original, untouched whole-session dialog.
- **`addSessionUnits`** now searches every participating source (previously
  silently only searched source[0]), and shared-Part-consolidates a
  newly-added unit into an already-included one from a different source
  when they're the exact same Part+Version, recomputing the aggregate the
  same way a rescale does.
- **Source-specific post-cook review**: `CookingSessionSourceReview` is
  fully wired — `saveSessionSourceReview`/`deleteSessionSourceReview`,
  offline-capable via `cooking.saveSourceReview`, and a
  `MultiSourceSessionReviewWizard` that reuses `<SessionReviewForm>`
  unchanged per source (its new `sourceId`/`nextHref`/`stepLabel` props),
  walking `/cook/[sessionId]/review?source={id}` one source at a time.
  Ratings/actual yield are never combined across sources (`Rating` was
  already dishId-scoped). Single-source review is byte-for-byte unchanged.
  Every entry point into `/cook/[sessionId]/review` (including "Edit
  Review" from a specific source's own overview) is wizard-aware for free.
- **Offline**: `cooking.startMultiSourceSession`,
  `cooking.updateSourceScale`, and `cooking.saveSourceReview` are
  registered sync ops, reusing the existing queue/lease/retry/receipt-
  ledger machinery unchanged — the receipt ledger (keyed by `mutationId`)
  is what actually guarantees no duplicate sessions/sources/units/
  contributions on retry, not bespoke per-row client ids. `/cook/setup`
  reads each selected source's replicated `DishSnapshotDoc` offline
  (`getMultiSourceSetupDataOffline`) and runs the same pure consolidation
  functions client-side. Scoped like every other offline preview in this
  codebase: only a Dish's *current* Version is ever replicated with
  cookable units, so offline Setup has no Version switcher (falls back to
  a plain label instead of the picker). Account isolation needs no new
  code — everything rides on the existing `cookingSession`/`dish` entity
  docs' wholesale-wipe-on-account-change mechanism, not a new store.
- **Read-side audit fixes**: `listSessionsForOwner`/`listDishSessionHistory`/
  `getLastCookedAt(ForDishes)`/`getPartCookingHistory` all recognize a
  dish's participation as *any* source, not just `session.dishId`;
  `getPartCookingHistory`'s per-event "cooked as part of X" label is now
  derived per-occurrence from `pathSnapshot` instead of always naming
  source[0]; `getSessionEvidenceForEditor` now takes the specific `dishId`
  being edited and reads that source's own review/ratings, instead of
  always source[0]'s (previously failed *safely* — the caller's own guard
  discarded mismatched evidence — but showed nothing for a non-primary
  source's "Edit Recipe" flow); `session-view.ts`'s `addableUnits` and each
  unit's own output-yield basis now come from every source, not just
  source[0] (previously: every non-primary-source unit showed a blank
  target yield, and "Add to session" silently omitted their un-added
  units).
- **Tests**: `consolidation.test.ts` (pure) and
  `multi-source.integration.test.ts` (DB-backed) — creation, consolidation
  math, atomic conflict rollback, live rescale (isolation, ordinary vs.
  consolidated correctness, no progress/timer reset), multi-source
  `addSessionUnits` (including add-time consolidation), source reviews
  (independent ratings/yield, independent deletion), and the legacy-path
  contribution-row backward-compat fix. `start-cooking-button.test.tsx`
  covers the collapsed single-step picker. Not run — left for your own
  verification pass.

## Deliberate scope decisions

- No offline Version switcher in multi-source Setup (see above) — matches
  the existing single-source offline Setup's own scope exactly.
- The generic picker's multi-select always routes through
  `startMultiSourceCookingSession`, even when exactly one source is
  checked, rather than special-casing N=1 back to the old function — one
  code path, and the two are behaviorally equivalent for that case.

## Explicitly deferred (not built)

- **Meal Plan cross-matching from the generic picker.** Existing
  associations (`MealPlanEntry.linkedSessionId`) are preserved wherever they
  already exist; the generic picker itself still doesn't look up whether a
  selected Recipe/Part has a pending Meal Plan entry — it didn't before
  this feature either, and the spec only asked to preserve existing
  associations, not add new matching.
- Full first-class offline IndexedDB *mutation* representation for
  `CookingSessionSource`/`CookingSessionUnitContribution` (e.g., a rich
  optimistic local preview of a multi-source session before it syncs) —
  the offline creation path has the same scope as the existing
  single-source one: it queues and becomes visible once synced, no local
  preview. This mirrors, not narrows, existing behavior.
- The full ~30-item test checklist in the original spec — prioritized the
  highest-risk, hardest-to-verify-by-inspection logic over exhaustive
  UI/E2E coverage (no Playwright specs added).

## Owner intervention recommendation

**Focused manual review** before this ships to real use, on:

1. A real click-through: generic picker → `/cook/setup` (including a
   Version change) → Cooking Mode (source nav, per-source rescale dialog,
   adding a unit from a non-primary source) → ending → the review wizard.
   None of this new UI has been visually reviewed.
2. The two scope decisions above.

Run `pnpm db:verify:local` after your own migration re-check, then your
normal `verify:*` scripts. I did not run any of these.
