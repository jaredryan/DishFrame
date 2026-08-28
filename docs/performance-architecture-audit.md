# DishFrame Performance Architecture Audit

**Method:** static trace of representative flows from client entry point through
server action → service function → Prisma → database, cross-referenced against
production's connection setup (`src/lib/db/adapter.ts`) and schema (`prisma/schema.prisma`
+ migration history). No profiler/APM run, no code changed. Findings are ranked by
counted or estimated sequential-statement volume, since that is the dominant cost
driver identified below.

**Central conclusion up front:** the ~20-25 individually-awaited writes found in the
sharing-acceptance path (`createIndependentCopyFromGraph`) is **not an isolated bug**.
It is one call site of a single shared helper pair — `insertSections`/`insertPartLinks`
in `src/lib/dishes/service.ts:471-627` — that backs nearly every Version-creating
operation in the app. That helper pair, plus a recurring *client-side* pattern of
looping N sequential server-action calls for N domain objects (first found in the
sharing review dialog, now also found in Meal Plan save and Cooking Mode's
add-units flow), account for the large majority of findings in this audit.

**Why it's this expensive specifically:** production connects to Neon via the
serverless WebSocket driver (`src/lib/db/adapter.ts:1-37`, `PrismaNeon`), which has
materially higher per-statement round-trip latency than local Postgres. A single
sequentially-awaited `create` costs little locally but adds up fast against Neon —
already documented in-repo: `collections.ts:20-24` notes Prisma's 5000ms default
interactive-transaction timeout was observed timing out for a *single* accepted
share item, which is why both sharing accept paths carry explicit timeout overrides
(`SHARE_COPY_TRANSACTION_TIMEOUT_MS = 20_000`, `FINALIZE_COLLECTION_TRANSACTION_TIMEOUT_MS = 45_000`).
Every finding below that involves a sequential-awaited-loop pays this same tax.

---

## Findings

### F1 — `insertSections`/`insertPartLinks`: row-by-row writes shared across nearly every write flow

**Affected flows:** recipe creation, `/import`, recipe edit/save, Part creation/
conversion, Part propagation, historical version promotion, Part-usage occurrence
resolution, and shared-recipe/Part acceptance (already known).

**Files/functions:**
- `src/lib/dishes/service.ts:471-508` (`insertPartLinks`) — one `await tx.partLink.create()` per link.
- `src/lib/dishes/service.ts:510-627` (`insertSections`) — one `await tx.section.create()` per section, one `await tx.ingredient.create()` per ingredient (+1 more per substitute), one `await tx.instruction.create()` per instruction, then `insertPartLinks` again per section.
- Confirmed call sites (7 total, `service.ts` lines 1071, 1430, 1678, 1886, 2179, 2412, 2859): `createDish`, `editDish`'s version-creating branch, `promoteHistoricalVersion`, `propagateToOneContainer`, `duplicateDish`, `createIndependentCopyFromGraph`, `resolvePartUsageOccurrence`.
- `/import`'s `confirmImport` (`src/lib/importExport/service.ts:28-36`) calls `createDish` directly — the parser itself is pure in-memory work with zero DB cost; 100% of import's DB cost is this helper.

**What happens today:** for a recipe with S sections, I ingredients (some with
substitutes), T instructions, and P part links: roughly `1 (dish) + 1 (version) +
S + I(+substitutes) + T + P + 1 (dish update)` individually-awaited statements,
all sequential, all inside one open transaction. A modest recipe (2 sections, 8
ingredients, 6 instructions, 1 part link) ≈ 19-22 statements — matching the
sharing-path's already-known 20-25 almost exactly.

**Count:** ~20-25 sequential statements for a modest recipe; scales linearly with content size.

**Sequential or parallel:** Fully sequential — no `createMany`, no `Promise.all`, anywhere in either function.

**Why it matters:** this is the write path for essentially every "save a recipe" or
"save a Part" action in the app, not a sharing-specific cost. It plausibly explains
the "normal create/edit takes a few seconds" complaint on its own, independent of
sharing. Because it runs inside a live transaction, the transaction is held open
for the full sequential duration — the same mechanism that forced the timeout
overrides referenced above.

