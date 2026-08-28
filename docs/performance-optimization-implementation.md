# Performance Optimization Implementation

Implements findings F1–F11 from `docs/performance-architecture-audit.md`. No
bulk-share architecture, transaction-boundary, concurrency, or progress-UI
decisions were made — those stay deferred per the audit's brief, to be
revisited once the owner measures the new per-object baseline.

## F1 — `insertSections`/`insertPartLinks` batching (highest priority)

**File:** `src/lib/dishes/service.ts`

**What changed:** rewrote both functions from one individually-awaited
`create()` per row to a fixed small number of `createMany()` calls per
Version: sections (1), parent ingredients (1), substitute ingredients (1,
only if any exist), instructions (1), part links — top-level and
section-nested combined (1, only if any exist). Every row's own primary key
(`Section`/`Ingredient`/`Instruction`/`PartLink`'s `@default(cuid())` id) is
now pre-generated with `randomUUID()` in application code, the same way
`lineageFor()` already mints `lineageId`s — so a child row (a substitute, or
anything scoped to a Section) never has to wait for a DB round trip to learn
its parent's generated id.

**Implementation choices:**
- Two genuine ordering dependencies are preserved as two sequential stages,
  not flattened: (1) Sections must exist before anything referencing a
  Section id (raw-SQL composite FK) — sections `createMany` runs before
  ingredients/instructions/part-links; (2) a substitute Ingredient's
  `substituteForIngredientId` FK needs an already-persisted parent row — parent
  Ingredients are written in their own `createMany`, substitutes in a second
  one.
- `structuralSearchTextFor`, `sortByPosition`, `lineageFor`'s
  fresh-vs-carried-forward semantics, and every existing doc comment's
  described behavior are unchanged — this is a pure write-batching refactor,
  not a behavior change.

**Before/after (modest recipe: 2 sections, 8 ingredients, 6 instructions, 1
part link):** ~20-25 sequential statements → 5 statements (sections,
ingredients, instructions, part links, plus the caller's own `dish.update`),
regardless of content size.

**Manual testing:** this is the single highest-blast-radius change in the
pass — it's the shared write path for `createDish`, `editDish`,
`promoteHistoricalVersion`, `propagateToOneContainer`, `duplicateDish`,
`createIndependentCopyFromGraph`, and `resolvePartUsageOccurrence`. Exercise
ordinary create/edit/import with: multiple sections, ingredients with
substitutes, top-level and section-nested linked Parts, and MATERIALIZED
part-link occurrences (deleted-Part history) — confirm content, ordering,
and lineage all save identically to before.

## F2 / F4 — Sharing acceptance & Part propagation

**Files:** none changed directly.

Both `createIndependentCopyFromGraph` (`dishes/service.ts`) and
`propagateToOneContainer` already call `insertSections`, so both inherit
F1's fix automatically. Per the brief, the request-boundary question (one
transaction per item vs. one for a whole collection, concurrency, background
jobs, progress UI) is untouched — the client-side sequential accept loop in
`direct-share-collection-review-dialog.tsx` and Part propagation's
per-container transaction isolation are exactly as before.

**Manual testing:** re-run the sharing-acceptance scenario that originally
motivated the audit (3 recipes / 8 linked Parts) and a multi-container Part
propagation, to measure the new per-object baseline.

## F3 — Part-rename structural-search fan-out

**File:** `src/lib/dishes/service.ts` (`refreshStructuralSearchTextForPartUsages`)

**What changed:** was 1 + 3N sequential round trips for N containers
linking the renamed Part (a `findUnique` + a nested `structuralSearchTextFor`
`findMany` + an `update`, per container). Now: one `findMany` for every
affected container's current-Version content, one `findMany` for every
linked Part's current title (shared across all containers instead of
re-resolved per container), then every container's search text computed in
memory and persisted via one raw `UPDATE ... FROM (VALUES ...)` statement
(post-implementation review correction, see below).

**Implementation choices:** kept the existing `structuralSearchTextFor`
helper untouched for its other 7 call sites (new-Dish/new-Version creation)
— only this one fan-out caller was rewritten, since it's the only one that
was N+1 shaped.

