# Slice 13 — USDA FoodData Central nutrition lookup

Closes the FDC-related bullets in PRODUCT_SPEC.md §54.4/§54.6 and the
"Nutrition" group in §65.

## Discovered prerequisite gap

Slice 3/5 modeled nutrition columns on `DishVersion` (Gate 1) but never wired
them into the editable content pipeline — `DishContentInput`, the editor UI,
and `createDish`/`editDish`/`duplicateDish`/`promoteHistoricalVersion` had no
nutrition fields at all, so there was no way to enter nutrition manually
anywhere in the app. Per owner decision, this pass built the full manual
Tier 1 foundation (§54.1/§54.2) first, then layered FDC lookup on top —
`compare.ts` and `importExport/export-dto.ts` already anticipated nutrition
(unused until now) and needed only the one new field below.

## Schema/migration

Added `DishVersion.nutritionSourceName` (`String?`) — the source food's own
description, for truthful attribution alongside `nutritionSourceProvider`/
`nutritionSourceId`. Migration
`20260801042823_slice_13_nutrition_source_name` — the generated shadow-diff
included the known spurious `DROP CONSTRAINT`/`DROP INDEX` statements against
protected raw-SQL objects (composite FKs, trigram indexes); stripped to the
single additive `ALTER TABLE`. `db:scan-migrations` and `db:verify:local`
both clean.

The pre-existing raw-SQL `nutrition_basis_consistency` CHECK constraint
(basis unset/`WHOLE` ⇒ quantity+unit both null; `PER_OUTPUT_UNIT` ⇒ both set,
quantity > 0) was already in the schema from Gate 1 but had never been
exercised by application code — `normalizeNutritionOrThrow` (`service.ts`)
now enforces it up front with a friendly `ValidationError`.

## Manual nutrition pipeline

- `schema.ts`: `nutritionBasisValues`, `recognizedMoreNutrientKeys`/
  `moreNutrientEntrySchema`, and 11 new fields on `dishContentSchema`
  (calories/protein/carbs/fat, basis + basisQuantity/basisUnit,
  moreNutrients, the three source-attribution fields).
- `service.ts`: nutrition is treated as an ordinary **non-cooking Version
  scalar** — exactly the yield/prep/cook/difficulty bucket
  (ARCHITECTURE_PROPOSAL.md Correction 5/§F.10) — never a second mutable
  exception alongside `versionNote`/description/image. A change (typed
  manually, applied from FDC, or a detach) triggers an automatic minor
  Version through `editDish`'s existing classification; `createDish`,
  `duplicateDish`, `promoteHistoricalVersion`, `propagateToOneContainer`, and
  `resolvePartUsageOccurrence` all read/copy the full nutrition column set.
- `dish-form-values.ts`/`dish-editor.tsx`: `NutritionFields`
  (`nutrition-fields.tsx`) renders calories/protein/carbs/fat, a basis
  selector (quantity/unit fields appear only for `PER_OUTPUT_UNIT`), and a
  `<details>` "More nutrients" panel — matches the existing expandable
  pattern in `session-review-form.tsx`.

## FDC lookup

- `src/lib/nutrition/fdc-client.ts` — server-only (`import "server-only"`),
  never reads `process.env` itself (the caller passes the key in), so it's
  trivially testable with a fake key. `searchFdcFoods`/`getFdcFoodDetail`
  shape USDA's raw response down to named fields only — no raw payload ever
  reaches the client. 8s request timeout via `AbortController`;
  `FdcTimeoutError`/`FdcRateLimitError` (429)/`FdcUpstreamError` (other
  non-ok)/`FdcShapeError` (malformed/incomplete) are distinct, mapped to
  friendly messages in `actions.ts`.
- Basis truthfulness: a Branded food with a declared `servingSize`/
  `servingSizeUnit` and `labelNutrients` uses that per-serving data;
  everything else (Foundation/SR Legacy, or a Branded food missing label
  data) falls back to `foodNutrients`, which USDA always reports per 100g —
  never presented as "per serving" when it isn't.
