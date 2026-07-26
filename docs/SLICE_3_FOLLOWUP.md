# Slice 3 — Gate 2 Correction Pass

**Status: Complete.** This is a bounded correction pass on top of the
already-complete and already-reported Slice 3 (`docs/SLICE_3.md`, commit
`a015ccc`), done ahead of manual design review at Review Gate 2. It does
not begin Slice 4, and it did not touch Neon, Vercel, or any deploy/push
step. `docs/SLICE_3.md` remains the base Slice 3 report and was **not**
modified by this pass — this document is a supplementary record of what
changed afterward.

## Scope of this pass

Four corrections, all requested in one batch:

1. Fix `editDish`'s Version-creation rule, which previously created a new
   minor Version on *every* save regardless of what changed.
2. Add a compact-list view to the Recipe/Part library, alongside the
   existing grid.
3. Verify (and fix one real gap in) the foundational Ingredient-entry
   controls.
4. Expand `DishEditor`'s component test coverage beyond the
   unsaved-changes guard.

## 1. Corrected Version classification

### The rule, as now implemented in `src/lib/dishes/service.ts`

`editDish` independently classifies every save into exactly one of three
buckets — it never trusts a client-supplied "this is metadata-only" claim:

- **Stable Dish metadata only, or a true no-op** (Stage, cuisine,
  archive/restore state; or literally nothing different from what's
  already saved): **no new `DishVersion`**. `Dish.stage`/`cuisine`/
  `archivedAt` update in place if anything actually changed; if genuinely
  nothing changed, no database write happens at all.
- **Version-owned but non-cooking content** (title, description, yield
  quantity/unit, prep/cook time, difficulty; Section add/remove/rename/
  reorder that leaves every Ingredient's and Instruction's own content,
  owning Section, and position untouched): **exactly one minor Version**,
  created automatically — no user prompt.
- **Any Ingredient or Instruction add, remove, edit, or reorder**: requires
  an explicit `versionChoice` (`"MINOR"` or `"MAJOR"`) from the caller.
  Missing it throws `ValidationError`. `"MINOR"` preserves the current
  major number and increments the minor number (same math as before);
  `"MAJOR"` increments the major number and resets the minor number to
  zero.

### How the classification actually works

`src/lib/dishes/schema.ts` gained `diffVersionContent(base, edited)`, a
pure function comparing two `SectionInput[]` trees. It's deliberately
framework- and DB-agnostic so the **same algorithm** runs on both sides:

- Every Ingredient/Instruction row is matched between `base` and `edited`
  by `lineageId`. A row with no matching `lineageId` in `base` is always
  treated as a genuine addition (this is exactly why `content()`-style
  test fixtures that omit `lineageId` on an "unchanged" row will get
  flagged as a false addition — see the "Known test-authoring gotcha"
  note below).
- A row present in both is compared on content signature (name, quantity,
  quantityEnd, isApproximate, unit, displayText, preparationNote,
  isOptional, substitute), its owning Section's `lineageId`, and its
  position within that Section. Any difference in any of those → cooking
  change.
- A base row absent from the edited set → removed → cooking change.
- Section-level add/remove/rename/reorder is tracked **separately**
  (`sectionOrganizationChanged`) precisely so that reordering or renaming
  Sections whose own Ingredient/Instruction content is untouched falls
  into the non-cooking bucket, not the cooking one — matching "Section
  naming or organization changes that do not alter Ingredient or
  Instruction content" from the settled rule.

`service.ts` builds the `base` side via a new `sectionRowsToInput()`
helper (Prisma rows → `SectionInput[]`), which also now backs
`duplicateDish`'s source-content mapping — that duplicate logic used to be
inlined separately; it's the same shape, so it's shared now instead.
`toIngredientInput()` (used by both) was extended to always include
`lineageId` — safe for `duplicateDish`'s existing call site, since
`insertSections(..., {mintFreshLineage: true})` ignores any supplied
`lineageId` regardless.

### The editor-side interaction

`DishEditor`'s `onSubmit` now runs `diffVersionContent` against the
originally-loaded `dish.values.sections` before saving (only when editing
an existing Dish — a new Dish has nothing to diff against). If it detects
a cooking-content change, it holds the cleaned payload in state and opens
a new dialog instead of saving immediately:

> **How should this be saved?**
> You changed an ingredient or instruction. Save it as part of this
> version, or start a new version for a bigger change.
>
> [Start a new version] [Save in this version]

