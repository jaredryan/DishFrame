# Slice 3 — Recipe and Part creation, detail, editing, archive, and duplication

**Status: Complete.** All Slice 3 scope from `docs/BUILD_PLAN.md` is implemented,
locally verified (typecheck, lint, unit tests, integration tests, a focused
Playwright golden path, and a production build all pass), and nothing has
been committed, pushed, or applied to Neon. This report supersedes
`docs/SLICE_3_PARTIAL.md`, which is being removed.

This slice resumed from a mid-session checkpoint (see the now-removed
partial report). The backend domain layer, shared editor UI, and three of
four Recipe routes already existed and were preserved as-is; this session's
work was the remaining route, the full `/parts` route set, all tests, and
fixing two real bugs the checkpoint had flagged as unverified.

## Completed Slice 3 scope

- Create a Recipe or Part with structured content (title, Stage, cuisine,
  description, Makes/prep/cook time, difficulty, Sections with Ingredients
  and Instructions) → `V1.0`.
- View a Recipe/Part detail page.
- Edit an existing Recipe/Part → a new minor Version within the current
  major line, previous Version preserved unchanged.
- Archive and restore (Stage-only, no new Version).
- Duplicate → an independent Dish + fresh `V1.0`.
- Permanently delete, including revoking any `ShareLink`/canceling any
  pending `DirectShare` referencing the Dish first.
- Minimum-save validation (title + Stage + at least one meaningful
  ingredient/instruction) enforced both client-side and server-side.
- Owner-scoped services and thin, authenticated Server Actions throughout.

## Files and routes added or changed this session

