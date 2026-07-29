# Slice 6 (post-gate) — Multiplier, unified ordering, Create Part/Convert Section, inline Part rendering, propagation, two-phase deletion

**Status: complete.** Review Gate 3's settled decisions are implemented end
to end: schema, domain services, Server Actions, editor/detail UI,
propagation UI, two-phase Part-deletion UI, the compare-page PartLink diff
group, and automated test coverage. `pnpm run verify:feature` (format,
lint, typecheck, build, frontend unit/component tests, `db:verify:local`,
`db:scan-migrations`, backend integration tests) passes clean — 211
frontend tests, 158 backend integration tests.

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
current- and historical-Version detail pages. The editor's `PartLinkFields`
is view-first (collapsed by default, live title/version/multiplier header),
fetching the tree lazily via `getPartLinkPreview`.

**Create Part / Convert Section to Part**: `CreatePartDialog` and
`ConvertSectionToPartDialog` persist the new Part via the ordinary
`createDish("PART", …)` and only touch the parent's local draft — the
parent Version is only created by the parent's own normal Save.

**Propagation UI** (`PartUsagePanel`, PRODUCT_SPEC.md §72.4/§72.5):
"Update everywhere" (all out-of-date current usages) and "Choose Recipes
and Parts to update" (a checkbox picker, one row per occurrence — the same
Part linked twice in one container can be updated independently) both call
`propagatePartUpdate`, grouping usages by `containerDishId` and targeting
each occurrence by its `lineageId`. Per-occurrence outcomes (updated /
skipped with reason / failed with reason) render inline after the call.
`queries.ts`'s `PartUsage` now also carries `lineageId` (previously only
the PartLink row's own `id`).

**Two-phase Part deletion UI** (`PartUsageResolutionDialog`,
PRODUCT_SPEC.md §74): a new `PartHasLiveUsagesError` (`errors.ts`, a
`ValidationError` subtype) lets `deleteDish`'s Server Action distinguish
"blocked by live usages" from any other failure and return
`code: "PART_HAS_LIVE_USAGES"`. `DishDetailActions` catches that code and
opens the resolution dialog, which lists current usages (re-fetched via a
new `getCurrentPartUsages` action after every resolution — no page
navigation needed) and lets the user Detach/Replace/Remove each occurrence
via `resolvePartUsageOccurrence`, one at a time, in any order, across
separate visits. Once none remain, a "Delete permanently" button retries
`deleteDish`. Replace reuses `PartAttachPicker` (given a new optional
`triggerLabel` prop so its button reads "Replace with…" here instead of
"Attach a Part").

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
- Phase-1 occurrence resolutions (detach/replace/remove) always bump MINOR
  automatically, no interactive minor/major choice.
- Materialized snapshots store raw (unscaled) content; the multiplier
  column is left as historical record rather than baked into the JSON.
- Propagation's "Choose Recipes and Parts to update" picker operates at
  occurrence granularity (one row per current usage, grouped visually by
  container) rather than whole-container granularity, so the same Part
  linked twice in one item can be selectively updated.
- The delete-resolution dialog re-fetches usages after every single
  resolution (rather than trusting optimistic local state) — correctness
  over one extra round-trip, since a stale list could show an
  already-resolved occurrence as still actionable.

## Review Gate checklist

- Editor: unified drag-reorder across Sections and top-level Parts; Create
  Part; Convert Section to Part; expand a linked Part inline; edit its
  multiplier; detach with multiplier applied.
- Detail pages (current + historical Version): linked Parts render inline,
  nested Parts indent correctly, multiplier composes with temporary scale.
- Part detail page: "Update everywhere" and "Choose Recipes and Parts to
  update" against a Part with at least one out-of-date current usage;
  confirm per-occurrence outcomes render correctly.
- Attempt to delete a Part with live usages: confirm the resolution dialog
  opens, each Detach/Replace/Remove works and updates the list, and delete
  succeeds once the list is empty.
- Compare page: attach/retarget/change-multiplier/reorder a linked Part
  across two Versions and confirm the "Linked Parts" group renders
  correctly, including a Section-nested occurrence and a Part deleted since
  (falls back to "Unknown Part").
- Confirm the judgment calls above against product intent.

## Owner intervention recommendation

**Focused manual review** of the three newly-built interactive flows this
pass added (propagation, two-phase deletion, compare-page PartLink diff) —
all three are exercised by integration tests and pass `verify:feature`,
but none have had a browser walkthrough yet, and each is a multi-step user
workflow (per the "manual review" policy's "critical workflows" and
"meaningful design pass" criteria). Use the Review Gate checklist above.
Run `pnpm run verify:all` (Playwright/E2E is not part of the self-run
`verify:feature`) before considering Slice 6 fully closed.