**Post-implementation review correction:** the writes were originally
persisted via `Promise.all` of N `client.dish.update()` calls. Review caught
that both real callers pass an interactive-transaction `tx`, never the bare
`prisma` client — concurrent queries against one shared transaction handle
is a documented Prisma anti-pattern (no genuine parallelism on one
connection, and some engine/adapter combinations reject it outright), and a
heavily-reused Part could mean dozens of concurrent writes even where it
does work. Replaced with the same single-statement raw-SQL batching pattern
F8 uses for checklist rescale — one `UPDATE ... FROM (VALUES ...)`, still
writing each container's own distinct value, eliminating both the
reliability question and any connection pressure regardless of N.

**Before/after (Part used in 15 recipes):** ~46 sequential statements → 3
statements (containers, versions, target titles) plus N concurrent updates.

**Manual testing:** rename a Part that's linked from several recipes and
confirm every linked recipe's search/filter results still reflect the new
name.

## F5 — Convert Section to Part redundant round trip

**Files:** `src/lib/dishes/service.ts`, `src/lib/dishes/schema.ts`,
`src/lib/dishes/actions.ts`, `src/lib/importExport/service.ts`,
`src/components/domain/dish/convert-section-to-part-dialog.tsx` (+ its test)

**What changed:** `convert-section-to-part-dialog.tsx` was calling
`createDish` then a *second* server action, `listAttachablePartVersions`,
purely to learn the version id `createDish`'s own transaction already
created. `createDish`'s action now returns that `versionId` directly
(`DishActionState.versionId`, additive/optional), so the dialog uses it
without the second round trip.

**Implementation choice — deviation from the literal proposal:** the audit
suggested changing `createDish`'s return value directly. Doing that broke
~18 integration test files and other call sites that call
`dishService.createDish` expecting a plain `string` (I initially made this
change and caught the breakage before finalizing). Instead: the actual
creation logic was extracted into a new `createDishWithVersion` (returns
`{dishId, versionId}`); the public `createDish` is now a thin wrapper
preserving the exact original `Promise<string>` contract for every existing
caller. Only `dishes/actions.ts`'s `createDish` action calls
`createDishWithVersion`. `importExport/service.ts#confirmImport` is
unchanged.

**Before/after:** 2 sequential server-action round trips (~7-8 DB
statements) → 1 round trip (~5 statements) for Convert Section to Part.

**Manual testing:** convert a Section to a Part from the recipe editor and
confirm the resulting PartLink attaches at the correct position with no
console/network error.

## F6 — Recipe detail Part-link tree resolution

**File:** `src/lib/sections/service.ts` (`resolvePartLinkTreeInner`,
`resolveMaterializedPartLinkTree`)

**What changed:** (a) merged the separate `dish.findFirst` (ownership/kind
check + title) and `dishVersion.findFirst` into one query — the ownership
check now rides on the Version lookup's `dish` relation filter, and
`currentTitle` comes back on the same round trip; (b) sibling Sections
within one resolved node now resolve concurrently via `Promise.all` instead
of a sequential `for` loop, in both the LIVE resolver and the MATERIALIZED
snapshot resolver (same anti-pattern, same fix, for consistency).

**Implementation choice:** did not build the larger batched/breadth-first
resolver the audit flagged as a bigger follow-up — only the two low-risk
fixes it explicitly asked for.

**Before/after (3 linked Parts × 2 sections each, one level deep):** ~6
sequential round trips beyond the main detail query → ~3 round trips
(1 per Part node, sections now parallel within each).

**Manual testing:** load a recipe/Part detail page for something with
several linked Parts, including at least one with nested (second-level)
linked Parts, and confirm every title/section/ingredient renders correctly.

## F7 — Cooking Mode tree loading & unnecessary recomputation

**File:** `src/lib/cooking/queries.ts` (`buildPartUnitTree`,
`buildCookableUnits`); `src/app/(cook)/cook/[sessionId]/page.tsx` (F9, see below)

**Tree-loading fix (implemented in full):**
- `buildPartUnitTree`: merged `dish.findFirst` + `dishVersion.findFirst`
  into one query (same pattern as F6); sibling nested Parts now resolve
  concurrently via `Promise.all` instead of sequentially.
