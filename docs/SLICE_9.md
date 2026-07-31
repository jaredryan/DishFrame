# Slice 9 — Session Reviews, Cooking notes, Tasters, ratings, learning loop

Closes the "save → cook → evaluate → revise" loop (PRODUCT_SPEC.md §31-42,
§48-49, ARCHITECTURE_PROPOSAL.md §D.8/§D.9). No schema/migration changes —
`SessionReview`/`Rating`/`Taster` already existed from Slice 2.

## Review flow

New route `/cook/[sessionId]/review` (`src/lib/reviews/{schema,queries,
service,actions}.ts`, `session-review-form.tsx`). Ending a session
(`CookingModeShell.handleEnd`) now redirects there instead of refreshing in
place; "Not now" is a plain link back to `/cook/[sessionId]` that calls no
action, so nothing is ever created for it (§33.3/§42's "Not now creates no
empty Review").

`saveSessionReview` persists a `SessionReview` + replaces the session's
`Rating` rows in one transaction, only when at least one field is
meaningful (text/rating/amount/duration — §33.3). Saving an already-existing
Review down to nothing is treated as deletion rather than left as a stale
empty row. Deleting a Review (`deleteSessionReview`) removes only
`SessionReview` + that session's `Rating` rows; the `CookingSession`,
checklist, timers, and Cooking notes are untouched — verified directly in
`reviews.integration.test.ts`. The delete dialog states the ratings/summary
warning from §33.6.

Editing an ended, historical, or Ended-early session's Review works
identically to a fresh one — `saveSessionReview` only rejects
`IN_PROGRESS` sessions.

## Cooking notes

`CookingSession.cookingNotes` gets its own field + Save button
(`cooking-notes-field.tsx`), rendered on `/cook/[sessionId]` in both active
and ended states — independent of `SessionReview` (own service function,
own action, no relation to the Review's own fields). No second
Recipe-level notes field was added (§32.5 already covered by
description/Version note/Section guidance/Cooking notes/Review fields).

## Tasters and ratings

Reused the existing Taster CRUD/archive/reorder implementation as-is — no
changes needed. Added `listReviewTasterOptions` (owner-scoped): active
Tasters in display order, plus any archived Taster already rated on *this*
session, so an edit can still see/remove that historical rating (§34.5)
while archived Tasters stay hidden from fresh selection elsewhere.

Ratings are Tier 1 only: one `Rating` per session scoped to the session's
own `dishId` (the whole Recipe or standalone Part) — no per-Part-in-Recipe
rating UI. The one-rating-per-Taster-per-session-per-item invariant is
enforced in `saveSessionReview` (duplicate `tasterId` in one submission
rejected) and backstopped by the existing
`@@unique([sessionId, tasterId, dishId])` constraint. A rating from an
Ended-early session counts normally (§36.6) — covered directly by test.

`StarRatingInput` (`components/domain/cooking/star-rating-input.tsx`):
whole 1-5 stars, ≥44px tap targets, click again on the same value to clear.
Clearing leaves that Taster with no saved rating for the session — DishFrame
does not persist a separate "present but unrated" attendance record
(§35.3, corrected below).

## Rating summaries and provisional ratings

All computed at read time from `Rating` rows (`reviews/queries.ts`'s
`computeRatingSummary`/`getRatingSummary`) — no cached totals, so deletion
"recalculation" is just the next read. Covers every §36.3 metric: all-time
average, current-Version group average, owner's current-Version average,
owner's latest rating, latest-rated-session average, per-Taster averages,
rating history by Version, count/rated-session-count/distinct-Taster-count,
range.

`computePrincipalRating` picks the one restrained card/header value
(`RatingBadge`, `★ 4.6/5` / `~4.6/5`), honoring the Group-average-vs-
Your-rating preference (§49.1), falling back in order: genuine current-
Version rating → most relevant previous-Version rating → a duplicate's
frozen source snapshot → nothing. `getPrincipalRatingsForDishes` batches
this for the library grid (one extra query, not N).

`duplicateDish` now captures `sourceAggregateRating`/`sourceRatingCount`/
`sourceSessionCount` at duplication time (`getDuplicationRatingSnapshot`) —
previously always null since ratings didn't exist yet. Verified this
snapshot does not drift after the source earns more ratings later (§19.2).
`RatingDetailDialog` renders the deliberate "Starting point" block
separately from the item's own history, per §19.4's example.

## Last cooked / cooking history

**Superseded by the 2026-07-31 correction pass below** — `getLastCookedAt`
originally reconstructed a Part's Recipe-session usage by walking the live
`PartLink` graph at read time; it now joins against the durable
`CookingSessionPartUsage` log instead. See the correction section for the
current architecture. Recipe: latest `COMPLETED` session for that `dishId`
(Ended-early excluded, §41.2) — unchanged. No duplicate standalone Part
session is ever created for Recipe-session usage (§41.4) — verified
directly, unchanged.

## Learning loop and Stage suggestions

Post-save panel offers Edit / Change Stage / Done (§39.2), always — the
Review itself never mutates Recipe/Part content or Stage (verified: Dish
`stage`/`currentVersionId` unchanged after a save). `getStageSuggestion`
(`dishes/stage-suggestions.ts`, pure function) offers the next Stage after
at least one finished session, worded per §40.3, never past Active/
Archived, and requires an explicit confirm click (`updateDishStage`, a new
Stage-only action reusing the existing service function/`restoreDishSchema`
shape).

## Tests

`src/lib/reviews/reviews.integration.test.ts` (13 cases): meaningful-content
gating across all four single-field cases and the empty case; editing and
deleting a Review with evidence preservation; one-rating-per-Taster and
foreign-Taster rejection; Ended-early counting; immediate summary
recalculation after Review and Taster deletion; archived-Taster visibility;
provisional selection (previous-Version vs. duplicate-source vs. genuine);
duplication-time snapshot capture/no-drift; Last-cooked rules for both
Recipe and Part; no automatic content/Stage mutation; authorization.
`getStageSuggestion` unit-tested in the same file.

Updated `cooking-mode-shell.test.tsx` for the two new props and the
now-duplicated `textbox` role (Cooking notes' own textarea).

Playwright: `tests/e2e/session-review.spec.ts` — finish → Review (rating
only) → summary visible on the Recipe → edit → delete → Cooking notes and
checklist evidence survive. Written, not run.

## Verification

`pnpm run verify:feature`: passed clean on first run (after fixing two
`no-unused-vars` lint warnings in `reviews/queries.ts`'s history-sort). 276
frontend tests, 193 backend integration tests (13 new in
`reviews.integration.test.ts`), protected-object/migration scans, build,
typecheck all green.

## Manual review targets

- Review form tone/layout on phone width; star tap targets.
- Rating badge legibility (actual vs. `~` provisional) on cards and the
  detail header, both themes.
- Stage-suggestion banner wording/placement after a save.
- Starting-point block on a freshly duplicated, uncooked item vs. one
  already cooked.

## Unresolved / deferred

- Tier 2 per-Part-in-Recipe ratings, Slice 10 search/sort, Meal Plans,
  sharing, nutrition, grocery lists — all explicitly out of scope per the
  prompt.

## Correction pass (2026-07-31) — Taster rule, feedback-assisted editing, nested Last cooked

**Taster rule.** PRODUCT_SPEC.md §35.3 corrected: DishFrame does not
persist "present but unrated" Taster attendance, only settled by the owner
this pass. A Taster either has a saved 1–5-star rating for a session or has
no saved rating at all — the distinction between "present but declined to
rate" and "not present" isn't tracked. No schema/code change was needed —
`saveSessionReview` already wholesale-replaces the session's `Rating` rows
from the submitted array, so clearing a Taster's stars simply omits them
from that array and no row is written. `StarRatingInput`'s doc comment and
the "Tasters and ratings" section above were corrected to match; the old
"an accepted architecture boundary" note under nested Part Last-cooked
(now fixed, see below) was removed.

**Feedback-assisted editing from the exact cooked Version (§39.5).** "Edit
Recipe"/"Edit Part" on the post-Review panel now links to
`{basePath}/{dishId}/edit?versionId={session.dishVersionId}&sessionId={sessionId}`
instead of the bare `/edit` route (which silently defaulted to the current
Version). The `/edit` route already supported opening any historical
Version as the editing base with correct Save-small-update/Save-new-version
behavior (reached previously only from a Version's own detail page) — the
gap was only that the Review's own Edit action never passed a `versionId`.
The existing "you're editing a historical Version" banner
(`dish-editor.tsx`) now also states the Dish's actual current Version
(`getDishVersionMajorMinor`, `dishes/queries.ts`) alongside the base being
edited, satisfying §39.5's "clearly identifies the cooked Version [and] the
current Version" — previously it only said "not the current version"
without naming it.

**Evidence access while editing (§39.4).** New: a "View session evidence"
button (shown only when the edit page received a `sessionId` that actually
belongs to the Dish being edited) opens a Sheet with the session's outcome,
cooked-Version label, Cooking notes, Review text, and ratings
(`getSessionEvidenceForEditor`, `reviews/queries.ts`;
`SessionEvidenceTrigger`, `dish-editor.tsx`). The Sheet's open state is
independent of `useForm`'s state, so opening/closing it never resets
in-progress edits, and nothing from the Review/notes is copied into any
form field — read-only display only. This is genuinely new: no prior path
surfaced session evidence from within the Recipe/Part editor at all.

**Nested-Part Last cooked/history (§23.4/§41.3/§41.4) — superseded, see the
2026-07-31 correction section below.** `getLastCookedAt` (`cooking/queries.ts`)
previously only matched a Part linked directly into the cooked Recipe
Version (top-level or Section-nested); a Part nested inside another Part
(e.g. Recipe → Sauce → Garlic Paste) was invisible. This pass fixed it with
a recursive `partIsNestedInVersion` walk down the *live* `PartLink` graph at
read time — which was itself a design mistake, since permanently deleting
an intermediate Part (Sauce) cascades away its own `PartLink` rows and
breaks that same walk for a surviving nested Part (Garlic Paste). The
2026-07-31 correction pass replaces this read-time reconstruction with a
durable `CookingSessionPartUsage` log written once at session-creation
time, while the source graph still exists. The removed-unit exclusion rule
(`removedAt: null`) is unchanged in spirit, now expressed as a join against
the owning `CookingSessionUnit`'s own `removedAt`.

**Tests.** `reviews.integration.test.ts`: a dedicated clearing-a-rating
test (no Rating row, no Taster mutation); `getSessionEvidenceForEditor`
happy path + in-progress guard + cross-owner authorization; a nested
Last-cooked test covering excluded-from-plan, Ended-early, and Completed
cases two levels deep, plus the no-duplicate-standalone-session invariant
for both the direct and nested Part. `session-review-form.test.tsx` (new):
asserts the Edit Recipe link's exact href. `dish-editor.test.tsx`: banner
text with/without a known current Version; evidence trigger presence;
open/close not resetting unsaved edits. `tests/e2e/session-review.spec.ts`
updated to exercise Edit Recipe → evidence Sheet → back to Review; written,
not run.

**Verification.** `pnpm run verify:feature` passed clean on first run: 281
frontend tests, 196 backend integration tests (7 new/changed in
`reviews.integration.test.ts`), protected-object/migration scans, build,
typecheck all green.

**Remaining limitation.** None identified for the three items in scope —
Tier 2 per-Part ratings and everything else under "Unresolved / deferred"
above still stands as originally scoped.

## Correction pass (2026-07-31) — durable Cooking Session Part-use records

**Why.** The recursive read-time `PartLink`-graph reconstruction the prior
correction pass added for nested-Part Last cooked/history (above) was
rejected as too fragile: permanently deleting an intermediate Part cascades
away its own `DishVersion`/`PartLink` rows, so a later read-time walk down
from it has nothing left to traverse — a surviving, deeper-nested Part's
own Last cooked and history would silently disappear even though nothing
about *that* Part or its own session ever changed. Full architecture is
documented in `ARCHITECTURE_PROPOSAL.md` §D.7a; this section covers only
the DishFrame-specific deltas.

**Persisted Part-use model.** New `CookingSessionPartUsage` model (Migration
`20260731173746_cooking_session_part_usage` +
`20260731173814_cooking_session_part_usage`, `PartUsageRelation` enum:
`DIRECT`/`NESTED`). One row per exact Part-Version occurrence: owning
session/unit, `partDishId`/`partVersionId` (nullable, `onDelete: SetNull`,
same pattern as `Rating`), title/Version-label/path snapshots, and
`viaPartTitleSnapshot` for the immediate containing Part when nested. A new
hand-authored `cooking_session_part_usage_pair_consistency` CHECK
constraint (paired nullability, mirroring `rating_dish_pair_consistency`)
was added and registered in both `scan-migrations.ts` and
`verify-db-objects.ts`'s protected-object lists.

**Migration correction note.** The first `--create-only` migration Prisma
generated proposed spurious `DROP`s for several pre-existing hand-authored
objects (`dish_current_version_ownership`, the Ingredient/Instruction/
PartLink consistency CHECKs, three trigram indexes) — the same documented
shadow-diff issue as `SLICE_2.md` §5.2. These were stripped by hand before
applying. `prisma migrate dev` then auto-generated and applied a *second*
migration re-proposing and executing those exact drops against the local
dev database before it was caught mid-pass; that second migration file was
corrected to a no-op (so it can never drop those objects on any other
database), and the local dev database — disposable by design — was reset
and cleanly reapplied from the corrected migration history.
`db:scan-migrations`/`db:verify:local` both pass clean against the final
state.

**Creation-time discovery.** `collectPartUsageOccurrences`
(`cooking/queries.ts`) walks the immutable `PartLink` graph once, only
inside `startCookingSession`/`addSessionUnits` — the only two places a
`CookingSessionUnit` is ever created — recording the unit's own direct
Part target (`DIRECT`) plus every Part nested inside it at any depth
(`NESTED`), each with a readable `pathSnapshot` (e.g. "Chicken Curry →
Sauce → Garlic Paste"). Historical reads never re-walk the source graph.

**Last cooked / Part cooking history.** `getLastCookedAt`'s Part branch and
the new `getPartCookingHistory` (`cooking/queries.ts`) both query
`CookingSessionPartUsage` directly: a row counts only while its owning
`CookingSessionUnit.removedAt` is null and its session is `COMPLETED` —
removal/restoration needs no separate bookkeeping since there is no
duplicated active flag on the usage row itself. `getPartCookingHistory`
returns one event per Part per Cooking Session (standalone sessions, both
outcomes, plus Completed Recipe/parent-Part sessions with an active usage
row), collapsing multiple occurrences of the same Part within one session
(used both directly and nested) into that event's own `occurrences` list
rather than duplicate rows. Surfaced via a new "View cooking history"
dialog (`components/domain/dish/cooking-history-dialog.tsx`) on the Part
detail page, alongside the existing Last-cooked badge.

**Deletion durability.** Verified the exact scenario from the prompt:
Recipe → Part A (Sauce) → Part B (Garlic Paste), Recipe session Completed,
Part A permanently deleted via the normal two-phase
resolve-then-delete flow. Part B's own `NESTED` usage row was never
related to Part A via a live FK — only a frozen `viaPartTitleSnapshot`
string — so Part A's deletion has nothing to cascade into for Part B; Part
B's Last cooked and history both survive unchanged. Part A's own `DIRECT`
usage row also survives (its `partDishId`/`partVersionId` nulled by the
database's own `onDelete: SetNull`, snapshot fields intact).

**Backfill.** `backfillCookingSessionPartUsage` (`cooking/service.ts`, run
via `pnpm db:backfill:part-usage`) is an idempotent one-time pass:
finds every `CookingSessionUnit` with a `sourcePartLinkLineageId` and zero
usage rows, re-derives them via the same recursive walk from the unit's own
root `PartLink` when it's still `LIVE` with a live target, and skips (does
not fabricate) any unit whose source Part was already deleted before the
backfill runs. Existing `CookingSession`/`CookingSessionUnit` rows are never
read-destructively touched by this pass.

**Tests.** `reviews.integration.test.ts`: extended the existing nested
Last-cooked test with unit restore-then-complete eligibility and direct
assertions against the persisted usage rows (relation/path/snapshot
fields) and `getPartCookingHistory` output; a new test for a Part used both
directly and Section-nested-plus-nested-in-another-Part within one session
(collapses to one history event, confirms Section-nesting alone stays
`DIRECT`); a new test for the intermediate-Part-deletion survival scenario
above; a new idempotent backfill test. 23 cases total in that file (up from
19), all passing.

**Verification.** `pnpm run verify:feature` passed clean on first run: 281
frontend tests, 199 backend integration tests (23 in
`reviews.integration.test.ts`, up from 19), `db:verify:local` (16 protected
constraints/7 protected indexes, including the new
`cooking_session_part_usage_pair_consistency`) and `db:scan-migrations`
both clean, lint/typecheck/build all green.

**Owner intervention recommendation: Proceed without manual UI review.**
No product/design decision is pending — the new "View cooking history"
dialog reuses `RatingDetailDialog`'s exact visual pattern (ghost-button
trigger + `Dialog`), and its own content is data-driven, factual history
rather than a new design surface. A brief sanity check of the Part detail
page (confirm the dialog opens/renders for a Part with history) is
reasonable but not required before continuing other work.
