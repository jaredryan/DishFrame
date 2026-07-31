# Slice 6 (post-gate) — Multiplier, unified ordering, Create Part/Convert Section, inline Part rendering, propagation, two-phase deletion

**Status: complete, including a focused correction pass and two
post-gate design-remediation passes ("Design remediation pass" and,
final, "Slice 6A design-remediation pass" — see below).** Review Gate 3's
settled decisions are implemented end to end: schema, domain services,
Server Actions, editor/detail UI, propagation UI, two-phase Part-deletion
UI, the compare-page PartLink diff group, and automated test coverage. A
subsequent correction pass (see "Correction pass" below) aligned four
owner-reviewed product decisions and closed one discovered rendering gap.
`pnpm run verify:feature` (format, lint, typecheck, build, frontend unit/
component tests, `db:verify:local`, `db:scan-migrations`, backend
integration tests) was run once as each pass's completion check. Still
outstanding before Slice 6 is fully closed: `pnpm run verify:all`
(Playwright/E2E), owner-run — see the Slice 6A section's own note.

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

## Slice 6A design-remediation pass (final)

A second, owner-approved round of visual/interaction corrections following
a second browser review — no new product behavior beyond the Yield/
default-scale redesign below, no Slice 6B work. Dashboard and public
marketing pages untouched.