**New routes:**
- `src/app/(app)/recipes/[dishId]/edit/page.tsx`
- `src/app/(app)/parts/page.tsx` (replaced Slice 2's disabled placeholder)
- `src/app/(app)/parts/new/page.tsx`
- `src/app/(app)/parts/[dishId]/page.tsx`
- `src/app/(app)/parts/[dishId]/edit/page.tsx`

**New module:**
- `src/components/domain/dish/dish-form-values.ts` — extracted from
  `dish-editor.tsx` (see "Deviations/bugs fixed" below).

**Bug fixes to code carried over from the prior session:**
- `src/components/domain/dish/dish-editor.tsx` — removed
  `dishToFormValues`/`blankDishFormValues`/`DishFormValues` (moved to the
  new module).
- `src/components/domain/dish/use-unsaved-changes-guard.ts` — ref update
  moved into an effect.
- `src/app/(app)/recipes/[dishId]/page.tsx` — JSX construction moved outside
  the `try`/`catch`.

**New tests:**
- `src/lib/dishes/schema.test.ts`
- `src/components/domain/dish/dish-editor.test.tsx`
- `src/lib/dishes/dishes.integration.test.ts`
- `tests/e2e/recipe-golden-path.spec.ts`

**Unchanged from the prior session (verified working, not rewritten):**
`src/lib/dishes/{schema,queries,service,actions}.ts`; the rest of
`src/components/domain/dish/`; `src/components/ui/{checkbox,dialog}.tsx`;
`src/app/(app)/recipes/{page,new/page,[dishId]/page}.tsx`; the
`react-hook-form` dependency.

## Service operations (`src/lib/dishes/service.ts`)

`createDish`, `editDish` (optimistic-concurrency checked via
`baseVersionId === Dish.currentVersionId`, throws `ConflictError`
otherwise), `updateDishStage`/`archiveDish`/`restoreDish`, `duplicateDish`,
`deleteDish`. All are owner-scoped via `getOwnedDishOrThrow` /
`getOwnedDishDetailOrThrow` (`src/lib/dishes/queries.ts`), which query by
`(id, ownerId)` together and throw `NotFoundError` rather than fetching by
id and checking ownership after the fact — this also produces correct
not-found behavior for cross-user access, verified in the integration
tests below.

## Recipe and Part library behavior

`/recipes` and `/parts` share `DishLibraryView` (Server Component): a
"Show archived"/"Hide archived" toggle (`?archived=1`), a "Create" button,
and a grid of `DishCard`s (title, Stage badge, cuisine) or an empty state.
Page heading/copy differ per BRANDING.md §14 ("Recipes" vs "Reusable
Parts" / "Save the sauces, sides, staples...").

## Editor behavior

Single shared `DishEditor` (`kind="RECIPE"|"PART"`), React Hook Form-backed,
used by all four create/edit routes. Dynamic Section/Ingredient/Instruction
arrays with reorder (up/down buttons, no drag-and-drop). Client-side
submit strips blank rows and empty Sections, re-checks the minimum-content
rule before calling the Server Action (server remains the actual
authority). Unsaved-changes guard: a capture-phase `document` click
listener intercepts same-document in-app link clicks while the form is
dirty, showing a "Discard changes" (destructive) / "Keep editing" (primary)
dialog — browser-controlled exits (refresh, tab close, back/forward) are
deliberately left unguarded per §15.3.

## Creation behavior

Save on `/new` calls `createDish` → `V1.0`, `Dish.currentVersionId` set,
`currentTitle`/`currentStructuralSearchText` populated, fresh `lineageId`
minted for every Section/Ingredient/Instruction row.

## Immutable Version-edit behavior

**Superseded, in two layers — see `docs/SLICE_3_FOLLOWUP.md`'s Gate 2
classification rule, itself later revised by `docs/SLICE_5.md`'s
Version-trigger and Slice 5 image correction pass.** This section
describes Slice 3's original always-creates-a-Version behavior, which no
longer holds: a stable-metadata-only save (title, Stage, cuisine) or a
mutable-Version-metadata-only save (description, image) creates no
Version at all. Save on `/edit` calls `editDish`: creates a new minor Version within the
current major line (`majorVersion` unchanged, `minorVersion` incremented),
leaves the prior Version's rows untouched, and updates
`Dish.currentVersionId`/`currentTitle`/`currentStructuralSearchText`/Stage
in the same transaction. A row's `lineageId` is carried forward when the
editor supplied one (loaded via `dishToFormValues`, which preserves each
row's real `lineageId`) and freshly minted for a newly-added row — verified
directly in the integration tests. Stale `baseVersionId` (another edit
already moved `currentVersionId` forward) throws `ConflictError`.

## Archive and restore behavior

`archiveDish`/`restoreDish` only ever update `Dish.stage`/`archivedAt` —
never create a Version. Restoring is limited to
`restorableStageValues` (excludes `ARCHIVED`) at the Zod-schema layer,
before it would ever reach the service.

## Duplication behavior

`duplicateDish` creates a fully independent Dish + `V1.0` from a source
Version's content (current Version by default), with fresh `lineageId`s
throughout, `sourceKind="DUPLICATE"` plus `sourceDishId`/
`sourceDishVersionLabel`/`sourceTitle` snapshot fields, and the source's
Stage copied over. Title becomes `"Copy of {source title}"`.

## Authorization protections

Every service function resolves the target Dish via an owner-scoped query
and throws `NotFoundError` on any cross-user access attempt (never an
`AuthorizationError` that would leak existence) — verified for edit,
archive, restore, duplicate, and delete in the integration tests.

## Validation behavior

`dishContentSchema` (Zod) plus `removeEmptySections`/`hasMinimumContent`
enforce: non-blank title, valid Stage, and at least one meaningful
Ingredient or Instruction surviving empty-Section removal. Enforced in the
editor (client-side, before submit) and in `service.ts`'s
`sanitizedSectionsOrThrow` (server-side, the actual authority).

## Tests and commands run this session

- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec next build` — clean, all 8 new routes compile and render.
- `pnpm exec vitest run src/lib/dishes/schema.test.ts` — 7 tests, unit.
- `pnpm exec vitest run src/components/domain/dish/dish-editor.test.tsx` —
  3 tests, the unsaved-changes-guard dialog (discard / keep-editing /
  clean-form-passthrough cases).
- `pnpm test:integration src/lib/dishes` — 14 tests against local Docker
  Postgres: `createDish` (V1.0, lineage minting, minimum-content
  rejection), `editDish` (minor bump, lineage carry-forward vs. fresh
  minting, `ConflictError` on stale `baseVersionId`, cross-user
  `NotFoundError`), archive/restore (no new Version, schema-level
  ARCHIVED-restore rejection, cross-user `NotFoundError`), `duplicateDish`
  (fresh lineage, source snapshot fields, cross-user `NotFoundError`),
  `deleteDish` (cascade removes Sections/Ingredients, `ShareLink`
  revocation + `DirectShare` cancellation verified with directly-inserted
  rows, cross-user `NotFoundError`).
- `pnpm exec playwright test tests/e2e/recipe-golden-path.spec.ts
  --project=chromium` — 1 test: create (one ingredient, no instruction,
  per §8.3) → view → edit (add instruction) → archive (confirms hidden
  from default library view) → restore → duplicate (confirms "Copy of ..."
  title and an independent URL) → delete the duplicate.
- `pnpm exec prisma format` / `pnpm exec prisma validate` — clean, no diff
  to `prisma/schema.prisma` (confirmed via `git status`).
- `pnpm db:scan-migrations` — OK, no unallowed removal across 5 migration
  files.
- `pnpm db:verify:local` — OK, all 15 protected constraints and 7 protected
  indexes present.
- `pnpm run check` (format:check → lint → typecheck → `vitest run` →
  `next build`) — clean: 17 test files / 58 tests passed, build succeeded.

## Schema or migration changes

None. Slice 2's schema already covered Slice 3 in full, as anticipated by
the Build Plan. `prisma/schema.prisma` is byte-identical to before this
session (confirmed via `prisma format` + `git status`).

## Deviations / bugs fixed / flagged for review

**Two real bugs existed in code the paused session had marked "believed
correct, not yet build/test-verified" — both are now fixed:**

1. **Server/Client boundary violation (found by the Playwright test, not by
   `tsc` or `next build`; neither type-checks nor build-time RSC analysis
   catches this — it's a runtime assertion).** `dishToFormValues` was
   defined and exported from `dish-editor.tsx`, a `"use client"` file. The
   `/edit` Server Component pages called it directly, which is invalid:
   once a file is marked `"use client"`, none of its exports — including
   plain, side-effect-free functions — can be invoked from a Server
   Component, even via re-export from another file. Fixed by extracting
   `dishToFormValues`, `blankDishFormValues`, and the `DishFormValues` type
   into a new non-client module, `dish-form-values.ts`; the edit pages now
   import from there directly, and `dish-editor.tsx` imports
   `blankDishFormValues`/`DishFormValues` from it for its own internal use.
   This is the reason the manual-review checklist below explicitly calls
   out exercising both edit routes in a browser, not just relying on
   `next build`.
2. **Two `eslint-config-next` React Compiler rule violations**, both in
   code carried over from the prior session and never linted before this
   run: (a) all four `[dishId]` route pages (both pre-existing and newly
   added this session) constructed JSX lexically inside a `try`/`catch`
   around the data-fetch call (`react-hooks/error-boundaries` — JSX
   construction is lazy and a `try`/`catch` around it doesn't actually
   catch rendering errors); fixed by hoisting the fetch into a `let` +
   `try`/`catch` that either assigns the result or throws/`notFound()`s,
   then returning the JSX afterward, outside the `try` block. (b)
   `use-unsaved-changes-guard.ts` assigned to `ref.current` directly during
   render (`react-hooks/refs`); fixed by moving that assignment into a
   `useEffect`. Neither changes observable behavior — the click listener
   still reads the latest `isDirty` value by the time a user click can
   fire, since effects run after the render commits.

The partial report's known-deviations were re-confirmed and still apply:
cuisine/Makes/prep-cook-time/difficulty are included as plain optional
fields at creation, flagged for owner confirmation that this reading of
`PRODUCT_SPEC.md` §8.4 is correct; Version notes and the small-update/new-
major-Version choice are deliberately absent (Slice 4 scope).

## Manual-review checklist

- [ ] Confirm cuisine/Makes/prep-cook-time/difficulty as Slice-3 creation
      fields is the intended reading of `PRODUCT_SPEC.md` §8.4 (see
      "Deviations" above).
- [ ] In a browser, exercise both `/recipes/[id]/edit` and
      `/parts/[id]/edit` at least once each — this is exactly the route
      shape where the server/client boundary bug above was hiding, and
      `next build`'s static analysis did not catch it.
- [ ] Create a Recipe with only an unnamed default Section and confirm the
      Section heading stays hidden (§9.1).
- [ ] Attempt to leave the editor via in-app navigation with unsaved
      changes (modal should appear) and via a hard refresh (should be
      allowed to lose changes, no browser prompt, per §15.3).
- [ ] Spot-check the Duplicate and Delete confirmation dialog copy against
      §17.2/§18.3's wording expectations.
- [ ] Confirm keyboard-only operation of Add/Remove/Move-up/Move-down
      controls in the Section/Ingredient/Instruction subforms.

## Proposed next milestone

**Slice 4 — Immutable Version history, historical majors, Version notes,
and comparison** (`docs/BUILD_PLAN.md`), starting from Review Gate 2 (a
design-direction review of the editor/detail-page pattern established in
this slice, since every later domain screen extends it) if that gate has
not already been held.