**Recommended optimization (not implemented):** convert to `createMany` /
`createManyAndReturn` where the parent id isn't self-referential:
- Ingredients: two ordered batches (parent ingredients via one `createMany`, then
  substitutes via a second once parent ids are known) — or mint ids client-side
  (`randomUUID()`, matching `lineageFor()`'s existing per-row id-minting
  convention) to collapse both into a single `createMany`.
- Instructions and part-links have no self-referential dependency — one `createMany`
  per section, or one across all sections once section ids are known.
- Sections need their own ids back for children; either parallelize section
  creation via `Promise.all`, or pre-mint ids and use one `createMany`.

**Expected impact:** **High** — highest-leverage fix in the audit; sits on the hot path of every create/edit, not just sharing.
**Implementation risk:** **Medium** — needs care around the ingredient/substitute id dependency, `lineageFor()`'s id-minting, and verifying `createMany` behavior with the JSON `materializedContent` field on MATERIALIZED part links.

---

### F2 — Shared-recipe/Part acceptance (`createIndependentCopyFromGraph`) — the flow that triggered this audit

**Affected flows:** accepting a shared recipe/collection.

**Files/functions:** `src/lib/dishes/service.ts:2242-2445`; consumed by `sharing/service.ts:615-669` (`acceptDirectShare`, one transaction per item, 20s timeout) and `sharing/collections.ts:443-513` (`finalizeDirectShareCollectionDecision`, one transaction for the whole batch, 45s timeout — currently unused by the UI, which instead calls `acceptDirectShare` once per item in a client-side sequential loop, `direct-share-collection-review-dialog.tsx:123-138`).

**What happens today:** inherits F1's per-object cost in full, plus a sequential
per-distinct-source-dish rating-snapshot read before the transaction opens
(`getDuplicationRatingSnapshot`, cheap, off the transaction clock). The *request
boundary* question (one transaction per item vs. one for the whole batch vs.
concurrency vs. background job) is explicitly out of scope for this audit per the
brief — F1's fix applies here identically regardless of which request-boundary
architecture is chosen later.

**Count:** ~20-25 sequential statements per copied object (already established).

**Sequential/parallel:** Sequential within an object (F1); the *current* UI additionally serializes N objects via N sequential HTTP round trips (client loop), while the unused bulk path serializes them within one transaction instead.

**Recommended optimization:** apply F1's fix here first (it's the same helper). Defer the request-boundary decision (transaction scope, concurrency, background job, progress UI) to the follow-up work explicitly reserved for after F1 lands.

**Expected impact:** **High** (inherits F1). **Implementation risk:** **Medium** (inherits F1; no additional risk from this call site specifically).

---

### F3 — `refreshStructuralSearchTextForPartUsages`: unbatched N+1 fan-out on every Part rename

**Affected flows:** recipe/Part edit-save, whenever `dish.kind === "PART"` and the title changed.

**Files/functions:** `src/lib/dishes/service.ts:670-716`, called from `editDish` at lines 1262 and 1467. Depends on `structuralSearchTextFor` (`service.ts:639-656`), which itself issues a further `findMany`.

**What happens today:**
1. One `findMany` to find every container currently linking this Part live.
2. For **each** container, sequentially: one `findUnique` re-fetching that container's current version content, one `structuralSearchTextFor` call (its own `findMany` to resolve linked-Part titles), then one `dish.update`.

For a Part used in N recipes: `1 + 3N` sequential statements. A Part used in 15 recipes ≈ 46 sequential statements inside the rename's own transaction.

**Count:** `1 + 3N` where N = number of recipes/Parts currently linking the renamed Part.

**Sequential/parallel:** Fully sequential (`for` loop, no `Promise.all`).

**Why it matters:** scales with *how popular the Part is* — exactly the reuse pattern DishFrame's Part system is designed to encourage, so a simple title-only edit on a well-used Part can be slower than editing a whole recipe's content.

