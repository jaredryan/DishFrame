# Slice 6 (post-gate) — Multiplier, unified ordering, Create Part/Convert Section, inline Part rendering, propagation, two-phase deletion

**Status: complete, including a focused correction pass.** Review Gate 3's
settled decisions are implemented end to end: schema, domain services,
Server Actions, editor/detail UI, propagation UI, two-phase Part-deletion
UI, the compare-page PartLink diff group, and automated test coverage. A
subsequent correction pass (see "Correction pass" below) aligned four
owner-reviewed product decisions and closed one discovered rendering gap.
`pnpm run verify:feature` (format, lint, typecheck, build, frontend unit/
component tests, `db:verify:local`, `db:scan-migrations`, backend
integration tests) was run once as this pass's completion check.

## Completed across both passes

**Schema** (`prisma/schema.prisma` + migration `20260727060000_part_link_multiplier`):
`PartLink.multiplier Decimal(8,4) @default(1)` + a `CHECK (multiplier > 0)`
constraint. The migration was hand-authored, then verified this pass
against a real `prisma migrate dev --create-only` diff (see "Migration
verified" below), applied to local Postgres, and the Prisma client
regenerated.

**Unified ordering**: `position: number` on both `SectionInput` and
`PartLinkInput` (`dishes/schema.ts`) — one shared top-level ordering
sequence for Sections and top-level linked Parts. `sortByPosition` is the
one shared sort; `insertSections`/`insertPartLinks` write from it;
`diffVersionContent` compares by `position`, not array index. `DishEditor`
merges both into one rendered/draggable sequence under one `DndContext`.
Section-nested PartLinks keep their own independent position scheme.

**Duplicate/target validation**: `findDuplicatePartTargets` (direct links
only, top-level + Section-nested) rejects a second direct link to the same
Part. `assertValidPartLinkTargets` (`sections/service.ts`) rejects a Recipe
as a target and a Version that doesn't belong to the supplied target Part.

**Multiplier**: validated `> 0`; composed into detach
(`resolvePartVersionForDetach` scales localized quantities), propagation
(carried through unchanged), comparison (`partLinkContentSignature`), and
display (`scaleFactor × multiplier` before `scaledIngredientDisplay`).

**Linked-Part presentation**: `resolvePartLinkTree`/`resolvePartLinkTrees`
(`sections/service.ts`) recursively resolve a PartLink occurrence's nested
content server-side (cycle-safe via a visited-set + `MAX_PART_LINK_TREE_DEPTH`
cap). `PartLinkTreeView` renders it inline with nesting indent on both the
current- and historical-Version detail pages, and (correction pass) also for
a `MATERIALIZED` occurrence (see "Correction pass" below). The editor's
`PartLinkFields` fetches and renders the pinned content inline by default —
no expand action required (corrected this pass; see below) — with the
multiplier editable behind an explicit "Link settings" action.

**Create Part / Convert Section to Part**: `CreatePartDialog` and
`ConvertSectionToPartDialog` persist the new Part via the ordinary
`createDish("PART", …)` and only touch the parent's local draft — the
parent Version is only created by the parent's own normal Save.

**Propagation UI** (`PartUsagePanel`, PRODUCT_SPEC.md §72.4/§72.5):
"Update everywhere" (all out-of-date current usages) and "Choose Recipes
and Parts to update" (a checkbox picker) both call `propagatePartUpdate`.
Corrected this pass (see below): the direct-duplicate invariant means a
given Part is directly linked at most once per parent Version, so each
`PartUsage` is exactly one affected parent — one row, one checkbox, no
occurrence-level grouping within a parent. Per-parent outcomes (updated /
skipped with reason / failed with reason) render inline after the call.
`queries.ts`'s `PartUsage` still carries `lineageId`, kept only as the
stable internal identifier the service layer targets.

**Two-phase Part deletion UI** (`PartUsageResolutionDialog`,
PRODUCT_SPEC.md §74): a new `PartHasLiveUsagesError` (`errors.ts`, a
`ValidationError` subtype) lets `deleteDish`'s Server Action distinguish
"blocked by live usages" from any other failure and return
`code: "PART_HAS_LIVE_USAGES"`. `DishDetailActions` catches that code and
opens the resolution dialog, which lists current usages (re-fetched via a
new `getCurrentPartUsages` action after every resolution — no page
navigation needed) and lets the user Detach/Replace/Remove each occurrence
via `resolvePartUsageOccurrence`, one at a time, in any order, across
separate visits. Corrected this pass (see below): each resolution now
requires the same explicit minor/major Version choice as any other cooking
change, prompted after picking Detach/Replace/Remove and before the call
fires. Once none remain, a "Delete permanently" button retries `deleteDish`.
Replace reuses `PartAttachPicker` (given a new optional `triggerLabel` prop
so its button reads "Replace with…" here instead of "Attach a Part").

**Compare-page PartLink diff group** (`compare.ts`, PRODUCT_SPEC.md §94):
`VersionCompareInput` gained a top-level `partLinks: PartLinkInput[]`
field; `partLinkChanges`/`flattenPartLinks` flatten top-level + Section-
nested occurrences (matched by `lineageId`, same pattern as
`ingredientChanges`) into added/removed/changed (`retargeted`/
`multiplierChanged`, independently flagged since either can happen alone)
/reordered. `compare.ts` stays DB-agnostic — it never resolves a
`targetDishId` into a title. Both compare pages
(`recipes|parts/[dishId]/compare/page.tsx`) resolve display labels once via
`resolvePartLinkDisplayInfo` for every distinct occurrence the diff
touches, falling back to "Unknown Part" for a Part deleted since (caught
specifically as `NotFoundError`, not a blanket catch). `VersionCompareView`
renders the new "Linked Parts" group from a `partLinkLabels` map it never
resolves itself.

## Completed this pass (follow-up to the pre-gate report)

- **Migration verified**: hand-authored `part_link_multiplier` migration
  checked against a fresh `prisma migrate dev --create-only` diff (the
  known shadow-diff trap fired again — spurious `DROP CONSTRAINT`/`DROP
  INDEX` for raw-SQL-managed objects — discarded; the one genuine
  statement matched the hand-authored file exactly). Applied to local
  Postgres; `prisma generate` run; `db:verify:local` confirms all 15
  protected constraints + 7 protected indexes intact.
- **Tests written** (previously the one deviation from policy — now
  closed): `dishes/schema.test.ts` (`findDuplicatePartTargets`,
  `sortByPosition`, multiplier validation, `diffVersionContent`
  position/multiplier-change detection), `dishes/compare.test.ts` (the new
  partLinks diff group: added/removed/retargeted/multiplier-changed/
  reordered, top-level and Section-nested), `dishes/dishes.integration.test.ts`
  (unified position round-trip through create/edit/duplicate/promote,
  duplicate-target rejection, `propagatePartUpdate` updated/skipped/failed/
  partial-success/ownership, `resolvePartUsageOccurrence` all three
  resolutions, `deletePart` Phase 2 live-usage abort + historical
  materialization), `sections/sections.integration.test.ts`
  (`assertValidPartLinkTargets`, `resolvePartVersionForDetach` multiplier
  scaling, `resolvePartLinkTree` nesting/cycle-guard/missing-target). Three
  pre-existing tests referencing the removed `promoteLocalContentToPart`/
  `saveContentAsNewPart` primitives were deleted (no service-level
  equivalent exists under the current UI-only Create-Part architecture).
- **Infra fix**: `vitest.integration.config.mts` gained
  `fileParallelism: false`. Discovered while chasing three integration-test
  failures that reproduced deterministically under `verify:feature` but
  passed when a file was run in isolation — genuine Postgres SERIALIZABLE
  write conflicts between concurrently-running test *files* (same class of
  shared-local-Postgres parallelism flake `verify:e2e`'s single-worker
  Playwright config already exists to avoid), not a bug in the new tests.
  Confirmed by running the full suite with `--no-file-parallelism`: all 158
  tests passed. Two other failures in the same run were genuine test bugs
  (a setup call passed `undefined` instead of `"MINOR"` as `editDish`'s
  version-choice, tripping the real "choose minor or major" policy) and
  were fixed directly.

## Known issues to flag prominently

- **Cosmetic Next.js diagnostic**: client-to-client callback props
  (`onRemove`, `onDetach`, `onCreated`, `onOpenChange`, etc., across both
  older and newly-added components) trigger a "props must be
  serializable... rename to `xAction`" warning from the Next.js TS plugin —
  a known false-positive for props passed between two "use client"
  components (not a Server→Client boundary). Left as-is for naming
  consistency with the rest of the codebase.
- **Type duplication**: `PartUsageResolutionKind` (`dishes/service.ts`) and
  `PartUsageResolutionValue` (`dishes/schema.ts`) are the same string union
  under two names — harmless (structural typing), worth reconciling later.

## Judgment calls made without a blocking question

- REPLACE resolution (Phase 1 deletion) preserves the occurrence's existing
  multiplier rather than resetting it to 1.
- Materialized snapshots store raw (unscaled) content; the multiplier
  column is left as historical record rather than baked into the JSON —
  reaffirmed and given a rendering path this pass (see below).
- The delete-resolution dialog re-fetches usages after every single
  resolution (rather than trusting optimistic local state) — correctness
  over one extra round-trip, since a stale list could show an
  already-resolved occurrence as still actionable.

Two judgment calls from the original pass were corrected this pass (owner
review found both wrong against product intent) — see "Correction pass"
below: deletion resolutions no longer auto-bump MINOR, and propagation no
longer assumes duplicate direct occurrences are possible within one parent.

## Review Gate checklist

- Editor: unified drag-reorder across Sections and top-level Parts; Create
  Part; Convert Section to Part; a Section defaults to a concise formatted
  view with an explicit Edit action; a linked Part's pinned content renders
  inline by default (no expand click); edit its multiplier via "Link
  settings"; detach with multiplier applied.
- Detail pages (current + historical Version): linked Parts render inline,
  nested Parts indent correctly, multiplier composes with temporary scale;
  a historical Version with a deleted-since Part shows its materialized
  snapshot inline (no "Open Part" link, no live navigation).
- Part detail page: "Update everywhere" and "Choose Recipes and Parts to
  update" against a Part with at least one out-of-date current usage;
  confirm one row per affected parent and correct outcomes.
- Attempt to delete a Part with live usages: confirm the resolution dialog
  opens, each Detach/Replace/Remove prompts the minor/major choice, works,
  and updates the list, and delete succeeds once the list is empty.
- Compare page: attach/retarget/change-multiplier/reorder a linked Part
  across two Versions and confirm the "Linked Parts" group renders
  correctly, including a Section-nested occurrence and a Part deleted since
  (falls back to "Unknown Part").
- Confirm the judgment calls above against product intent.

## Correction pass (this pass)

Four owner-reviewed corrections against the review-gate implementation
above:

- **Deletion resolutions require the Version choice** (§1): Detach/Replace/
  Remove (`resolvePartUsageOccurrence`) now takes a required
  `versionChoice: "MINOR" | "MAJOR"`, reusing `editDish`'s own
  `nextVersionNumbers`/`withVersionAllocation` machinery — never an
  automatic MINOR. `PartUsageResolutionDialog` prompts for the choice (a
  second, nested Dialog, same MINOR/MAJOR copy as the editor's own choice
  dialog) between picking a resolution and the actual call. Each parent is
  still its own independent transaction/call, so one parent's failure
  never touches another's completed resolution.
- **Propagation reflects the direct-duplicate invariant** (§2):
  `PropagationSelection.lineageIds: string[]` → `lineageId: string` — a
  stable Part can be directly linked at most once per parent Version, so
  there's exactly one direct occurrence per parent to target, never a
  multi-select within one parent. `PartUsagePanel` dropped its
  container→occurrence grouping; one row, one checkbox, per affected
  parent.
- **Create Part / Convert Section to Part test coverage** (§3):
  `create-part-dialog.test.tsx` and `convert-section-to-part-dialog.test.tsx`
  (new) cover the actual embedded-flow architecture — one standalone Part
  created via the ordinary `createDish`, one field-array insert into the
  parent's local draft, no parent save, no navigation. A `dish-editor.test.tsx`
  addition covers the same-position Section→PartLink swap end to end.
- **Linked Parts read fully inline by default** (§4): `PartLinkFields`
  fetches and renders the pinned content unconditionally (dropped the
  expand/collapse gate entirely); the multiplier is the only thing still
  behind an explicit action ("Link settings"). `SectionFields` now defaults
  to a concise formatted read view (name/guidance note plain text,
  ingredients/instructions as read-only lines) with an explicit Edit
  action revealing the form fields — but only for a Section with existing
  saved content (has a `lineageId`); a brand-new, still-blank Section
  starts in edit mode, since there's nothing yet to view.

**Discovered gap, closed this pass**: a `MATERIALIZED` PartLink (Part
deleted while still historically referenced) had no rendering path
anywhere — `partLinkContentInclude` filters to `LIVE` only, so both
current- and historical-Version detail pages silently omitted one. Added
`resolveMaterializedPartLinkTreesForVersion`/`mergeLiveAndMaterializedTrees`
(`sections/service.ts`) as an additive query alongside the historical
Version pages' existing `LIVE`-only load (never touches the editing/
diffing/current-Version paths, which must never see a snapshot with a null
target); `PartLinkTree` gained a `kind: "LIVE" | "MATERIALIZED"`
discriminant and nullable `targetDishId`/`targetDishVersionId` (replacing
`majorVersion`/`minorVersion` with a single pre-formatted `versionLabel`,
since a materialized entry only has the frozen label string, not numbers).
`PartLinkTreeView` renders a materialized entry with the stored former name/
Version and a "Deleted since" marker in place of "Open Part" — no live
lookup, no actions. Verified by a new integration test
(`sections.integration.test.ts`) confirming the stored multiplier composes
correctly with the raw snapshot quantity at render time (never baked in).