- kcal/kJ: prefers nutrient id 1008 (kcal); a food reporting only id 1062
  (kJ) is converted (÷4.184), never left null.
- More-nutrients whitelist is the exact §54.6 example list — fiber, sugar,
  sodium, saturated fat, cholesterol — nothing else ever surfaces, whether
  the source is FDC or manual entry (same 5 fields either way).
- `FDC_API_KEY` — added to `src/lib/env/server.ts` as optional, with
  `isFdcConfigured`. Missing key: `searchFdc`/`applyFdcResult` return a
  friendly error without ever calling `fdc-client.ts`; manual entry is
  completely unaffected either way.

## Editor behavior

Search/select/apply/detach are all **editor form-state only** — nothing
persists until the ordinary Save button runs `createDish`/`editDish`, same
as every other field. "Detach from source" (shown only when a source is set)
clears `nutritionSourceProvider`/`Id`/`Name` via `form.setValue`, preserving
values/basis; there is no separate `detachNutritionSource` server action —
Correction 5's "goes through the ordinary `createSmallUpdate` path... like
any other content edit" is satisfied by the existing Save flow once nutrition
sits in the non-cooking-scalar diff bucket. Imported values remain freely
editable in the same fields FDC populated.

## Tests added

- `src/lib/nutrition/fdc-client.test.ts` (12) — search/detail shaping,
  generic vs. Branded, kcal/kJ, per-serving vs. per-100g basis, whitelist
  filtering, malformed data, timeout/rate-limit/upstream errors. No network
  calls — `global.fetch` mocked.
- `src/lib/nutrition/actions.test.ts` (10) — auth required, missing-config
  fail-closed, error-message mapping, no key leakage.
- `src/components/domain/dish/nutrition-fields.test.tsx` (6) — manual entry,
  basis-conditional fields, FDC search→select→apply, search failure doesn't
  block manual entry, detach preserves values, More-nutrients edit.
- `src/lib/dishes/nutrition.integration.test.ts` (8) — persistence on
  create, `PER_OUTPUT_UNIT`-without-basis rejection, **a nutrition-only edit
  creates a new Version rather than mutating the saved row** (the detach/
  immutability case Correction 5 calls out as worth getting right), a
  metadata-only edit still doesn't allocate a Version, verbatim copy through
  `duplicateDish`/`promoteHistoricalVersion`.
- `export-dto.test.ts` — extended the existing poisoned-row test to assert
  `nutritionSourceName` propagates truthfully.
- Existing `dish-editor.test.tsx` (38) and `constraints.integration.test.ts`
  (8) reconfirmed green against these changes.

## Commands actually run

`npx prisma migrate dev --create-only`, `db:scan-migrations`,
`db:verify:local`, `npx prisma generate`, and the specific test files listed
above (targeted `vitest run`, plus `vitest run --config
vitest.integration.config.mts` for the two integration files). No repo-wide
`check`/`verify:*`/Playwright — left to the owner's fresh-session run.

## Limitations / owner review

- No barcode/UPC/camera behavior (Slice 14, out of scope here).
- No ingredient-level nutrition or Recipe-total aggregation from
  Ingredients/Parts — Version-level only, as scoped.
- FDC search has no debounce — an explicit Search action (button/Enter),
  not live-as-you-type, to keep the request path simple and testable
  without fake timers. Worth a UX look if the owner wants live search.
- `More nutrients` inputs are plain number inputs (no fraction/mixed-number
  parsing like ingredient quantities) — nutrient values are always plain
  decimals in source data, so this seemed unnecessary; flagging in case
  that's a wrong call.

**Owner intervention recommendation: Brief sanity check.** After
verification passes, open a Recipe's editor and confirm: manual nutrition
entry saves and reloads correctly; FDC search (with a real `FDC_API_KEY`)
returns and applies a result; detach clears attribution but keeps values;
More nutrients only shows the 5 recognized fields. No unresolved product/
design questions — this pass followed the settled Slice 13 scope and the
owner's clarifications directly.