**Recommended optimization:** batch the fan-out — one `findMany` across all N containers' current-version content, compute each container's search text in memory (resolving all target-Part titles once via a single batched query, not once per container), then persist via `Promise.all` of updates (still N writes, but parallel rather than serial and with no repeated sub-query).

**Expected impact:** **Medium** — high for accounts with heavily-reused Parts, negligible for accounts that rarely rename shared Parts.
**Implementation risk:** **Low-Medium** — read-side batching is mechanical; needs care that per-container Part-title resolution stays correct once batched across containers with different linked-Part sets.

---

### F4 — `propagatePartUpdate`: N independent sequential transactions (same shape as sharing acceptance)

**Affected flows:** propagating a newer Part Version to multiple parent Recipes/Parts (`part-usage-panel.tsx:70`).

**Files/functions:** `src/lib/dishes/service.ts:1939-1970` (`propagatePartUpdate`), looping over `propagateToOneContainer` (`service.ts:1726-1928`) once per selected container.

**What happens today:** for each selected container, an independent read pair
(`getOwnedDishOrThrow` + `getDishScopedVersionContentForReuseOrThrow`), then its
own `withVersionAllocation` transaction containing a full F1-shaped write plus a
`structuralSearchTextFor` read. Containers are processed one at a time,
deliberately (per the doc comment at `service.ts:1930-1938`: one container's
failure must not roll back the others).