Clicking either button calls the same `performSave` path with the chosen
`versionChoice`. A non-cooking-only edit (e.g. just the title) saves
directly with no dialog. This mirrors the button-ordering convention
already established by the unsaved-changes dialog in the same file
(less-common/more-consequential action first, safe default last).

### Files touched

- `src/lib/dishes/schema.ts` — `versionChoiceValues`, `VersionChoiceValue`,
  `versionChoiceSchema`, `diffVersionContent`.
- `src/lib/dishes/service.ts` — rewritten `editDish`; new
  `sectionRowsToInput`/`nextVersionNumbers` helpers; `toIngredientInput`
  now includes `lineageId`; `duplicateDish` now shares
  `sectionRowsToInput` instead of an inlined duplicate mapping.
- `src/lib/dishes/actions.ts` — `editDish` Server Action gained an
  optional `versionChoice` parameter, parsed via `versionChoiceSchema`.
- `src/components/domain/dish/dish-editor.tsx` — the choice dialog,
  `performSave`/`chooseVersion`, and the pre-submit `diffVersionContent`
  check.

### No schema or migration changes

The existing `Dish`/`DishVersion` schema already fully supports this —
`majorVersion`/`minorVersion` were always there. `prisma format`/
`validate` confirm `prisma/schema.prisma` is byte-identical to before this
pass.

## 2. Compact-list library view