**Verification**: targeted tests run while implementing; `pnpm run
verify:feature` run once as the completion check afterward — clean:
format/lint/typecheck/build all clean, frontend unit/component tests 217
passed (29 files), `db:verify:local`/`db:scan-migrations` clean, backend
integration tests 162 passed (8 files).

**Post-pass Playwright fix**: the owner's `verify:all` run surfaced one
failure — `recipe-golden-path.spec.ts`'s "golden path" test timed out
waiting for "Add instruction" on the edit page of an already-saved
recipe. Root cause: §4's Section view-first-by-default change means a
saved Section (has a `lineageId`) now opens collapsed, and the ingredient/
instruction fields (including "Add instruction") don't render until the
row's own "Edit" toggle is clicked — this spec predates that change and
clicked straight into the fields. Fixed by adding an explicit
`getByRole("button", { name: "Edit section 1" }).click()` before the
first field interaction, in both affected tests in that file (the second,
"ingredient controls..." test, had the same latent issue since it also
edits an already-saved recipe — the "1 did not run" in the reported
result is Playwright's serial-mode skip-after-failure, not a second
distinct bug). No other e2e spec touches an existing Dish's Section
fields. Not re-run here — Playwright stays owner-run.

## Design remediation pass (post-gate, following owner review)

A focused visual/interaction redesign of the Recipe/Part library, detail,
create/edit, and comparison surfaces — no new product behavior, no Slice 6B
work. Dashboard and public marketing pages untouched.