**Library**: `dish-library-view.tsx`'s Create action moved into
`recipes|parts/page.tsx`'s title row (top-right, aligned with the
heading); `dish-library-display.tsx` now puts Grid/Compact (left) and
Show archived (right) on one row beneath. `dish-card.tsx`: `Card`'s
default top padding (only cancelled by Tailwind when an `<img>` is a
*direct* child, which this card's aspect-ratio wrapper `<div>` never was)
is now overridden explicitly (`pt-0 gap-0`, `CardContent`'s own `pt-3`
now the only spacing) so the image reaches the card's top edge with no
strip above it; the placeholder swapped `ImageOff` for `UtensilsCrossed`.

**Icon actions everywhere**: `reorder-buttons.tsx` gained a shared
`TooltipIconButton` (icon + app `Tooltip`, no native `title`); `ItemToolbar`
(Section/Ingredient rows) now renders a chevron-up/down for Collapse/
Expand instead of "Edit"/"Collapse" text — **aria-label/tooltip changed
from "Edit X" to "Expand X"**, updated in every affected test.
`instruction-fields.tsx` dropped its collapse state entirely (kept step
number, textarea, Remove, drag) and its textarea now starts at `rows={1}`/
`min-h-8` (was `min-h-10` plus an implicit 2-row default) aligned with the
step marker. `ingredient-fields.tsx`'s header is now always visible
(drag handle · `Ingredient N — <live preview>` · chevron + Remove); the
old duplicated bottom "Preview" block is gone — the header *is* the
preview. `substitute-fields.tsx` and `image-field.tsx`'s Remove buttons
now use `TooltipIconButton` instead of native `title`.

**Shared Section/Part content shell**: new `content-card.tsx`
(`ContentCard` + `CONTENT_CARD_TITLE_CLASS`) is the one card shell for a
top-level Section or linked Part on any detail/historical-Version page —
`scaled-version-view.tsx` and `version-sections-view.tsx` (previously a
plain shadcn `Card`) and `part-link-tree-view.tsx` (previously a
differently-styled `bg-muted/20` div with `text-lg`-vs-`text-base` title
divergence) now render through it identically. `part-link-tree-view.tsx`
also swapped its "Open Part" `ExternalLink` icon for `Eye`/"View Part",
applied consistently in `part-link-fields.tsx` too.

**Detail-page responsive hero**: `dish-detail-view.tsx` renders two DOM
variants gated by `lg:hidden`/`hidden lg:*` (a deliberate choice over pure
CSS `order`, since Actions sits beside the title at `lg:` but after the
chips row on narrow — genuinely different structure, not just reflow) —
narrow: title+chips → actions → description/note → metadata chips →
image → content; wide: a `[1fr_320px]` grid, title+actions sharing a row,
chips beneath, image as the right column. Stage/Version/cuisine now
render as one chip row (Version was previously loose text) in both the
current and historical Version pages. `dish-detail-actions.tsx`'s Edit
is now an icon-only pencil with a `Edit Recipe`/`Edit Part` Tooltip; the
overflow `DropdownMenuContent` gained `w-56` so "Version history"/
"Compare versions" never wrap. Factual metadata chips (yield/prep/cook/
difficulty) gained restrained per-kind icons (`Soup`/`Clock`/`Flame`/
`Gauge`) instead of color, applied on both detail pages and both
historical Version pages — Stage stays the only chip carrying real color.

**Yield / default-scale redesign** (schema change): `Dish.
defaultBatchQuantity`/`defaultBatchUnit` (a separately-authored desired
quantity/unit) is retired in favor of `Dish.defaultScale Decimal?
@db.Decimal(8,4)` — a plain positive multiplier applied to the authored
yield, with a `CHECK (defaultScale IS NULL OR defaultScale > 0)`
constraint. Migration `20260730160000_dish_default_scale` (hand-authored,
following the `part_link_multiplier` migration's precedent) backfills
existing values into an equivalent multiplier wherever safely derivable
(current Version has a positive `yieldQuantity`, and the unit either
matches or was unset), applied to local Postgres and verified via
`db:verify:local`/`db:scan-migrations` (both clean). `dishService.
setDefaultScale`/`actions.ts#setDefaultScale`/`setDefaultScaleSchema`
replace `setDefaultBatchScale`. The editor's "Default serving size" two-
field row is now one "Yield" `Field` containing the authored quantity/unit
plus, when editing an existing Dish, a "Default scale" sub-block: a
narrow numeric input, a literal `×`, Reset, and a live computed result
(`${kindLabel} adjusted to ${authoredYield × scale} ${unit}`) — Reset
returns the *draft* to 1× and the input visibly shows "1" (not blank;
correction pass 2026-07-30), matching "Recipe adjusted to 3 servings" for
`2 servings × 1.5`. `dish-detail-view.tsx`/
`scaled-version-view.tsx` derive the same scale factor from `defaultScale`
directly (no more `defaultBatchQuantity ?? yieldQuantity` fallback
arithmetic). Prep/cook time fields became a compact `[input] minutes` row
(label no longer says "(minutes)").

**Linked-Part actions**: `part-link-fields.tsx`'s header actions are now
ordered View Part (Eye) → Edit Part (Pencil, new — opens
`/parts/{id}/edit` in a new tab, standalone, never touches the parent's
pinned Version or draft) → Copy to Section (was "Detach into local
content"/`Unlink`; now `Copy` icon, aria-label "Copy to Section", Tooltip
spelling out what it does and swapping "Recipe"/"Part" by
`containerKind`, a new required prop threaded through both `DishEditor`'s
top-level usage and `SectionFields`'s nested usage) → chevron
(Expand/Collapse) → Remove. The underlying `resolvePartVersionForDetach`
call and its `onDetach` wiring are unchanged — only the label/icon/order.
**Collapsed-by-default editing**: `PartLinkFields` gained the same
`!lineageId` → starts-expanded rule `SectionFields` already used — an
already-saved occurrence now starts collapsed (header only: title, Part/
Version/multiplier chips, actions); a freshly attached/created one starts
expanded. The pinned-content fetch (`getPartLinkPreview`) now only runs
while expanded.

**Image upload normalization** (architecture change): the prior
client-direct-to-Blob signed-token flow (`@vercel/blob/client`'s `put()`,
issued via a Server Action) never gave the server a chance to touch the
uploaded bytes. Replaced with `POST /api/images/upload` (a plain Route
Handler, chosen over widening Server Actions' default 1 MB body limit
app-wide) → `lib/images/service.ts#uploadAndNormalizeImage` →
`lib/images/processing.ts#normalizeImageBuffer` (new `sharp` dependency,
the smallest fit — no existing image-processing library was present):
sniffs the real format from file bytes (never trusts client
`Content-Type`), `.rotate()` (EXIF auto-orient, then strips it), resizes
to `MAX_IMAGE_DIMENSION_PX` (2400px, longest edge, never upscaled), and
encodes WebP at `IMAGE_WEBP_QUALITY` (82) — all three centralized in
`lib/images/schema.ts` alongside the existing `MAX_IMAGE_BYTES`. The
server now does the actual `put()` to private Blob storage and creates
the `ImageAsset` row after a successful upload (previously reserved
before). `image-field.tsx` now `fetch()`s the route with `FormData`
instead of calling a Server Action + client `put()`; local-preview-via-
`URL.createObjectURL`, authorization (`assertImageAssetAttachable`), and
replace/remove cleanup (`deleteImageAssetIfOrphaned`) are all unchanged —
only how bytes reach storage changed. `sharp` pinned to `0.34.5` to match
the copy Next.js/`better-auth` already resolve as a peer dependency
(avoids two native `libvips` builds loading at once — a real, if
harmless, duplicate-class warning seen during the first build with an
unpinned `^0.35.3`). QA image seeding (`scripts/qa-seed/image-fixture.ts`)
is untouched — it calls Blob's server-side `put()` directly and was never
part of the client-upload path this pass changed.

**Tests**: `processing.test.ts` (WebP conversion, resize-down/no-upscale,
rejects a non-image buffer, using `sharp`-generated fixtures — no new
external asset); `image-field.test.tsx` updated for the `fetch`-based
flow; `part-link-fields.test.tsx` gained Copy-to-Section (invokes
`resolvePartVersionForDetach`, wires the result to `onDetach`) and Edit
Part (correct `href`/`target`) cases; `dish-editor.test.tsx` gained an
untouched-create-form minimum-content-error-absence case and default-
scale compute/Reset/persist-only-when-changed cases, and had its
"Edit X" → "Expand X" / linked-Part-starts-collapsed assertions updated
for the approved behavior changes above; `dishes.integration.test.ts`'s
`setDefaultBatchScale` describe block became `setDefaultScale` (same
ownership/persistence coverage, new field shape). No detailed layout/
CSS-class/icon-choice/tooltip-styling/action-ordering tests added, per
this pass's testing policy.

**Verification**: targeted tests run throughout; `pnpm run verify:feature`
run once as the completion check afterward — clean: format/lint/
typecheck/build all clean, frontend unit/component tests 244 passed (33
files, up from 235/32), `db:verify:local` (15 constraints/7 indexes) and
`db:scan-migrations` (9 migration files, including the new one) both
clean, backend integration tests 162 passed (8 files, unchanged pass
count — only the one `setDefaultScale` describe block's assertions
changed shape).

## Owner intervention recommendation

**Focused manual review** — this pass touches nearly every Recipe/Part
surface a second time, and none of the new interaction/layout changes
below have had a browser walkthrough yet:

- The responsive hero at real tablet-landscape/desktop widths (the exact
  `lg:` breakpoint chosen against actual container width, not just
  Chrome devtools presets) — confirm neither column ever reads cramped,
  and that Edit/overflow stay reachable beside the title.
- Library header (Create top-right, Grid/Compact + Show archived row) and
  the image-flush grid cards, especially an item with no photo.
- The Yield/Default-scale block: the computed result text at a few
  quantity/unit/scale combinations (including a non-numeric unit like
  "loaf"), and that Reset visibly clears the input rather than only
  resetting internal state.
- Section/Ingredient/Instruction rows: the new chevron icon reads clearly
  as Collapse vs. Expand without the removed text label, and the
  Ingredient header's live preview updates correctly while typing.
  Instruction textarea height/growth with a long step.
- Linked-Part header: action order and icons (View/Edit/Copy/chevron/
  Remove), Edit Part opening a genuinely separate tab/draft, and that an
  already-saved linked Part collapses by default while a newly-attached
  one doesn't.
- Image upload: a real photo through the new `/api/images/upload` route
  (not just the sharp-buffer unit tests) — confirm EXIF-rotated phone
  photos orient correctly and an oversized image visibly shrinks.

Also still outstanding (unchanged from the prior pass, not re-verified
here): `pnpm run verify:all` (Playwright/E2E) — this pass's Section/
Ingredient/linked-Part header restructuring and the "Edit X" → "Expand X"
label change are exactly the kind of change `recipe-golden-path.spec.ts`
already broke on once; re-check it and any other spec touching Section/
Ingredient controls or the image-upload flow specifically before
considering Slice 6 closed.