Added `DishLibraryDisplay` (Client Component), rendered by the existing
`DishLibraryView` in place of its old direct `DishCard`-grid mapping. It
holds an accessible `role="radiogroup"` grid/list toggle (mirroring
`ThemeToggle`'s existing visual pattern) and renders either the existing
`DishCard` grid or a new compact `DishListRow` for the same `dishes`
array — no duplicated data-fetching or archived-filter logic; both views
render whatever `DishLibraryView` already fetched server-side.

`DishListRow` (new) shows title, Stage badge, cuisine (when present), and
an "Updated {date}" line (from `Dish.updatedAt`, already selected by the
existing `dishCardSelect` — no new query needed) — deliberately more than
a shrunken card, deliberately nothing from a later slice (no ratings,
images, cooking counts, or sharing state).

The view-mode preference persists in `localStorage`
(`dishframe:library-view-mode`), defaulting to grid. Reading it uses
`useSyncExternalStore` (server snapshot `"grid"`, client snapshot from
storage) rather than a `useEffect` + `setState` — the first version of
this used an effect and was rightly caught by this repo's
`eslint-config-next` React Compiler rule (`react-hooks/set-state-in-effect`)
during the final `pnpm run check` pass; see "Real bugs caught" below.

`DishCard`'s `basePath` helper was exported as `dishBasePath` so
`DishListRow` could reuse it instead of re-deriving `/recipes` vs. `/parts`
a third time; `DishCardItem` gained `updatedAt: Date`.

### Files touched

- `src/components/domain/dish/dish-library-display.tsx` (new)
- `src/components/domain/dish/dish-list-row.tsx` (new)
- `src/components/domain/dish/dish-card.tsx` — exported `dishBasePath`,
  added `updatedAt` to `DishCardItem`.
- `src/components/domain/dish/dish-library-view.tsx` — delegates rendering
  to `DishLibraryDisplay`.

## 3. Foundational Ingredient controls — verified, one gap fixed

Checked against the approved list: fractions/mixed numbers, ranges,
approximate amounts, free-text quantities, optional Ingredients, unit
entry, preparation notes, reordering.

Everything except fraction/mixed-number entry was already correctly
implemented in the existing `ingredient-fields.tsx`/`section-fields.tsx`.
The one real gap: `NumberField` used a native `<input type="number">`,
which physically blocks typing `/` or a space — so `"1/2"` and `"1 1/2"`
(both explicitly required by `PRODUCT_SPEC.md` §10.4's examples) could
never be typed at all, only rejected keystroke-by-keystroke by the
browser.

Fixed by rewriting `number-field.tsx`: the input is now `type="text"`
(with `inputMode="decimal"` retained for the mobile numeric keyboard), and
a new `parseQuantityText()` parses plain decimals, simple fractions, and
mixed numbers into the decimal the approved schema already stores. A local
text buffer keeps whatever the user is mid-typing on screen without
reformatting it out from under them — the committed React Hook Form value
only updates once the text parses to a real number, and a sync-skip guard
prevents the field's own committed update from clobbering an in-progress
keystroke. This is purely a UI/entry-format fix — no schema change: `"1
1/2"` and `"1.5"` are stored identically as decimal `1.5`, and displaying
that back as a fraction is explicitly `PRODUCT_SPEC.md` §52 (Slice 5
scaling/formatting) scope, not this pass's.

### Files touched

- `src/components/domain/dish/number-field.tsx` — rewritten.

## 4. Expanded test coverage

### Unit

- `src/components/domain/dish/number-field.test.ts` (new, 8 tests) —
  `parseQuantityText` against whole numbers, decimals, simple fractions,
  mixed numbers, extra internal spacing, empty/incomplete text, zero
  denominators, and non-numeric free text.

### Component

- `src/components/domain/dish/dish-editor.test.tsx` — expanded from 3
  tests (unsaved-changes guard only) to 14: Section add/remove/rename/
  reorder; Ingredient add/remove/reorder; Instruction add/remove/reorder;
  minimum-content validation; and three tests for the minor/major choice
  dialog (non-cooking change saves directly with no dialog; a cooking
  change opens the dialog and calling "Save in this version" passes
  `versionChoice: "MINOR"`; "Start a new version" passes `"MAJOR"`).
- `src/components/domain/dish/dish-library-display.test.tsx` (new, 3
  tests) — defaults to grid; switching to list view preserves every dish
  in the (already archived-filtered) list; switching back to grid does
  too.

### Integration (`src/lib/dishes/dishes.integration.test.ts`, against local
Docker Postgres — expanded from 14 to 23 tests)

All 9 scenarios the task specified, plus the prior suite's existing
create/archive/restore/duplicate/delete coverage kept intact:

1. cuisine-only change → no Version.
2. Stage-only change → no Version.
3. true no-op save → no Version (asserts `Dish.updatedAt` is literally
   unchanged, not just that no Version exists).
4. non-cooking Version-owned change (title) → exactly one minor Version.
5. Ingredient change saved as `"MINOR"` → minor number incremented,
   lineageId carried forward for the unchanged row, freshly minted for the
   new one.
6. Instruction change saved as `"MAJOR"` → major incremented, minor reset
   to 0.
7. add/remove/reorder of Ingredients, called *without* a `versionChoice`
   → all three reject with `ValidationError`, and no Version is created by
   any of the three rejected attempts.
8. combined Stage/cuisine change + title change in one save → both the
   stable field and the new minor Version's title update correctly.
9. the original Version's `title` is provably unchanged after a
   subsequent edit creates a new one.

Plus a new "Ingredient field persistence" suite (2 tests) proving a fully-
populated Ingredient (range, approximate, unit, prep note, optional) and a
free-text-only Ingredient (`displayText`, no numeric quantity) both pass
`dishContentSchema.parse()` (server validation) and survive creation, an
edit, and a reload with every field intact. Fraction/mixed-number *text
parsing* itself is covered separately by `number-field.test.ts` (the
client-side piece of that same pipeline).

### Known test-authoring gotcha, worth remembering

The existing `content()` test fixture builds a fresh ingredient payload
with no `lineageId` on purpose (it simulates a brand-new row). Reusing it
unmodified for an edit meant to be "no real content change" produces a
false positive: `diffVersionContent` correctly reads a lineageId-less row
as an addition, since it has no way to know it's "the same" ingredient
without that id. Fixed by adding an `unchangedSections(dish)` helper that
rebuilds the default Section/Ingredient using the *real, already-persisted*
`lineageId`s — i.e., what `dishToFormValues` actually sends for content
the user left alone. Every "should not require a version choice" test now
uses it. This isn't a product bug — it's exactly the correct, intended
behavior of the classification rule — but it's an easy trap to fall into
when hand-authoring edit payloads in tests, so it's called out here.

### Playwright (`tests/e2e/recipe-golden-path.spec.ts`)

- The existing "golden path" test's edit step adds an Instruction — now a
  cooking-content change — so it was updated to handle the new dialog
  (clicks "Save in this version") and now also asserts the Version label
  moves `V1.0` → `V1.1` after that save.
- New test, "ingredient controls, a major Version choice, and the
  grid/list toggle": creates a Recipe with an Ingredient exercising
  fraction entry (`"1 1/2"`), a range, approximate, a unit, a preparation
  note, and optional; confirms the detail page renders it correctly;
  edits the Ingredient's name and chooses "Start a new version", confirming
  `V1.0` → `V2.0`; then exercises the grid/list toggle on the library page,
  confirming the same Recipe stays visible in both views; cleans up by
  deleting it.

Both tests pass reliably in isolation and when run together serially
against a freshly-started dev server. Note for future runs: this repo's
Playwright config doesn't pin `workers`, so a default multi-worker run
hits the same local dev server and local Postgres concurrently; under
heavy load (e.g., a dev server that's been running for hours across a long
session, as was the case here) this occasionally produces a >5s timeout on
an unrelated assertion later in the "golden path" test (confirmed via
repeated isolated re-runs — not caused by anything this pass touched, and
not reproducible against a fresh dev server). If a future CI/local run
sees a flake at that exact assertion, that's the known cause — not a
functional regression.

## Commands run and results this pass

- `pnpm exec tsc --noEmit` — clean, throughout (checked after every
  meaningful step, not just at the end).
- `pnpm exec eslint .` — clean. Caught two real, unrelated-to-this-pass-
  scope-but-real issues along the way (see "Real bugs caught" below).
- `pnpm exec next build` — clean, all 23 routes.
- `pnpm exec vitest run` (all unit/component tests) — **80 passed** (up
  from 58 before this pass).
- `pnpm test:integration src/lib/dishes` — **23 passed** (up from 14).
- `pnpm exec playwright test tests/e2e/recipe-golden-path.spec.ts
  --project=chromium` — 2 passed (up from 1), verified both individually
  and serially together, against a fresh dev server.
- `pnpm exec prisma format` / `pnpm exec prisma validate` — clean, no diff
  to `prisma/schema.prisma` (confirmed via `git status`).
- `pnpm db:scan-migrations` — OK, no unallowed removal across 5 migration
  files (unchanged from before this pass).
- `pnpm db:verify:local` — OK, all 15 protected constraints and 7
  protected indexes present.
- `pnpm run check` (format:check → lint → typecheck → `vitest run` →
  `next build`) — clean on the final run.

## Real bugs caught during this pass (not present in the final code)

Two genuine issues were introduced mid-pass and caught by the verification
steps before landing — noted here since they're the kind of thing worth
remembering for future work in this repo:

1. **`react-hooks/error-boundaries` / `react-hooks/refs` are not the only
   React Compiler lint rules this repo enforces** — this pass also hit
   `react-hooks/set-state-in-effect`: the first version of
   `DishLibraryDisplay` read `localStorage` in a `useEffect` and called
   `setViewMode` from inside it to sync the persisted preference on mount.
   `eslint-config-next`'s React Compiler rule flags this (cascading-render
   risk). Fixed by switching to `useSyncExternalStore` (server snapshot
   `"grid"`, client snapshot read directly from `localStorage`), which
   needs no effect and no caught-mid-render setState at all. Neither `tsc`
   nor `next build` catches this class of issue — only `eslint .` does, so
   it's worth continuing to run lint as its own explicit step rather than
   assuming a clean build implies clean code.
