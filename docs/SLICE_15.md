# Slice 15 — Meal Plans, planned meals, recommendations, and live grocery synchronization

Closes the "Meal Planning" acceptance-criteria group in `PRODUCT_SPEC.md`
§96. Per `docs/REVISED_ROADMAP_SLICES_14_21.md`, Review Gate 6 was
consolidated into a lightweight code-aware architecture preflight rather
than a full owner design review.

## Preflight result

**Proceeded directly — no schema or product-rule conflict.**
`MealPlan`/`MealPlanEntry`/`PlannedMeal` and `GroceryList.mode =
MEAL_PLAN_LINKED` already existed from the Slice 2 schema pass, including
the `GroceryItemContribution.mealPlanEntryId`/`ingredientLineageId`
identity pair, the `state`/`previousQuantity*`/`acknowledgedAt` change-
tracking columns, the `syncFlag`/`flagAcknowledgedAt` mirror on
`GroceryListItem`, the `GroceryList.linkedMealPlan` `onDelete: Restrict`
FK, and the DB-level mode-consistency `CHECK` constraint. **No migration
was needed** — matches the Build Plan's own "Migrations: None."

## Meal Plan and entry model

`src/lib/mealplans/{schema,queries,service,actions}.ts`. An entry pins the
source Dish's *exact current* `dishVersionId` at add time plus durable
`sourceDishTitleSnapshot`/`sourceDishKindSnapshot`/
`sourceDishVersionLabelSnapshot` fields (§76.3) — later Recipe/Part edits
never move it. `adoptNewerVersionInEntry` offers the same-major-line
latest-minor default (or an explicit `targetVersionId`), mirroring
`applyGroceryListSourceRefresh`'s existing resolution rule from Slice 12.
Both Recipe and standalone Part entries use the same `MealPlanEntry` row
(§76.2). `duplicateMealPlan` copies entries/planned meals into a new date
range, translating every date by the start-date offset; the copy starts
independent (no linked grocery list, every entry reset to `PLANNED`).

`deleteMealPlan` follows round-3 Correction 2 exactly: one transaction,
`UPDATE GroceryList SET mode='STANDALONE', linkedMealPlanId=NULL` for
every linked list, *then* `DELETE FROM MealPlan` — verified both for the
happy path and for the deliberately-reordered failure (a direct
`prisma.mealPlan.delete` first now throws a foreign-key violation, since
`onDelete: Restrict` refuses it).

## Planned-meal allocation

`src/lib/mealplans/allocation.ts#computeAllocationStatus` — pure,
DB-free: `unknown` (no target yield to compare against) / `under` /
`balanced` / `over`, never blocking (§77.2). Rendered as a badge on each
entry card; no consumption tracking is recorded (§77.3).

## Recommendation behavior

`src/lib/mealplans/recommendations.ts#rankMealPlanRecommendations` — a
pure, unit-tested function per the Build Plan's explicit requirement.
Priority group (Stage) is decided first; recency (least-recently-cooked
first, never-cooked treated as oldest), Favorite, rating, and title are
tie-breakers *within* a Stage group only, so Favorite structurally cannot
override Stage (§80.3's own example — an Experimental Favorite never
outranks a plain Active Recipe — is directly asserted). Archived is
excluded unconditionally; Experimental/Idea require explicit
`includeExperimental`/`includeIdea` opt-in filters (§80.1); a
`favoritesOnly` filter is separately available (§80.3). The explanation
string follows §80.2's literal order and example format exactly ("Active
· not cooked in 28 days · 4.7/5 · Sweet + Spicy"). Candidates are scoped
to `RECIPE`-kind Dishes only, matching §80's exclusively Recipe-worded
language. The panel is opt-in (a "Get recommendations" button, not
auto-loaded) and only ever offers an "Add to plan" action that prefills
the existing add-entry form — DishFrame never silently fills the plan
(§80.4).

## Cooking Session / status integration

`startSessionFromEntry` resolves the entry's pinned Version's cookable
units, computes a session scale factor from `targetYieldQuantity` vs. the
Version's authored yield (`units/scaling.ts#computeTargetYieldScaleFactor`,
new pure helper), calls the existing `startCookingSession` unchanged, then
links `linkedSessionId` and flips the entry to `IN_PROGRESS`. Closing the
loop the other direction: `cooking/service.ts#endCookingSession` now also
flips any linked entry to `COOKED` inside its own existing transaction
when the outcome is `COMPLETED` — an `ENDED_EARLY` outcome leaves it
`IN_PROGRESS`, exactly per §78. `setMealPlanEntryStatus` covers the manual
Cooked/Skipped marking for cooking that happened outside DishFrame;
`IN_PROGRESS` is reachable only through `startSessionFromEntry`.

