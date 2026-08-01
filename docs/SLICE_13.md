# Slice 13 — USDA FoodData Central nutrition lookup

Closes the FDC-related bullets in PRODUCT_SPEC.md §54.4/§54.6 and the
"Nutrition" group in §65.

## Discovered prerequisite gap (original pass)

Slice 3/5 modeled nutrition columns on `DishVersion` (Gate 1) but never wired
them into the editable content pipeline — `DishContentInput`, the editor UI,
and `createDish`/`editDish`/`duplicateDish`/`promoteHistoricalVersion` had no
nutrition fields at all. This pass built the full manual Tier 1 foundation
(§54.1/§54.2) first, then layered FDC lookup on top.

## Metadata-classification correction (this pass)

The original pass classified nutrition (and yield/prep time/cook time/
difficulty) as an auto-minor-Version-creating field. A follow-up correction
pass settled the actual product rule and this codebase now implements it:
**Version ownership and Version creation are separate concerns.** Only
material preparation content — Ingredients/Instructions/Sections-and-
ordering/linked Parts-and-multipliers — ever creates a Version
(PRODUCT_SPEC.md §7.2/§13.2a). Description, image, yield, prep time, cook
time, difficulty, and the full nutrition shape are all **Version-scoped but
mutable metadata**: each belongs to one specific Version, but editing any of
them, alone, updates that exact Version's row in place — current or a
deliberately selected historical one — and never creates a new Version.

`editDish`'s classification (`service.ts`) now has exactly two buckets:
`versionMetadataChanged` (everything above, in place via the extended
`applyVersionMetadataUpdate`) and `materialContentChanged`
(`cookingChanged || sectionOrganizationChanged`, the only Version-creating
path, unchanged from before). A save combining both creates the appropriate
new Version through the material-content flow, carrying every submitted
metadata value; the prior Version's own row is never touched. Editing a
deliberately selected historical Version's metadata updates only that row —
never `Dish.currentVersionId`, never any other Version.

`getDishScopedVersionMetaOrThrow` (queries.ts) and `applyVersionMetadataUpdate`
(service.ts) were extended from description/image-only to the full metadata
set; `updateVersionMetadata`'s own public signature is unchanged (still
description/image only — it passes the version's existing values through
unchanged for every other field). ARCHITECTURE_PROPOSAL.md's Correction 5/
§F.10 and PRODUCT_SPEC.md §7.2/§13.2a are updated in place to state the
current rule, with the prior (now-superseded) classification kept as a
labeled historical note, matching this repo's existing correction-pass
convention.

## Attribution integrity (this pass)

`nutritionSourceProvider` is now a closed enum (`nutritionSourceProviderValues
= ["USDA_FDC"]`, `schema.ts`) — renamed from the original pass's free-form
`"fdc"` string. `normalizeNutritionOrThrow` (service.ts) enforces, with a
friendly `ValidationError`, independent of the Zod schema (never trusting a
direct service call to have gone through `dishContentSchema.parse`):

- no provider ⇒ id and name must both be absent;
- `USDA_FDC` ⇒ both id and name required, non-empty;
- any other provider value is rejected outright.

Detach clears all three fields together (already true of the editor's
`detachSource` — now also the authoritative, enforced invariant).

## Cooking Session yield safety (this pass)