2. Test-authoring-only: the `content()` fixture's default ingredient never
   carries a `lineageId`, which produced 7 initially-failing integration
   tests before being traced to the fixture (not the implementation) — see
   "Known test-authoring gotcha" above.

## Deviations or blockers

None. No schema or migration changes were needed for any of the four
correction areas.

## Updated manual-review checklist

- [ ] Confirm the "How should this be saved?" dialog's copy and button
  order read naturally against `BRANDING.md` §15's voice principles —
  it deliberately avoids the words "minor"/"major" in user-facing copy,
  but do read it aloud once against the rest of the app's tone.
- [ ] Exercise the minor/major choice dialog by hand at least once for
  both a Recipe and a Part edit — this is new interactive surface the
  automated tests don't visually confirm.
- [ ] Confirm the grid/list toggle is comfortable to reach and use at
  actual mobile widths (the automated coverage confirms it functions, not
  that it's ergonomically placed on a phone).
- [ ] Type `"1/3"`, `"2 1/8"`, and a plain decimal into an Ingredient
  quantity field by hand and confirm the detail page's rendered amount
  looks sane (it will render as a decimal — `1/3` → `0.333...`, likely
  worth deciding whether the parser should round to a small number of
  decimal places before this ships past internal review, since `1/3`
  currently stores as a repeating decimal exactly).
- [ ] The prior Slice 3 report's still-open question — whether cuisine/
  Makes/prep-cook-time/difficulty belong in the Slice 3 editor per
  `PRODUCT_SPEC.md` §8.4 — is untouched by this pass and remains open in
  `docs/SLICE_3.md`; this document does not attempt to resolve it.
- [ ] Re-run the full `recipe-golden-path.spec.ts` once more against a
  freshly restarted dev server before treating it as a stable CI baseline,
  given the flake note above.

## Proposed next milestone

Unchanged from `docs/SLICE_3.md`: **Slice 4 — Immutable Version history,
historical majors, Version notes, and comparison**, starting from Review
Gate 2 (a design-direction review of the editor/detail-page pattern,
which this correction pass's dialog and list view both extend) once that
review has been held.

---

# Gate 2 polish pass

A second, smaller pass on top of the Gate 2 correction pass above, done
just ahead of the manual Review Gate 2 walkthrough. Four items, all
requested in one batch: reword the minor/major choice dialog, normalize
Ingredient quantity precision, stabilize the database-mutating Playwright
suite, and record the settled Version-classification rule in canonical
docs (rather than leaving it discoverable only in slice reports).

## 1. Version-choice dialog wording

**Files:** `src/components/domain/dish/dish-editor.tsx`,
`src/components/domain/dish/dish-editor.test.tsx`,
`tests/e2e/recipe-golden-path.spec.ts`,
`src/app/(app)/recipes/[dishId]/edit/page.tsx`,
`src/app/(app)/parts/[dishId]/edit/page.tsx`.

The dialog's title, body, and both button labels changed to avoid
"minor"/"major" jargon while still saying plainly what each choice does
(`BRANDING.md` §15's "explain consequences near decisions" principle):

> **How should this change be saved?**
> You changed an ingredient or instruction. Save this as a refinement of
> the current version, or start a new version for a more substantial
> change.
>
> [Start a new version] [Save as a refinement]

Button order is unchanged from the prior pass (less-common/more-
consequential action first, safe default last) — nothing in `BRANDING.md`
argues for a different order for this specific dialog.

`Save as a refinement` still sends `versionChoice: "MINOR"`;
`Start a new version` still sends `versionChoice: "MAJOR"`. Both Recipe and
Part editors share the same `DishEditor` component, so behavior is
identical for both.

Each button also shows the resulting Version label as smaller, secondary
text ("Starts V2.0" / "Saves as V1.1"), per the requested direction to
surface it "without making the dialog noisy" and without replacing the
plain-language labels with bare numbers. This needed `DishEditor`'s `dish`
prop to gain `currentMajorVersion`/`currentMinorVersion` (both edit
`page.tsx` files already had `dish.currentVersion.majorVersion`/
`.minorVersion` on hand from the existing `getOwnedDishDetailOrThrow`
query — no new fetch). The label math assumes the loaded Version is always
the highest minor in its major line, which is true for all of Slice 3
(there is no UI path yet to edit from a historical major — that's Slice 4).
Dialog open state, keyboard focus, and accessible labeling (`DialogTitle`/
`DialogDescription`) are unchanged from the prior pass's implementation.

Component and Playwright assertions were updated for the new copy; button
lookups use a partial/regex name match (`/Start a new version/`,
`/Save as a refinement/`) since the accessible name now includes the
secondary Version-label text.

## 2. Ingredient quantity normalization

**Files:** `src/lib/dishes/schema.ts`, `src/components/domain/dish/number-field.tsx`,
`src/lib/dishes/service.ts`, `src/components/domain/dish/number-field.test.ts`,
`src/lib/dishes/dishes.integration.test.ts`.

**Discovered scope correction, decided with the user before implementing:**
the task as given asked for 6-decimal-place normalization, but
`Ingredient.quantity`/`quantityEnd` are `Decimal @db.Decimal(12, 3)`
(`prisma/schema.prisma`) — the database itself can only ever hold **3**
places past the decimal point; it silently rounds anything finer on
write. Six-decimal normalization would have been irrelevant past the
database boundary and made the persistence-round-trip tests
(`1/3` surviving reload as `0.333333`) impossible to satisfy without a
migration, which this pass is explicitly not allowed to add. The user
chose: normalize to **3** decimal places everywhere — client parser,
server sanitization, tests, and documentation — so the documented and
actual stored precision are identical, with no gap to explain later.

```text
1/3     → 0.333
2/3     → 0.667
2 1/8   → 2.125 (already exact at 3 places)
1.5     → 1.5   (already under 3 places, unchanged)
```

**One shared pure helper**, `normalizeQuantity` (+ `QUANTITY_DECIMAL_PLACES
= 3`) in `src/lib/dishes/schema.ts` — `Number(value.toFixed(3))` — used by
exactly two call sites, per the "no separate rounding implementations"
requirement:

- **Client:** `parseQuantityText` (`number-field.tsx`) applies it to every
  parsed branch (plain decimal, simple fraction, mixed number) before
  committing the value to React Hook Form state. The local-text-buffer
  behavior from the prior pass (typing "1 1/2" isn't reformatted
  mid-keystroke) is unchanged — normalization only affects the committed
  numeric value, never the visible in-progress text.
- **Server:** `sanitizedSectionsOrThrow` in `service.ts` — the sanitization
  boundary both `createDish` and `editDish` unconditionally call — now maps
  every Ingredient's (and its at-most-one substitute's) `quantity` and
  `quantityEnd` through `normalizeQuantity` (skipping `null`/`undefined`).
  Because this lives inside the service functions themselves rather than
  only in `dishContentSchema`'s Zod parse, a caller that invokes
  `dishService.createDish`/`editDish` directly — bypassing the Server
  Action and its schema validation entirely, which is what most of this
  repo's own integration tests already do — still gets normalized
  quantities. This satisfies "server-side validation/sanitization... so
  direct Server Action or service calls cannot bypass the precision rule"
  literally, not just for the one call path that happens to run the Zod
  schema.

Free-text quantity/display fields (`displayText`, `originalImportedText`)
are untouched — normalization only ever touches the two numeric fields.
No schema or migration change.

**Tests added:**

- `number-field.test.ts` — a new `describe("normalizes to 3 decimal
  places")` block: `1/3`, `2/3`, `2 1/8` (already exact), a decimal already
  under 3 places (`1.5`), a decimal over 3 places (`1.23456789` → `1.235`).
- `dishes.integration.test.ts` — a new `describe("Ingredient quantity
  normalization")` block, calling `dishService.createDish`/`editDish`
  directly (bypassing `dishContentSchema`, proving the "cannot bypass"
  requirement): unbounded `1/3`/`2/3` normalize and survive creation and
  reload; a mixed-number-equivalent decimal already exact at 3 places and
  a decimal with more digits both normalize correctly on an edit, with
  `quantityEnd` following the identical rule; a decimal already at or
  under 3 places persists unchanged. All 3 new tests pass against the real
  local Postgres, confirming the DB's own `Decimal(12,3)` rounding agrees
  exactly with the pre-write JS-side rounding.

**Canonical documentation:** `PRODUCT_SPEC.md` gained `## 10.6a Settled
storage precision` (between §10.6 and §10.7), settling the "rational
numbers vs. normalized decimals vs. ..." open question from §10.6 and
noting that later fraction-aware *display* (§52, Slice 5) should recognize
common fractions from the normalized decimal via a tolerance, not exact
equality. `ARCHITECTURE_PROPOSAL.md` §D.4 (`Ingredient`) gained a one-line
settled-precision note cross-referencing both the DB column and the new
spec section.

## 3. Recipe golden-path Playwright serialization

**Files:** `tests/e2e/recipe-golden-path.spec.ts`, `package.json`.

Added `test.describe.configure({ mode: "serial" })` as the first line
inside the suite's `describe` block — the smallest available fix, scoped
to only this database-mutating suite, leaving every other Playwright spec
file's default parallel/`fullyParallel` behavior untouched.

Added a focused script, `test:e2e:recipe-golden-path`:

```json
"test:e2e:recipe-golden-path": "playwright test tests/e2e/recipe-golden-path.spec.ts --project=chromium --workers=1"
```

Ran it **three times**, each against a freshly-started dev server (the
existing `webServer` config starts `pnpm run dev` fresh when nothing is
already listening on port 3000, and Playwright tears it down again at the
end of the run — no manual server management needed for "freshly
started" to hold true across repeated invocations):

```
Run 1: 2 passed (20.5s)
Run 2: 2 passed (16.6s)
Run 3: 2 passed (15.9s)
```

No timeout recurrence. Nothing about the previously-reported flake was
touched beyond serialization + the one worker-count flag — no timeout
values were widened.

## 4. Canonical Version-classification rule

**Files:** `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE_PROPOSAL.md`.

`docs/SLICE_3.md`/`docs/SLICE_3_FOLLOWUP.md` (this file) recorded the
settled classification rule as a slice-report narrative; it's now also in
the two canonical planning documents so a future implementation session
doesn't need to have read either slice report to know it:

- `PRODUCT_SPEC.md` gained `## 13.2a Settled automatic classification
  (Slice 3 Gate 2 correction)`, inserted between §13.2 and §13.3, spelling
  out the three buckets (no Version / automatic small update / explicit
  choice) and explicitly noting it refines — without contradicting — §13.1
  and §13.2's original "every save creates a Version" / "the user always
  chooses" framing (per this doc's own §1 convention: "later refinements
  take precedence... silence in a later pass does not remove a unique
  earlier requirement").
- `ARCHITECTURE_PROPOSAL.md` gained `### F.5a Settled scope-narrowing of
  the user-facing choice (Slice 3 Gate 2 correction)`, directly after
  §F.5, clarifying that the same two version-creation functions
  (`createSmallUpdate`/`createNewVersion`) are called exactly as F.5
  describes — Gate 2 only narrowed *when the user is asked to choose*, not
  the underlying mechanism.

Both additions are scoped, appended subsections — no existing prose in
either document was rewritten, per the task's "update only targeted
canonical sections" instruction. Nutrition, scaling, and the Slice 4
Version-history/comparison UI remain explicitly out of scope; the new
sections only settle classification, not those later features.

## Commands run and results this pass

- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec eslint .` — clean.
- `pnpm exec vitest run` — **85 passed** (up from 80; +5 in
  `number-field.test.ts`).
- `pnpm test:integration src/lib/dishes` — **26 passed** (up from 23; +3
  quantity-normalization tests).
- `pnpm run test:e2e:recipe-golden-path` (serial, one worker) — 2 passed,
  run 3 times against a freshly-started dev server each time (see above).
- `pnpm exec prisma format` — no diff to `prisma/schema.prisma`.
- `pnpm exec prisma validate` — clean.
- `pnpm db:scan-migrations` — OK, no unallowed removal across 5 migration
  files.
- `pnpm db:verify:local` — OK, all 15 protected constraints and 7
  protected indexes present.
- `pnpm run check` (format:check → lint → typecheck → `vitest run` →
  `next build`) — clean, all 23 routes.

No schema or migration changes were made or needed.

## Deviations or blockers

One real deviation from the literal task text, resolved with the user
before writing any code (see "Discovered scope correction" under item 2,
above): quantity normalization targets **3** decimal places, not 6, to
match the existing, unchangeable `Decimal(12, 3)` database column. This
was a discovered conflict between two explicit instructions (six decimal
places vs. no migration) rather than a judgment call made unilaterally.

No other deviations. Nothing in this pass touched Neon, Vercel, or any
deploy/push step; no Slice 4 work was started.

## Updated manual Review Gate 2 checklist

- [ ] Read the new dialog copy aloud for both a Recipe and a Part edit —
  confirm "How should this change be saved?" / "Save this as a refinement
  of the current version, or start a new version for a more substantial
  change." reads naturally, and that the secondary "Starts V2.0" / "Saves
  as V1.1" text is legible but not distracting.
- [ ] Type `1/3`, `2/3`, and `2 1/8` into an Ingredient quantity field by
  hand and confirm the detail page shows a sane 3-decimal amount (this
  replaces the prior checklist's open question about unbounded repeating
  decimals — that's resolved now, not still open).
- [ ] Confirm the grid/list toggle is comfortable to reach and use at
  actual mobile widths (unchanged open item from the prior pass — this
  polish pass did not touch the library view).
- [ ] The prior Slice 3 report's still-open question — whether cuisine/
  Makes/prep-cook-time/difficulty belong in the Slice 3 editor per
  `PRODUCT_SPEC.md` §8.4 — remains open and untouched by either pass.
- [ ] Confirm `docs/PRODUCT_SPEC.md` §10.6a and §13.2a, and
  `docs/ARCHITECTURE_PROPOSAL.md` §D.4/§F.5a, read as intended additions
  alongside the sections they refine, not as contradictions requiring
  further reconciliation.