## Live grocery reconciliation

`grocery/list-service.ts` gains `generateGroceryListFromMealPlan` (no
`GroceryListSource` rows — a `MEAL_PLAN_LINKED` list's source of truth is
the plan's own entries) and `resyncGroceryListFromMealPlan`, the
explicit reconciliation function from Arch §H/§I. Every mutating Meal Plan
action that can affect a linked list (add/remove entry, yield/note change,
adopt newer Version) runs the resync **inside the same transaction** as
the mutation, matched by `mealPlanEntryId` + `ingredientLineageId` (never
by displayed item, which can be a user-combined group). A manual
`resyncMealPlanGroceryLists`/"Sync now" action covers the gap where a
source Recipe/Part changes from *outside* the Meal Plan entirely (editing
it directly doesn't itself trigger a plan mutation).

**Entry-removal ordering note:** `GroceryItemContribution.mealPlanEntryId`
is `onDelete: SetNull`, so `removeMealPlanEntry` resyncs *before* deleting
the entry row, not after — otherwise the FK would silently null the
contribution's identity before the diff ever saw it as gone, defeating the
REMOVED flag entirely. Verified directly by an integration test.

## Checkoff / change-flag behavior

Unchanged contributions stay `ACTIVE`; a changed one is set `CHANGED` with
its prior quantity preserved on `previousQuantity*`; a disappeared one is
set `REMOVED` — never deleted — and its owning `GroceryListItem.syncFlag`
mirrors that state while `checkedAt` is left completely untouched (round-2
Correction 5, the exact "checked item silently vanishes" failure mode this
schema design exists to prevent). `acknowledgeGroceryItemSync` clears the
flag once the user has seen it. The detail view now shows a "Plan
changed"/"No longer in the plan" badge plus an "Acknowledge" affordance,
and a "Linked to Meal Plan" back-link plus "Sync now" button when
`mode === MEAL_PLAN_LINKED`.

## Completion freeze

`resyncGroceryListFromMealPlan` no-ops immediately on a list with
`completedAt` set (§81.5) — verified.

## Schema/migration result

None — see Preflight above.

## Completeness check (follow-up pass)

A focused re-check against §60-64/§81.1's literal wording, prompted after
the initial pass. **All three behaviors already existed — no production
behavior was missing; only one stale doc-comment was fixed and tests were
added to prove it.**

1. **Generate from entire plan / selected entries / a chosen date range
   (§81.1).** `generateGroceryListFromMealPlan`'s `entryIds?: string[]`
   already accepts an arbitrary subset — omitted = entire plan, provided =
   selected entries, and a caller-filtered-by-`cookDate` subset directly
   satisfies "a chosen date range" without a separate parameter or code
   path. Proven by a new integration test that filters entries by date
   range before generating.

2. **User choice of optional-ingredient inclusion and primary-vs-
   substitute variant, "at the Meal Plan/generation level" (§62.1/§62.2).**
   Both spec bullets are written as an explicit **or**: "before... or
   while editing the generated list" / "before generation; while editing
   the generated list." The post-generation entry point
   (`removeGroceryItem`/`selectGroceryItemVariant`, built in Slice 12) was
   never mode-gated — it operates only on `GroceryListItem`/
   `GroceryItemContribution` rows scoped by `listId`, identically for
   `STANDALONE` and `MEAL_PLAN_LINKED` lists. This already satisfies both
   bullets for Meal-Plan-linked lists; per this pass's explicit
   instruction not to redesign the Meal Plan/grocery UI, no pre-generation
   chooser was added. Proven by a new integration test selecting the
   substitute variant on a Meal-Plan-linked item.

3. **Reconciliation preserves Slice 12/15 guarantees when those selections
   change.** Verified directly: a chosen substitute variant, a manual
   recategorization, manual items, contribution lineage
   (`mealPlanEntryId`+`ingredientLineageId`), and `CHANGED`/`REMOVED`
   flagging all survive an unrelated resync triggered by a later plan
   mutation; a completed list is still never resynced. One accepted,
   pre-existing, and explicitly out-of-scope-for-this-pass edge case is
   now directly documented by a test rather than left implicit: removing
   an optional item via `removeGroceryItem` is not tracked as "excluded"
   anywhere, so a later resync's "added" fold-in can re-add it if the
   producing entry is untouched — identical to
   `applyGroceryListSourceRefresh`'s existing accepted Slice 12 behavior,
   not a new gap, and left for the Slice 21A review per this pass's
   instructions (no new exclusion model introduced).

One doc-comment in `grocery/list-service.ts` was corrected: it previously
said "every list this module writes is `STANDALONE`," which became stale
the moment `generateGroceryListFromMealPlan` was added in the original
Slice 15 pass. Replaced with an accurate description of why every
item/source mutation in the file is mode-agnostic by construction. No
behavior changed.

## Tests added

- `mealplans/recommendations.test.ts` (8 unit) — Stage priority, Favorite-
  never-overrides-Stage, recency ordering, explanation format.
- `mealplans/allocation.test.ts` (5 unit) — under/balanced/over/unknown.
- `mealplans/mealplans.integration.test.ts` (18 integration) — exact-
  Version pinning, generation, add/remove/yield-change/adopt-Version
  resync (including the dedicated checked-item-disappears-REMOVED case),
  manual-item preservation, completion freeze, `deleteMealPlan`'s ordering
  and its FK-violation-if-reordered case, cross-owner authorization,
  Cooking Session status wiring (`COMPLETED`→`COOKED`,
  `ENDED_EARLY`→unchanged), a no-partial-state case, plus (completeness
  pass) date-range-filtered generation, substitute-variant selection
  surviving an unrelated resync, manual recategorization surviving an
  unrelated resync, and the documented removed-optional-item-may-reappear
  case.
- `grocery-list-detail-view.test.tsx` (+4 component) — sync badges, the
  acknowledge action, checkoff surviving a `REMOVED` flag, and no badges
  on an ordinary `UNCHANGED` item.
- `tests/e2e/mealplans-golden-path.spec.ts` (1 e2e) — full plan → generate
  synced list → check off → edit plan (yield change) → confirm the
  checkoff survives and the change is flagged → complete → confirm frozen.

## Targeted commands actually run

`vitest run` on every file listed above (all green — the completeness pass
re-ran `mealplans.integration.test.ts`, now 18/18, and re-checked
`grocery-list.integration.test.ts`, still 39/39, after the doc-comment
edit); the existing Slice 12 grocery suites
(`grocery-list.integration.test.ts` 39/39, `grocery.integration.test.ts`
9/9) and the existing `cooking.integration.test.ts` (19/19) to confirm no
regression from the `list-service.ts`/`endCookingSession` edits; the one
e2e spec above via `playwright test tests/e2e/mealplans-golden-path.spec.ts`
(passed).

**Not run:** `tsc --noEmit`, repo-wide typecheck/format/lint, production
build, `verify:feature`/`verify:all`, the full unit/integration suites, or
the full Playwright suite — left to the owner's fresh-session verification
pass, per policy.

## Genuine limitations / manual-review targets

- `/meal-plans` (and pre-existing `/grocery-lists`) still have no primary
  nav entry — same precedent Slice 12 already established; deferred to
  the Slice 21A IA pass rather than decided here.
- Resync's "added" fold-in can re-add a contribution the user deliberately
  removed from an active linked list via `removeGroceryItem`, if the
  ingredient is still part of the plan's live entries — mirrors
  `applyGroceryListSourceRefresh`'s existing accepted behavior from Slice
  12, not a new risk, but flagged since it wasn't explicitly settled by
  the owner for the Meal-Plan-linked case specifically.
- No frontend design pass applied to the new `/meal-plans` UI — plain
  functional layout only, consistent with Slice 12's own note about
  `/grocery-lists`.
- No real interactive browser walkthrough beyond the one e2e run above —
  recommend a brief sanity check of the recommendation panel's copy/layout
  and the planned-meal allocation badges.

## Deferred Slice 14 owner checks (not performed in this pass)

Carried forward from `docs/SLICE_14.md`'s own manual-QA note, consolidated
here so it isn't lost ahead of the post-Slice-15 broad-verification step
in `docs/REVISED_ROADMAP_SLICES_14_21.md`:

- broad fresh-session verification;
- real-device barcode scanning on iOS Safari and Android Chrome where
  available;
- permission allow and deny;
- immediate dialog close during scanner startup;
- camera indicator/stream stopping after success, cancel, timeout, and
  close;
- recognized and unrecognized retail barcodes;
- no-camera desktop fallback to text search.

## Owner intervention recommendation

**Brief sanity check** — automated coverage above exercises the
highest-risk area (grocery-resync reconciliation) directly, including the
"checked item disappears" case the schema design was built around. Open
the `/meal-plans` pages once to confirm layout/copy read acceptably, and
run the deferred Slice 14 checklist above at the same time. No open
product/design questions — recommendation ranking, allocation warnings,
Cooking Session linkage, and the reconciliation rules all follow directly
from §77-81 and the Arch §D.11/§H/§I design already settled at Gate 1.