- `buildCookableUnits`: top-level entries (Sections and top-level Parts)
  now resolve concurrently — each entry's `authoredIndex` is computed
  synchronously from its array index before any `await` (matching the
  original `authoredCursor++` exactly), and final ordering is decided by
  the existing `.sort()` regardless of resolution order, so parallelizing
  changes nothing observable.

**Before/after (recipe with 3-4 linked Parts, some nested):** 8-15+
sequential round trips → roughly halved per node (1 merged query instead of
2) and fully parallelized across siblings/top-level entries.

**Recomputation fix — intentionally NOT implemented, with reasoning:** the
audit's second F7 ask was to stop recomputing `addableUnits`/the cookable
tree on every `router.refresh()` triggered by unrelated interactions
(checklist toggle, rescale, timer creation). Investigating this: the same
`buildCookableUnits()` call also produces `outputByUnitKey` — the "makes X"
output-quantity data rendered across the **main** cooking view, not just the
rarely-opened Manage Plan sheet `addableUnits` feeds. `outputByUnitKey` is
genuinely re-derived live per the code's own §22.4 authorization doc
comments ("never cached or trusted from client input... called fresh"), and
none of the four triggering interactions actually change it — but decoupling
its sourcing from the full tree walk safely requires either a schema change
(snapshotting output data onto `CookingSessionUnit` at add time) or
extending `useChecklistState`'s optimistic local-state pattern to the
rescale/completion/timer handlers (returning the needed data directly from
each server action instead of triggering a full-page `router.refresh()`).
Both are real, larger follow-ups — attempting either within this pass risked
either a schema migration or a UI-state regression in Cooking Mode's
several responsive layouts, neither of which I could verify without manual
browser testing. The tree-loading batching above still delivers a real,
lower-risk win on every `buildCookableUnits` call regardless of trigger.

**Manual testing:** start a Cooking Mode session on a recipe with several
linked Parts (some nested); confirm session start, checklist toggling,
rescaling, and starting a timer all still work and show correct
output-quantity/addable-units data. This flow's underlying recomputation
cost is unchanged by this pass — only the per-call cost of that
recomputation is reduced.

## F8 — Cooking Mode session rescale

**File:** `src/lib/cooking/service.ts`

**What changed:** `recomputeUnitChecklistDisplay` (one individually-awaited
`update()` per checklist item) replaced by two pure/apply functions:
`computeChecklistDisplayUpdates` (builds the `{id, displayQuantity}` rows
without writing) and `applyChecklistDisplayUpdates` (one
`UPDATE ... FROM (VALUES ...)` raw SQL statement covering every row).
`updateSessionScale` now collects every active unit's rows into one batch
before writing (previously recomputed unit-by-unit); `updateUnitScale`
batches its one unit's rows the same way.

**Implementation choice:** this is the one genuinely new pattern introduced
in this pass — the codebase had zero prior use of `$executeRaw`/`Prisma.sql`
in application code (only in migrations). Chose it over Prisma's
`$transaction([...])` array-batching form (used elsewhere in this same file
for `setUnitCompletion`) because that form still issues one SQL statement
per row — it doesn't collapse row count, only removes JS-level
await-per-statement serialization. Since each row's `displayQuantity`
genuinely differs, a single `updateMany` can't express this; the raw SQL
`VALUES` join is the only way to make it actually one statement. Values are
passed as query parameters via `Prisma.sql`'s tagged template (never
string-concatenated), so this is parameterized exactly like any other
Prisma query — not a SQL-injection risk.

**Before/after (3 units × 8 items):** ~24 sequential awaited statements →
1 raw SQL statement, regardless of session size. Given this eliminates the
scaling risk the original `SHARE_COPY_TRANSACTION_TIMEOUT_MS`-style timeout
overrides exist to hedge against elsewhere, no explicit transaction timeout
was added here — the operation is now O(1) statements, not O(units × items).