**Count:** N × (F1's per-object cost), fully serialized.

**Sequential/parallel:** Sequential by explicit, correctness-motivated design — this is the *same architectural shape* as sharing's N-independent-transactions accept flow.

**Why it matters:** propagating to 10 parent recipes is 10× F1's per-recipe cost, serialized — potentially 15-20+ seconds today, the same order of magnitude as the sharing case that started this investigation.

**Recommended optimization:** do not change the per-container isolation (it's a real correctness requirement, not an accident). F1's fix directly reduces the dominant per-container cost. Once containers are cheaper, consider bounded concurrency across containers — explicitly the same open question already deferred for sharing's bulk accept; worth resolving once, as a shared pattern, rather than separately per flow.

**Expected impact:** **Medium-High** for accounts with widely-reused Parts; **Low** for light Part usage.
**Implementation risk:** **Low** for the F1-inherited portion; **Medium** if concurrency is added on top (Neon connection-pool pressure).

---

### F5 — Convert Section to Part: redundant second server-action round trip

**Affected flows:** creating/converting a reusable Part.

**Files/functions:** `src/components/domain/dish/convert-section-to-part-dialog.tsx:92-134`; `src/lib/dishes/service.ts:996-1114` (`createDish`); `src/lib/sections/actions.ts:77-90` + `src/lib/sections/service.ts:89-99` (`listAttachablePartVersions`).

**What happens today:** `handleConvert` awaits `createDish("PART", …)` (creates
`Dish` + `DishVersion` in one transaction, ~4-5 statements), then — purely to learn
the version id that transaction already created — awaits a second, fully separate
server action `listAttachablePartVersions(dishId)` (`requireUserId` + `getOwnedDishOrThrow`
+ `dishVersion.findMany`, ~3 more statements). `createDish`'s service function
returns only `dish.id`, discarding the version id (`newVersion.id`) it already has
in hand.

**Count:** 2 sequential server-action round trips / ~7-8 DB statements, where 1 round trip / ~5 statements would suffice.

**Sequential/parallel:** Sequential, but only because of a discarded return value — not a genuine data dependency.

**Recommended optimization:** have `createDish` return `{ dishId, versionId }`; thread that through the `dishes/actions.ts` action's return type; drop the `listAttachablePartVersions` call from the dialog entirely. Worth checking whether `/recipes/new` and `/import` have the same "create then re-fetch version id" pattern (not verified in this audit).

**Expected impact:** **Medium** (halves round trips for this interaction; may benefit other `createDish` callers too).
**Implementation risk:** **Low** — additive return-type change, no behavior change.

---

### F6 — Recipe detail loading: Part-link tree resolution issues 2 sequential queries per node, sections not parallelized

**Affected flows:** recipe/Part detail page loading, whenever the recipe links one or more Parts.

**Files/functions:** `src/lib/sections/service.ts:454-563` (`resolveNestedPartLinks`/`resolvePartLinkTreeInner`), consumed by `src/components/domain/dish/dish-detail-view.tsx` (which does parallelize at the *outer* level via `Promise.all`, lines 118-133 and 181-187).

**What happens today:** for every linked-Part node in the tree, two separate
sequential queries: `prisma.dish.findFirst` for `currentTitle` (line 497), then
`prisma.dishVersion.findFirst` with a full `sectionContentInclude`/`partLinks`
include (line 503) — where one merged query would do. When a resolved Part's own
sections contain further nested Part links, those sections are walked in a plain
`for` loop awaiting `resolveNestedPartLinks` per section (lines 521-537) —
sequential across sibling sections that have no dependency on each other.

**Count:** ~2 queries per resolved Part-link node; a recipe linking 3 Parts × 2 sections each, no further nesting, ≈ 6 sequential round trips beyond the main detail query — compounding again with any second-level nesting.

**Sequential/parallel:** Parallel across top-level links/sections (good, already in place at the outer call); sequential within a node and across a node's sibling sections (the gap).

**Why it matters:** smaller magnitude than F1 but the same shape — several hundred ms added to a page load that should be a single well-indexed read, scaling with how Part-heavy a given recipe is.

**Recommended optimization:** (a) merge the `dish.findFirst` + `dishVersion.findFirst` into one query per node (fetch `currentTitle` via an `include: { dish: { select: { currentTitle: true } } }` on the version query); (b) parallelize the sections loop with `Promise.all`; (c) longer-term, a batched/breadth-first resolver fetching all same-depth targets in one `findMany` — bigger refactor, not needed for the immediate win.

**Expected impact:** **Medium** overall (**High** for power users with deeply composed recipes, **Low** for recipes with 0-1 linked Parts).
**Implementation risk:** **Low** for (a)/(b); **Medium** for (c) if pursued.

---

### F7 — Cooking Mode: `buildCookableUnits`/`buildPartUnitTree` recursive N+1, recomputed on nearly every interaction via `router.refresh()`

**Affected flows:** Cooking Mode startup, adding units mid-session, and — indirectly, via over-eager refresh — nearly every other Cooking Mode interaction.

**Files/functions:** `src/lib/cooking/queries.ts:492` (`buildPartUnitTree`), `:609` (`buildCookableUnits`); consumed by `startCookingSession` (`src/lib/cooking/service.ts:206`), `addSessionUnits` (`service.ts:311`), and recomputed on every render of `src/app/(cook)/cook/[sessionId]/page.tsx:107-134` purely to populate the "addable units" list.

**What happens today:** for every top-level Section/linked-Part entry, and
recursively for every nested linked Part, `buildPartUnitTree` does 2 sequential
`await`ed reads (`dish.findFirst` + `dishVersion.findFirst` with nested
`sections`/`partLinks` includes) inside a `for` loop that awaits each recursive
call before starting the next (`queries.ts:696-710`, `:579-592`) — no batching, no
`Promise.all`. A recipe with 3-4 linked Parts (some nested) can produce 8-15+
sequential round trips just to compute this list. Legitimately re-derived
server-side each time for authorization (§22.4 — never trusts client input), so
the *re-derivation* isn't wrong, but the *recomputation trigger* is: `router.refresh()`
fires after essentially every mutating interaction — `handleSetUnitCompletion`
(cooking-mode-shell.tsx:249), `handleSaveSessionScale` (:265), `handleSaveUnitScale`
(:283), `onTimerCreated` (:465), and every add/remove/restore/reorder action in
`CookingPlanManager` (cooking-plan-manager.tsx:97) — each triggering a full
server-render that reruns the entire tree above, even though checking off a unit
or starting a timer has nothing to do with the addable-units list.

**Count:** ~2 sequential statements per tree node (8-15+ for a Part-heavy recipe), recomputed on nearly every mutating click during a session.

**Sequential/parallel:** Sequential recursion (no batching); the refresh trigger additionally multiplies this cost across unrelated interactions.

**Why it matters:** most probable explanation for Cooking Mode feeling slow on any recipe with linked Parts — routine interactions pay for a full recomputation unrelated to what the user just did, at Neon per-statement latency.

**Recommended optimization:** (a) batch `buildPartUnitTree`'s reads — one `findMany` per depth level instead of per-node, or a recursive CTE; (b) stop recomputing `addableUnits` on every `router.refresh()` — either scope refreshes narrowly (return updated data directly from the server action instead of a full page reload) or cache the addable-units computation and invalidate only when the session's source Version or unit set actually changes.

**Expected impact:** **High**. **Implementation risk:** **Medium** (recursive tree logic, cycle/visited-set handling needs care).

---

### F8 — Cooking Mode: session rescale loops per-unit × per-checklist-item updates inside one transaction

**Affected flows:** rescaling an entire cooking session ("Cook for X").

**Files/functions:** `src/lib/cooking/service.ts:831-858` (`updateSessionScale`), using the per-item loop in `recomputeUnitChecklistDisplay` (`:800-822`).

**What happens today:** one `$transaction` that, for every active unit, awaits a
`tx.cookingSessionChecklistItem.update()` per checklist item sequentially — each
row's `displayQuantity` differs, so a simple `updateMany` doesn't directly apply.
A session with 3 units × 8 items ≈ 24 sequential awaited writes inside one open
transaction, with no visible raised timeout override (unlike the sharing/F1 paths).

**Count:** units × items-per-unit, sequential.

**Sequential/parallel:** Sequential.

**Why it matters:** same anti-pattern as F1, and the missing timeout override means a session with many units risks the same P2028 timeout class of failure already observed (and fixed) elsewhere.

**Recommended optimization:** a raw SQL batch update (`UPDATE ... FROM (VALUES ...)` or `CASE WHEN`) to collapse this to one statement; at minimum, confirm/add a raised transaction timeout matching the pattern already used for sharing accepts.

**Expected impact:** **Medium** (rescale is much less frequent than checklist toggles, but risk of outright failure on larger sessions raises this above cosmetic).
**Implementation risk:** **Medium**.

---

### F9 — Cooking Mode: minor page-load waterfall

**Affected flows:** Cooking Mode session page load.

**Files/functions:** `src/app/(cook)/cook/[sessionId]/page.tsx:66-79`.

**What happens today:** `getSessionSourceSummary(...)` is awaited alone, then
`Promise.all([userPreference, sessionReview])` runs after — but all three depend
only on the already-resolved `cookingSession`, not on each other.

**Recommended optimization:** merge into a single 3-way `Promise.all`.

**Expected impact:** **Low** (saves ~1 round trip). **Implementation risk:** **Low**.

---

### F10 — Meal Plan editor save: sequential per-entry server-action loop (second occurrence of sharing's pattern)

**Affected flows:** saving a Meal Plan with multiple entries (create or edit).

**Files/functions:** `src/components/domain/mealplans/meal-plan-editor.tsx:500-652` (`handleFinalSave`); `addMealPlanEntry` (`src/lib/mealplans/service.ts:295-312`, 3 sequential reads before its own transaction).

**What happens today:** create mode awaits `createMealPlan` then a `for` loop
awaiting `addMealPlanEntry` once per draft entry, sequentially (`:523-539`). Edit
mode is worse — up to five separate sequential loops depending on what changed:
removed entries, changed-Recipe/Version remove+add pairs, simple field updates,
"adopt newer Version," and new-entry adds (`:546-641`). A 2-week meal plan with 14
dinners ≈ 14 sequential server-action round trips × ~4-5 DB round trips each ≈
50-70+ sequential round trips for one Save click.

**Count:** N entries × (1 server-action round trip × ~4-5 DB statements), fully sequential; up to 5× that if editing touches every category of change.

**Sequential/parallel:** Sequential — client-driven `for` loop of `await`ed server-action calls, architecturally identical to the sharing review dialog's per-item loop that triggered this whole audit.

**Why it matters:** directly answers the audit's central question — the "N items → N sequential client-driven server-action calls" pattern is not a one-off sharing mistake, it recurs wherever a UI batches multiple domain writes from a single user action.

**Recommended optimization:** same fix family as sharing — a bulk server action taking the whole entry-change list, or at minimum `Promise.all` where entries have no ordering dependency (the remove-loop and add-loop, in particular, don't depend on each other in most cases). Needs care preserving the current per-iteration `hadEntryError` partial-failure handling.

**Expected impact:** **High** for users with denser meal plans.
**Implementation risk:** **Medium** (partial-failure semantics currently handled per-iteration).

---

### F11 — `dish-editor.tsx`: post-save "extras" awaited sequentially despite no data dependency

**Affected flows:** every recipe/Part save (the single highest-frequency flow in the app).

**Files/functions:** `src/components/domain/dish/dish-editor.tsx:447-505` (`performSave`/`applyEditorExtras`).

**What happens today:** `performSave` awaits `editDish`/`createDish` to fully
complete, *then* awaits `applyEditorExtras` (which internally already parallelizes
its own two possible calls — `updateVersionNote`/`setDefaultScale` — via
`Promise.all`, `:471`), *then* calls `router.refresh()` (edits only) followed by
`router.push()`. `extras` is derived from props known before submission, not from
the save's result, so for **edits** (where `dish` already exists) the two stages
have no true data dependency.

**Recommended optimization:** for the edit path, run `editDish(...)` and
`applyEditorExtras(...)` concurrently via `Promise.all` rather than sequentially.
The create path genuinely needs the new dish id first, so this applies to edits
only. The `router.refresh()`-before-`push()` sequencing is a deliberate fix for a
specific race condition per its own comment (`:494-499`) — leave that as is.

**Expected impact:** **Low-Medium** — `applyEditorExtras` only fires calls when those specific fields changed, so most saves see zero extra cost either way, but this is a free win on the app's highest-frequency flow.
**Implementation risk:** **Low**.

---

## Things that look fine and should not be optimized

- **Section/ingredient/instruction/substitute editing UI** (`section-fields.tsx`, `ingredient-fields.tsx`, `substitute-fields.tsx`) — pure client-side `react-hook-form` array-field state, zero server round trips until the single Save. Correct architecture; do not touch.
- **`getOwnedDishOrThrow`, `getOwnedDishDetailOrThrow`, `getOwnedVersionDetailOrThrow`, `getOwnedSessionOrThrow`, `getServerSession`** — all `React.cache()`-wrapped, deliberately deduping the `generateMetadata` + page-component double-fetch per request. Already solved; not a new finding.
- **`assertValidPartLinkTargets`** (`src/lib/sections/service.ts:308+`) — correctly batches its dish-ownership/kind check into one `findMany` with `id: { in: distinctDishIds } }` regardless of how many part links are being validated. Good template for F1/F3's batching work.
- **`highestMajorVersion`/`nextVersionNumbers`** (`service.ts:130-159`) — single lightweight `aggregate` queries, not a meaningful cost.
- **`editDish`'s no-material-change branch** (metadata/stage/title-only edits, `:1233-1279`) — small, fixed statement count regardless of recipe size.
- **Recipe library/list loading and filtering** (`queries.ts:194-360` `queryDishLibrary`, `dishCardSelect`, `getPrincipalRatingsForDishes`) — the best-optimized flow found in this audit: one `findMany` with a narrow card-scoped `select`, ratings batch-resolved in exactly one extra `findMany` with `dishId: { in: [...] }` (not per-row), last-cooked lookup called only when the active sort needs it, and search hits dedicated Postgres trigram GIN indexes (`dish_current_title_trgm_idx`, `dish_current_structural_search_text_trgm_idx`, `dish_cuisine_trgm_idx` — present in migration history, not visible in `schema.prisma` itself per the project's raw-SQL-object convention). No pagination exists, but that's fine at the personal-library scale the product targets; flag for later only if libraries grow into the thousands.
- **Database indexing generally** — reviewed `schema.prisma`'s `@@index`/`@@unique` declarations against the query patterns traced in this audit (`Dish`, `DishVersion`, `Section`, `Ingredient`, `Instruction`, `PartLink`, `DirectShare`, `DirectShareCollection`, and the sharing/mealplan/grocery/cooking models). Coverage is appropriate for the filter/join paths actually used; no missing-index findings.
- **`revalidatePath` usage** — swept ~50 call sites across `sharing`, `dishes`, `cooking`, `mealplans`, `grocery`, `reviews`, `tasters`, `tags`, `flavor-profiles`, `preferences`, `account` actions. Every call targets a specific route or a small, directly-affected set — no broad/root-layout over-revalidation found.
- **`useChecklistState`** (Cooking Mode checklist hook) — a well-built optimistic-UI pattern: instant local state update, background persistence, no `router.refresh()` per toggle, concurrent (not sequential) per-item persistence on "toggle all." This is the model other flows (F10 in particular) should move toward, not something to change.
- **`CookingNotesField`, `SessionReviewForm`, `saveSessionReview`** — one clean server-action call per save; `saveSessionReview`'s two independent reads already use `Promise.all` correctly.
- **`sendDirectShareCollection`'s graph-freezing step** (`sharing/collections.ts:229-243`) — already parallelizes the per-item `buildShareGraph` reads via `Promise.all`, the correct pattern. (Its pre-transaction validation reads and its in-transaction per-child `directShare.create` loop are minor, not separately written up as a numbered finding since they're small — a handful of statements, not 20+ — but both are mechanically fixable the same way as F1/F5 if convenient while touching this file: the ~5 independent validation reads at `collections.ts:172-223` could be one `Promise.all` instead of sequential awaits, and the per-child create loop at `:255-269` could be one `createMany`.)
- **`resolvePartVersionForDetach`, `dish-detail-actions.tsx`, `part-usage-panel.tsx`, `grocery-list-detail-view.tsx`'s on-demand version-option fetch** — no duplicate-fetch or reload-on-open patterns found; each fetches genuinely-not-yet-available data exactly once, on demand.

---

## 1. Top systemic bottlenecks

1. **Row-by-row writes with no batching** (`insertSections`/`insertPartLinks`, F1) — the single dominant cost, present on 7 call sites covering nearly every content-writing operation in the app.
2. **Client-driven "N items → N sequential server-action calls"** — found independently in sharing (the original trigger), Meal Plan save (F10), and effectively in Cooking Mode's add-units flow (F7) — a recurring UI-layer pattern, not a one-off.
3. **Unbatched N+1 fan-outs in recursive/derived-data resolution** — Part-link tree resolution on recipe detail (F6) and Cooking Mode's cookable-units tree (F7) both do one-or-two DB round trips per graph node instead of batching by depth.
4. **Over-eager full-page recomputation on `router.refresh()`** — most visible in Cooking Mode (F7), where cheap interactions (check off a unit, start a timer) pay for an unrelated, expensive tree recomputation on every refresh.

## 2. Highest-value optimizations, ordered by expected impact

| # | Finding | Impact | Risk |
|---|---------|--------|------|
| 1 | F1 — batch `insertSections`/`insertPartLinks` with `createMany` | High | Medium |
| 2 | F7 — batch `buildPartUnitTree` + stop over-triggering recompute via `router.refresh()` | High | Medium |
| 3 | F10 — batch/parallelize Meal Plan editor's per-entry save loop | High | Medium |
| 4 | F4 — inherits F1's fix for Part propagation; consider bounded concurrency after | Medium-High | Low (inherits F1) / Medium (if concurrency added) |
| 5 | F3 — batch `refreshStructuralSearchTextForPartUsages`'s per-container fan-out | Medium | Low-Medium |
| 6 | F6 — merge Part-link tree's per-node queries, parallelize sibling sections | Medium | Low |
| 7 | F8 — batch Cooking Mode session-rescale checklist updates | Medium | Medium |
| 8 | F5 — return version id from `createDish`, drop redundant Part-conversion round trip | Medium | Low |
| 9 | F11 — parallelize `dish-editor.tsx` save-extras for edits | Low-Medium | Low |
| 10 | F9 — merge Cooking Mode's page-load `Promise.all` | Low | Low |
| 2 (repeat) | F2 — sharing acceptance inherits F1's fix directly | High | Medium (inherited) |

## 3. Shared helpers/services worth fixing first

- **`insertSections`/`insertPartLinks`** (`src/lib/dishes/service.ts:471-627`) — fixing this once benefits F1, F2, F3 (indirectly, via cheaper per-container writes), F4, and F6's write-adjacent cost, across create, edit, import, propagate, promote, duplicate, and both sharing-accept paths. This is the single highest-leverage file in the codebase for this audit.
- **`structuralSearchTextFor`** (`service.ts:639-656`) — called from inside F1's own write path *and* from F3's fan-out; batching its target-Part-title resolution once benefits both.
- **The "N objects → N sequential server-action calls" client pattern** — no single shared helper exists (each flow reimplements its own loop), which is itself worth noting: introducing one shared client-side "run these N mutations, report an aggregate result" utility (or, better, genuine bulk server actions per domain) would prevent this pattern from being reinvented a fourth time in a future flow.

## 4. Things that look fine and should not be optimized

See the dedicated section above — summarized: the recipe-editing client UI, `React.cache()`-wrapped ownership/session lookups, `assertValidPartLinkTargets`'s batching, lightweight aggregate queries, the no-material-change edit branch, the recipe library/list query (best-optimized flow in the app), overall database indexing (including trigram search indexes), `revalidatePath` scoping, the Cooking Mode checklist optimistic-UI hook, and several dialog/panel components with no reload-on-open problems.

## 5. Phased implementation plan

Each phase is independently measurable before moving to the next — don't stack changes.

**Phase 1 — F1 (`insertSections`/`insertPartLinks` batching).**
Highest leverage, touches the most call sites. Land this alone, then measure: recipe create, recipe edit-save, and `/import` timing before/after. This phase alone should validate or falsify the "Neon per-statement latency dominates" hypothesis this whole audit is built on — if F1 alone doesn't produce a large, visible improvement across those three flows, that's important signal to gather before investing in the remaining phases.

**Phase 2 — F2 + F4 (sharing acceptance, Part propagation) — free wins from Phase 1.**
Both call the same helper fixed in Phase 1; no new code beyond confirming the inherited improvement. Measure: shared-recipe acceptance timing (the original ~2s/object baseline) and a multi-container Part-propagation timing.

**Phase 3 — F7 (Cooking Mode tree batching + refresh scoping).**
Independent of Phases 1-2. Land the `buildPartUnitTree` batching and the refresh-scoping fix separately if possible (two measurable sub-steps) since they have different risk profiles — batching is a pure backend change, refresh-scoping touches several client call sites. Measure: Cooking Mode startup and steady-state interaction latency (checklist toggle, timer start) on a Part-heavy recipe.

**Phase 4 — F10 (Meal Plan editor save loop).**
Independent of Phases 1-3, similar shape to F2 but requires new batching logic (no shared helper to inherit from). Measure: save timing for a multi-entry meal plan, both create and edit modes.

**Phase 5 — remaining medium/low findings (F3, F5, F6, F8, F9, F11), and the noted minor items in `sendDirectShareCollection`.**
Bundle these — each is small and low-risk on its own. Measure opportunistically (detail-page load for F6, Part-rename save for F3, session-rescale for F8, Part-conversion for F5) rather than as a single combined benchmark, since they touch unrelated flows.

**Not yet scheduled — explicitly deferred by this audit's brief:** bulk-share request boundaries, collection-wide vs. per-item transactions, concurrency limits, background jobs, and progress UI. Revisit these only after Phase 1-2 establish the real per-object cost post-optimization; the earlier sharing-specific investigation's recommendations remain the starting point for that follow-up discussion.