Investigated whether making yield mutable in place could retroactively
change a Cooking Session's recorded meaning. Finding: `/cook/[sessionId]`
already gates every live read of `version.yieldQuantity`/`yieldUnit` behind
`state === "IN_PROGRESS"` — a completed/ended session never reads live yield
at all, and everything it does display (checklist quantities, scale factors)
already comes from durable per-session/per-unit/per-item snapshots
(`CookingSessionUnit.scaleFactor`/`originalScaleFactor`,
`CookingSessionChecklistItem.baseQuantity`/`displayQuantity`/`displayUnit`).
The one remaining live read (an in-progress session's "Cook for X"/"add more
units" tooling) is legitimately forward-looking, not a redisplay of already-
recorded output. No schema change was needed; a comment was added at the
gate documenting why it matters now, and a new integration test
(`cooking.integration.test.ts`) proves an in-place yield edit leaves an
existing session's persisted rows byte-for-byte unchanged.

## Nutrition detail-page presentation (this pass)

New shared `nutrition-summary.tsx` (`NutritionSummary` +
`toNutritionSummaryData`) renders primary nutrients, basis text, an expandable
More-nutrients `<details>`, and (only when a source is set) attribution plus
"USDA FoodData Central values may contain errors or change over time."
Wired into `dish-detail-view.tsx` (current Version) and both
`versions/[versionId]/page.tsx` files (that exact historical Version's own
values, not the Dish's current one) — renders nothing when there's no
nutrition data at all.

## Schema/migration

No migration this pass — `nutritionSourceProvider`'s enum constraint is
Zod/service-level only, not a new column or constraint. (Original pass:
`DishVersion.nutritionSourceName`, migration
`20260801042823_slice_13_nutrition_source_name`, additive-only after
stripping the known spurious shadow-diff drops — still the only schema
change across both passes. `db:scan-migrations`/`db:verify:local` clean.)

## Tests changed

- `dishes.integration.test.ts`: 6 tests rewritten from "creates an automatic
  minor Version" to "updates in place" for yield/prep/cook/difficulty,
  historical-Version-only edit scope, and material-content-plus-title
  Version creation; one Section-organization test switched from a stale
  prep-time trigger to a genuine Section rename.
- `nutrition.integration.test.ts`: replaced the "nutrition-only edit creates
  a new Version" test with the opposite; added attach-in-place,
  attribution-integrity (partial/fabricated/unsupported-provider rejection,
  valid persistence, fully-manual validity), and historical-Version-only
  scope tests. All provider fixtures renamed `"fdc"` → `"USDA_FDC"`.
- `cooking.integration.test.ts`: new test proving an in-place yield edit
  never touches an existing session's persisted checklist/unit rows.
- `nutrition-summary.test.tsx` (new, 6): empty state, primary nutrients +
  basis, More-nutrients conditional display, USDA disclaimer only when
  sourced.
- `nutrition-fields.test.tsx`/`export-dto.test.ts`: provider fixture rename
  only, `"fdc"` → `"USDA_FDC"`.

## Targeted commands actually run

`vitest run` on every file listed above, plus
`dish-editor.test.tsx`/`schema.test.ts`/`fdc-client.test.ts`/
`actions.test.ts` (unaffected, reconfirmed green); `vitest run --config
vitest.integration.config.mts` for `dishes.integration.test.ts` (103 passed),
`nutrition.integration.test.ts` (16 passed), `cooking.integration.test.ts`
(19 passed), `constraints.integration.test.ts` (8 passed, unaffected). No
repo-wide `check`/`verify:*`/Playwright/`tsc --noEmit` — left to the owner's
fresh-session run.

## Limitations / owner review

- No barcode/UPC/camera behavior (Slice 14, out of scope here).
- No ingredient-level nutrition or Recipe-total aggregation from
  Ingredients/Parts — Version-level only, as scoped.
- FDC search has no debounce (explicit Search action instead) — unchanged
  from the original pass, still worth a UX look if live search is wanted.
- Detail-page nutrition presentation is intentionally compact (badges +
  one expandable panel) — flag if a more prominent treatment is wanted.

**Owner intervention recommendation: Brief sanity check.** After
verification passes: edit a saved Recipe's yield/nutrition alone and confirm
no new Version is created and the Version list is unchanged; edit a
historical Version's metadata and confirm only that Version changes; open a
Recipe/Part detail page and a historical Version page and confirm nutrition
displays correctly for each. No unresolved product/design questions — this
pass followed the settled correction directly.