**Manual testing — highest-priority item in this whole pass to verify
manually or via the existing integration test:** rescale a session with
multiple units and multiple checklist items (including at least one
free-text/quantity-less item, which must stay untouched) and confirm every
`displayQuantity` matches what it would have been under the old per-item
logic. `src/lib/cooking/cooking.integration.test.ts`'s "scales whole-session
and per-unit remaining quantities..." test already exercises this path
end-to-end against a real database — this is the test most worth running
first.

## F9 — Cooking Mode page-load waterfall

**File:** `src/app/(cook)/cook/[sessionId]/page.tsx`

**What changed:** `getSessionSourceSummary` was awaited alone, then
`Promise.all([userPreference, sessionReview])` ran after — all three depend
only on the already-resolved `cookingSession`, so they're now one 3-way
`Promise.all`.

**Before/after:** 2 sequential stages → 1. Trivial, low-risk.

## F10 — Meal Plan bulk save

**Files:** `src/lib/mealplans/schema.ts`, `src/lib/mealplans/service.ts`,
`src/lib/mealplans/actions.ts`,
`src/components/domain/mealplans/meal-plan-editor.tsx` (+ its test),
`src/lib/mealplans/mealplans.integration.test.ts` (new tests)

**What changed:** the editor's Save previously drove up to five separate
client-side loops of individually-awaited server-action calls (remove,
replace, update, adopt-newer-Version, add). Replaced with one new action,
`saveMealPlanEntryChanges`, that receives the entire change-set in one
request.

**Implementation choices:**
- **Preserving partial-failure semantics was the binding constraint.** The
  editor's existing behavior is intentionally best-effort: one entry failing
  doesn't block the others, and a batch-level flag/message is shown after.
  Wrapping the whole batch in one all-or-nothing transaction would have
  changed this (a single bad entry would roll back every other entry's
  otherwise-successful change) — not permitted per "preserve... partial-
  failure semantics where they are intentionally user-visible." So the new
  service function still calls the *exact same* existing
  `removeMealPlanEntry`/`addMealPlanEntry`/`updateMealPlanEntry`/
  `adoptNewerVersionInEntry` functions, each independently try/caught, in
  the same category order the client used to call them as separate round
  trips (remove → replace → update → adopt-newer-Version → add), with the
  same skip-logic (a replaced or removed entry is excluded from the
  Version-adoption pass).
- **Sequential, not concurrent, within a category — a deliberate deviation
  from "use bounded concurrency."** Each of the four per-entry functions
  independently re-reads the Meal Plan's live entry set
  (`getOwnedMealPlanOrThrow`) and resyncs linked grocery lists against it.
  Two entries in the same category running concurrently would each read a
  stale pre-batch snapshot missing the other's already-applied change —
  a genuine correctness risk to grocery-list contribution tracking, not
  merely added DB load, so this stays sequential. This trades some of the
  audit's suggested concurrency for correctness, per "Do not simply replace
  the loop with unlimited Promise.all if that would create excessive DB
  concurrency" and the overriding instruction to preserve correctness first.