**Library**: `dishCardSelect`/`DishCardItem` gained `imageAssetId`. Grid
view (`dish-card.tsx`) is now image-led (private image via `/api/images`,
a restrained `ImageOff` placeholder otherwise), title+chips beneath.
`dish-list-row.tsx` → `dish-compact-card.tsx`: a genuinely compact,
image-free card (title, then Stage/cuisine/updated-date chips, wrapping
naturally); the view toggle's second mode is now labeled "Compact," not
"List," in a responsive 1–2 column grid.

**Detail page IA**: `dish-detail-view.tsx` now reads breadcrumbs → title/
stage/Version/actions → description → image → note → metadata chips
(servings/prep/cook/difficulty as `Badge`s) → Sections/Parts.
`DishDetailActions` is one prominent Edit button + an overflow
`DropdownMenu` (Version history, Compare versions, Duplicate, Archive/
Restore, Delete) — room left beside Edit for a future Cook action.
`VersionMetadataEditor`/`VersionNoteEditor` (the standalone "Edit photo &
description"/"Edit note" detail-page controls) are deleted; the historical
Version page (`versions/[versionId]/page.tsx`, both kinds) got the same
plain read-only description/image/note/chips treatment in their place,
keeping its own approved Version-specific header/nav (selector, promote,
"Current recipe/part details") unchanged.

**Consolidated editor**: `DishEditor` gained `note`/`defaultBatchQuantity`/
`defaultBatchUnit` fields (edit mode only), each still persisted through
their existing non-material actions (`updateVersionNote`/
`setDefaultBatchScale`) fired after a successful Save — never folded into
`createDish`/`editDish`'s own cooking-change classification, so metadata-
only vs. material-save semantics are unchanged. "Status" → "Recipe
stage"/"Part stage"; Cuisine now precedes Stage. `ScaledVersionView` lost
its editable "View for"/"Save as default"/"Reset to authored" panel — the
view page now derives its scale (and `dish-detail-view.tsx`'s "Makes N
servings" chip) directly from `defaultBatchQuantity ?? yieldQuantity`, no
client state. `StageBadge` ACTIVE now uses the primary/blue family
(`--primary` *is* `--brand-blue`) instead of a second green shade, so it
reads distinctly from PROVEN.

**Section/linked-Part cards**: `section-fields.tsx`'s header is now
drag-handle · live `Section N — Name` (name segment only once set) ·
actions (Convert to Part, Edit/Collapse, Remove); name/guidance-note
fields moved to a full-width area below, no longer indented under the
drag-handle column. `part-link-tree-view.tsx` was split into
`PartLinkTreeView` (header + content, used on detail pages) and an
exported `PartLinkTreeContent` (content only); nesting indent is now a
left border + padding, not an asymmetric `margin-left`; the title matches
Section heading typography (no more blue link-styled heading); Open Part
is an icon + the app's styled `Tooltip`, not a native `title`.
`part-link-fields.tsx` (the editor) was rewritten to the same pattern:
Section-style header with Part/Version/multiplier chips and icon actions
(Open Part, Detach, Remove), description below, then a compact "Scaling"
row (input + Reset + Apply) replacing the old "Link settings" toggle —
Apply commits the draft multiplier to the parent form only (never
persists), Reset restores the value the editing session opened with, and
content renders via `PartLinkTreeContent` directly (no more redundant
nested header repeating name/Version/multiplier/Open Part).
`resolvePartLinkDisplayInfo` gained `description` to support the new
description line.

**Image-preview fix**: `ImageField` now previews a freshly selected `File`
via a local `URL.createObjectURL`, not `/api/images/[assetId]` — that
route only authorizes a read once some saved `DishVersion` actually
references the asset, which is never true yet for an unsaved selection
(root cause: the deleted `VersionMetadataEditor` used to mask this by
persisting immediately). Object URLs are revoked on replace/remove/
unmount.

**Version comparison**: `compare.ts`'s `PartLinkSnapshot` gained nullable
`targetDishId`/`targetDishVersionId` plus optional `materializedTitle`/
`materializedVersionLabel`; `VersionCompareInput` gained
`materializedPartLinks`, populated by a new
`listMaterializedPartLinkSnapshots` (sections/service.ts) and merged into
the same `flattenPartLinks` diff — a historical Version's deleted-Part
occurrence now appears in comparison using its preserved former identity,
never silently dropped and never "Unknown Part" (that fallback stays
reserved for a genuinely-unresolvable LIVE entry), and never exposes the
`MATERIALIZED` term. `VersionCompareView` also gained semantic (not
color-only — text labels retained) treatments: Added in
`text-brand-green`, Removed in `text-destructive`, Changed/Reordered in a
neutral accent.

**Tests**: added `image-field.test.tsx` (local-preview + revoke + already-
persisted-asset behavior), `part-link-fields.test.tsx` (Scaling Apply
commits to the parent draft and updates the header chip; Reset restores
the session-opening value), two `compare.test.ts` cases (a materialized
occurrence compares using its preserved identity; an unchanged
materialized occurrence on both sides reports no change), and a
`dish-editor.test.tsx` case (a Note-only change calls `updateVersionNote`
without tripping the minor/major dialog). Updated (not expanded) existing
presentation-coupled assertions that this pass's layout changes broke:
`dish-library-display.test.tsx` (Grid/Compact labels),
`dish-editor.test.tsx` (Convert-to-Part's new icon-button aria-label, the
collapsed-Section text match), `convert-section-to-part-dialog.test.tsx`
(same aria-label). No broad presentation/snapshot coverage added, per this
pass's testing policy.

**Verification**: `pnpm run verify:feature` run once as the completion
check — clean: format/lint/typecheck/build all clean, frontend unit/
component tests 235 passed (32 files, up from 217/29), `db:verify:local`/
`db:scan-migrations` clean, backend integration tests 162 passed (8
files, unchanged — no domain/integration coverage touched or needed).

## Owner intervention recommendation

**Focused manual review** of this pass's presentation changes — none of
it has had a browser walkthrough yet, and it touches nearly every Recipe/
Part surface:

- Library grid image-led cards + the renamed Compact view, at mobile and
  desktop widths.
- Detail-page reading order, the overflow-menu actions (including that
  Archive/Restore/Duplicate/Delete dialogs still open correctly from
  inside the `DropdownMenu`), and the historical Version page's read-only
  description/image/note.
- The consolidated editor: Note and Default serving size fields, and that
  a Default serving edit alone doesn't trip the minor/major dialog.
- Section header layout and the Convert-to-Part icon action; the
  linked-Part card's Scaling row (Apply/Reset) and its inline content.
- Version comparison's new color treatments in both light and dark theme,
  and a real deleted-Part-in-history scenario if one exists in QA seed
  data (`scripts/qa-seed/materialized-fixture.ts`).

Also still outstanding from the prior pass: run `pnpm run verify:all`
(Playwright/E2E) before considering Slice 6 fully closed — this pass's
`recipe-golden-path.spec.ts` fix was not re-verified here, and this pass's
own layout changes (the Section header restructure in particular) may
affect it further; re-check that spec specifically.