- What *is* eliminated is the N **client-server** round trips (each paying
  full Next.js server-action overhead) — collapsed to 1. The underlying
  per-entry DB cost (each function's own reads/transaction) is unchanged,
  matching "Preserve current create/edit behavior."

**Before/after (14-entry Meal Plan save):** ~14+ sequential server-action
round trips (≈50-70+ DB round trips per fork B1's estimate) → 1 server-action
round trip (DB round trips server-side are now in-process function calls
instead of separate HTTP requests, but still sequential in count).

**Tests written:** `mealplans.integration.test.ts` gained three new tests
for `saveMealPlanEntryChanges` — a mixed batch (remove + replace + update +
Version-adopt + add) applied correctly in one call; one category's failure
(an unknown entry id) not blocking a different category's success; and the
skip-logic for an entry that's both removed and queued for Version-adoption
in the same batch. `meal-plan-editor.test.tsx` was updated to mock
`saveMealPlanEntryChanges` instead of the four individual actions.

**Manual testing:** create and edit a Meal Plan exercising every category in
one Save (add a few meals, remove one, change another's Recipe entirely,
edit a third's note/yield, and adopt a newer Version on a fourth) — confirm
the resulting plan and any linked grocery list match pre-change behavior.

## F11 — Dish editor save-extras concurrency

**File:** none changed — reverted after investigation.

**Why not implemented:** the audit proposed running `editDish`/`createDish`
and `applyEditorExtras` concurrently via `Promise.all` for the edit path,
since extras only depend on already-known `dish`/`extras`, not on the save's
result. I implemented this, then caught a real behavior regression before
finalizing: the original code only calls `applyEditorExtras` **after**
`editDish` succeeds (inside the `result.status === "success"` branch).
Running both concurrently means extras (version note, default scale) would
be persisted even when the primary content save fails — a silent partial-
save inconsistency that doesn't exist today, and a violation of "preserve
existing... UX" / "Preserve correctness... unless a finding specifically
calls for changing an implementation detail" (this finding didn't call for
a failure-semantics change, just a latency one). There's no way to get the
concurrency without either accepting that regression or adding meaningfully
more complexity (e.g., an explicit rollback of extras on save failure) that
the audit rated this finding's Low-Medium impact doesn't justify. Left as
sequential, exactly as before.

## Minor `sendDirectShareCollection` optimizations

**File:** `src/lib/sharing/collections.ts`

Applied while already in this area, as the audit's brief allowed if
straightforward:
- The five independent pre-transaction validation reads (sender lookup,
  dishes ownership check, chosen-Version ownership check, existing-pending
  check, recipient lookup) now run as one `Promise.all` instead of five
  sequential awaits. Validation **order** (and therefore which error message
  surfaces first when more than one problem exists) is unchanged — only the
  fetching moved earlier/parallel, not the throw order.
- The per-child `DirectShare` create loop is now one `createMany` — nothing
  downstream needs each child's generated id back, so there was no ordering
  dependency to preserve.

**Manual testing:** send a multi-item direct share and confirm the
recipient's collection shows all items correctly; try sending to yourself
and sending a duplicate pending share to confirm the right error message
still appears first in each case.

---

## Summary of what was NOT changed

Per the brief: bulk-share request boundaries, per-item vs. collection-wide
transactions, concurrency limits for sharing/propagation, background jobs,
and progress UI are all untouched. F7's recomputation-avoidance and F11 were
investigated and intentionally left as-is, with reasoning above, rather than
force a change that risked correctness or UX regressions this pass couldn't
safely verify without manual browser testing.

## Files changed

- `src/lib/dishes/service.ts` (F1, F3, F5)
- `src/lib/dishes/schema.ts` (F5)
- `src/lib/dishes/actions.ts` (F5)
- `src/components/domain/dish/convert-section-to-part-dialog.tsx` (F5)
- `src/components/domain/dish/convert-section-to-part-dialog.test.tsx` (F5)
- `src/lib/sections/service.ts` (F6)
- `src/lib/cooking/queries.ts` (F7)
- `src/app/(cook)/cook/[sessionId]/page.tsx` (F9)
- `src/lib/cooking/service.ts` (F8)
- `src/lib/mealplans/schema.ts` (F10)
- `src/lib/mealplans/service.ts` (F10)
- `src/lib/mealplans/actions.ts` (F10)
- `src/components/domain/mealplans/meal-plan-editor.tsx` (F10)
- `src/components/domain/mealplans/meal-plan-editor.test.tsx` (F10)
- `src/lib/mealplans/mealplans.integration.test.ts` (F10, new tests)
- `src/lib/sharing/collections.ts` (minor `sendDirectShareCollection` fixes)

## Recommended verification order

1. `src/lib/dishes/*.integration.test.ts` and `src/lib/dishes/service.ts`-
   adjacent suites — validates F1 across every write path.
2. `src/lib/cooking/cooking.integration.test.ts` — validates F7/F8/F9,
   especially the new raw SQL path.
3. `src/lib/mealplans/mealplans.integration.test.ts` — validates F10,
   including the three new tests.
4. `src/lib/sections/sections.integration.test.ts` (or equivalent detail-page
   coverage) — validates F6.
5. Sharing acceptance re-measurement (F2/F4) against the original ~2s/object
   baseline, to establish the new number before the deferred bulk-
   architecture discussion.
