# Slice 5 — Images, quantity scaling, temporary scaling, and unit conversion

**Status: Implementation complete, not yet verified. Corrected in place —
see "Correction: Version-trigger and Slice 5 image correction pass" near
the end of this report before trusting anything above it about title,
description, or image Version-triggering behavior.** All Slice 5 scope
from `docs/BUILD_PLAN.md` (lines 148-165) is implemented. Per this task's
constraints, no automated tests, lint, typecheck, build, or Playwright
were run during this pass — the owner runs `pnpm run verify:all`
afterward and returns any failures for a separate debugging pass. Nothing
was committed, pushed, or deployed. Slice 5 has no required Review Gate
per `docs/BUILD_PLAN.md` §D (the gates land at Slices 2, 6, 7, 12, 15, 16,
21 — none at Slice 5).

**A later correction pass (see the labeled section near the end of this
report) found that this slice's original image classification drifted
from the settled product model, and corrected it in code, tests, and
canonical documentation.** The sections below are left largely as
originally written for historical record, but several claims in them are
now superseded — read the correction section before relying on any
statement here about title, description, or image triggering Version
creation, historical Version image/description immutability, or Version
comparison including image differences.

This slice builds on Slice 3's editor/detail foundation and Slice 4's
Version-history/comparison machinery (`docs/SLICE_4.md`), extending the
shared content model rather than replacing any of it.

## Completed Slice 5 scope

- **Images**: a Recipe/Part Version may have zero or one image
  (`ImageAsset`/`DishVersion.imageAssetId`), uploaded via a private Vercel
  Blob store using the signed-URL client-upload pattern. A new Version
  inherits the base Version's image by default; the editor lets a user
  retain, replace, or remove it. **[Corrected by the later pass — see the
  labeled correction section below.]** This original pass classified an
  image-only change as an automatic minor Version, and described
  historical Versions as keeping their original image "forever," changeable
  only via Dish deletion. Both are superseded: image is Version-associated
  but mutable — it may be added, replaced, or removed in place on the
  current *or* any historical Version, without creating a Version.
  Reference-counted cleanup deletes an orphaned `ImageAsset` (and
  best-effort deletes its Blob object) whenever the last `DishVersion`
  reference to it disappears — now including in-place replace/remove, not
  only Dish deletion.
- **Substitutes**: already fully implemented as of Slice 3 (see
  "Carried-over scope" below) — verified, not rebuilt.
- **Quantity scaling and formatting** (§52): pure scaling functions for
  single values, ranges, approximate flags, free-text passthrough, and
  fractional counts; a kitchen-fraction-or-decimal "calculated style"
  formatter distinct from the existing authored-style display.
- **Temporary whole-item scaling outside Cooking Sessions** (§51): a
  "View for N [unit]" control on the Recipe/Part detail page (current
  Version only), with "Reset to authored" and "Save as default"
  (`Dish.defaultBatchQuantity`/`defaultBatchUnit`) — never creates a
  Version.
- **Safe unit conversion and simplification** (§53): volume/weight/
  temperature family conversion, a simplification-suggestion function
  (`6 tsp → 2 tbsp`, `16 tbsp → 1 cup`, `1,000 g → 1 kg`), an in-view
  "Use" (temporary) and "Save for this ingredient" (persists a
  `PreferredUnitOverride` targeted at one ingredient lineage) action pair,
  and a "reset to authored unit" control.

## Canonical requirements implemented

- `PRODUCT_SPEC.md` §12.1–§12.3 (image count, Version inheritance,
  no-image behavior) and the §20 "Images" acceptance-criteria group.
- `PRODUCT_SPEC.md` §11.1–§11.5 (substitutes) — carried over from Slice 3,
  verified rather than re-implemented.
- `PRODUCT_SPEC.md` §51.1–§51.5 (temporary scaling, save-as-default,
  whole-item-only outside a Cooking Session, session history untouched —
  the last point is a no-op today since Cooking Sessions don't exist until
  Slice 7).
- `PRODUCT_SPEC.md` §52.1–§52.7 (scaling math, range/approximate/free-text/
  count handling, authored vs. calculated display style).
- `PRODUCT_SPEC.md` §53.1–§53.6 (compatible families, simplification,
  no unsafe mass↔volume conversion, accepted temporary conversion,
  save/reversible preferred units).
- `ARCHITECTURE_PROPOSAL.md` §D.2a (`ImageAsset` — query-based reference
  counting, `onDelete: Restrict`, cross-account-safe sharing on
  duplication), §D.4 (substitute uniqueness/non-recursion, verified), §L
  (Image storage integration architecture), §M (MIME/size validation,
  signed-URL upload, private-by-default reads).

## Architecture and data-flow decisions

- **No schema or migration change.** Every field this slice exercises
  (`ImageAsset`, `DishVersion.imageAssetId`, `Dish.defaultBatchQuantity`/
  `defaultBatchUnit`, `PreferredUnitOverride`,
  `Ingredient.substituteForIngredientId`) already existed from the Slice 2
  migration, confirmed by direct schema read before writing any code.
- **`imageAssetId` classified as non-cooking Version-owned content**
  (`src/lib/dishes/service.ts`'s `nonCookingScalarChanged` in `editDish`)
  — an image-only change is an automatic minor bump, never the explicit
  minor/major save-choice prompt, matching how title/yield/prep-time
  changes are already classified (§13.2a's three-bucket rule). **Judgment
  call, flagged for owner sanity check** — the spec doesn't explicitly
  classify images this way, but it's clearly not an ingredient/instruction
  change, so the existing non-cooking bucket was the natural fit.
  **[Corrected — this judgment call was wrong, per the labeled correction
  section below.]** The owner settled this explicitly: description and
  image are Version-associated but mutable metadata, not "non-cooking
  Version-owned content" that should bump a Version. An image-only (or
  description-only) change now updates the selected Version's row
  directly and creates no Version at all — a new bucket, distinct from
  both the no-Version stable-metadata bucket and the automatic-minor
  non-cooking bucket. Title was also removed from the non-cooking bucket
  entirely and reclassified as stable Dish/Part identity (never
  Version-owned), which this original pass did not question.
- **`imageAssetId` flows through the same four Version-creation/copy
  paths as every other content field, never a separate code path:**
  `createDish` (accepts an already-uploaded id), `editDish` (inherits from
  `base` by default via the form's own initial value — the editor's
  `dishToFormValues` loads it from whichever Version is being edited, so
  an untouched form resubmits the same id unchanged), `promoteHistoricalVersion`
  (verbatim copy, like every other field there), `duplicateDish` (verbatim
  copy — **shares the same `ImageAsset` row across the account boundary**,
  per Arch §D.2a's explicit sanctioning of this, rather than re-uploading
  or copying bytes).
- **Reference-counted image cleanup wired into `deleteDish` only**, not a
  general "image replaced/removed" hook. Reasoning: Versions are
  immutable and never lose an existing `imageAssetId` reference in place
  — the only way a `DishVersion` row stops referencing an `ImageAsset` in
  this Tier's actual UI is the row being deleted outright, which only
  happens via `deleteDish`'s cascade. `deleteDish` now gathers every
  distinct `imageAssetId` its own Versions reference *before* the cascade,
  deletes the Dish (cascading its Versions), then — still inside the same
  transaction — checks each candidate's remaining reference count via
  `deleteImageAssetIfOrphaned` (`src/lib/images/service.ts`); any that
  reach zero are deleted, and their `storageKey`s are best-effort
  Blob-deleted *after* commit (`bestEffortDeleteBlob`, swallowing failures
  rather than rolling back the already-committed delete). **[Corrected —
  see the labeled correction section below.]** The premise here ("Versions
  ... never lose an existing `imageAssetId` reference in place") is exactly
  what the correction pass overturned: `applyVersionMetadataUpdate`
  (`src/lib/dishes/service.ts`) now mutates a Version's `imageAssetId` in
  place, so cleanup runs from that path too, using the same
  `deleteImageAssetIfOrphaned` helper, inside the same kind of transaction.
  `deleteDish`'s own cleanup is unchanged by the correction — it remains
  correct as originally described here.
- **New Recipe/Part has no Dish row yet — `requestImageUploadUrl`'s
  `dishId` is nullable.** The editor reuses one `ImageField` component for
  both "New recipe" and "Edit" flows; a brand-new item has nothing to
  check Dish-ownership against yet. When `dishId` is omitted, any
  authenticated user may request an upload token for themselves, and the
  Blob storage path is keyed by `ownerId` instead of `dishId`. **Real
  design decision, not obviously correct, flagged for owner review** — an
  alternative would have been disabling image upload until after the first
  save, which was rejected as a worse UX for a small added-complexity
  cost.
- **Accepted gap, not silently ignored: an `ImageAsset` created via
  upload-token issuance that never ends up attached to any saved
  `DishVersion`** (user uploads, then abandons the edit, or replaces the
  image before saving) has no cleanup path today. Tier 1 has no
  scheduled-job/cron infrastructure to sweep this, and it's a genuinely
  separate problem from the reference-counted cleanup this slice does
  build (which only ever runs where a real `DishVersion` row is deleted).
  Documented here rather than building speculative sweep infrastructure
  for a single known edge case.
- **`/api/images/[assetId]` has no `ShareLink`-token branch.** The
  architecture doc describes dual owner-session-OR-share-token
  authorization so a public share viewer can also see an image, but no
  `ShareLink` creation service or UI exists anywhere in this codebase yet
  (Tier 2, Slices 16-17) — writing a check against a token nothing can
  ever issue would be a fake implementation, not a real one. Deliberately
  omitted, the same way Slice 4 omitted a linked-Parts comparison group
  rather than adding a placeholder for it. **The sharing slice needs to
  add this branch, not discover it's missing** — flagged explicitly here
  for that reason.
- **One shared scaling+conversion+formatting composition function**
  (`src/lib/dishes/scaled-display.ts`'s `scaledIngredientDisplay`) used by
  the one UI surface that needs all three at once
  (`ScaledVersionView`) — `src/lib/units/` itself (scaling.ts,
  conversion.ts) stays generic with no notion of "an ingredient," matching
  `compare.ts`'s existing pure-function-module pattern in this codebase.
- **`formatIngredientLine` (`src/lib/dishes/format.ts`) gained one optional
  parameter** (`formatQuantityText`, defaulting to `String` — unchanged
  existing behavior) rather than a second copy of the line-assembly logic,
  so the calculated-style (scaled) and authored-style (unscaled) displays
  can never drift into two different join/prefix/note rules.
- **Comparison (`compare.ts`) needed zero code changes.** Slice 4 already
  read `DishVersion.imageAssetId` into its metadata snapshot and rendered
  "Has an image" before/after — it rendered nothing in practice only
  because no editor wrote real image data yet. Now that Slice 5 writes
  real `imageAssetId` values, the comparison view shows real image diffs
  automatically. Verified directly by reading `compare.ts` and the compare
  route before assuming this, not asserted from memory. **[Corrected — see
  the labeled correction section below.]** This is now the wrong behavior,
  not just an implementation detail: once image (and title) are understood
  as mutable/non-Version-owned metadata rather than immutable Version
  content, diffing them between two Versions reports whatever happens to
  be true *now* on each side, not a material difference in recipe content
  — the opposite of what Version comparison is for. The correction pass
  removed both fields from `VersionMetadataSnapshot`/`metadataChanges`.
  Description was left in comparison; only title and image were removed.
- **Kitchen-fraction denominator set `{2, 3, 4, 6, 8}` and a `0.01`
  tolerance** (`src/lib/units/scaling.ts`) are a documented implementation
  choice, not a literal spec requirement — §52.7 explicitly says the spec
  "defines the outcome rather than a specific conversion algorithm."
  **Flagged for owner sanity check**, same spirit as Slice 4 flagging its
  own version-note wording as a judgment call.
- **Unit-conversion "accept" interaction is per-ingredient, not a
  view-wide unit-family toggle.** §53.5's "used consistently throughout
  the current view" could be read either way (one ingredient's accepted
  unit vs. every ingredient sharing that unit family); this slice
  implements the narrower per-ingredient reading, consistent with §53.6's
  explicit per-`ingredientLineageId` targeting for the *saved* case.
  **Flagged as an interpretation worth an owner look**, not silently
  decided as obviously correct.
- **Temporary scaling/conversion UI lives on the current-Version detail
  page only** (`ScaledVersionView`, replacing `VersionSectionsView` there),
  never on the Version-history or comparison pages, which keep rendering
  historical Versions with the original, unscaled `VersionSectionsView` —
  §51.1 explicitly ties temporary scaling to "the current Recipe or Part
  Version."

## Vercel Blob provisioning (owner-authorized, completed this session)

The Build Plan's stated dependency — a private Blob store provisioned
"at Slice 5 implementation time" — was initially blocked by this session's
no-Vercel-modification restriction. The owner was asked and initially
chose to have the image code written untested; **the owner then
explicitly, narrowly authorized provisioning the store mid-session**,
overriding that restriction for this one action only. No other Vercel
setting was touched and nothing was deployed.

- **Store name:** `dishframe-images`.
- **Access mode:** **private** — matches the architecture doc's explicit
  requirement (no `url` column on `ImageAsset`, dual-authorization image
  route) and this implementation's actual code; there was no conflict
  between canonical docs and the written code, so no owner question was
  needed before creating it.
- **Region:** `iad1` (the CLI's own default — no region was already
  associated with the project to match, and none was invented).
- **Connection:** connected to the existing `dish-frame` Vercel project
  (`.vercel/project.json`) across all environments (production, preview,
  development) via `vercel blob create-store dishframe-images --access
  private --yes`.
- **Environment variable:** `BLOB_READ_WRITE_TOKEN` — confirmed present in
  `.env.local` by name only (its value was never printed, logged, or
  committed). The provisioning command **merged** this variable and
  `VERCEL_OIDC_TOKEN` into the existing `.env.local` rather than
  overwriting it; every pre-existing variable (`DATABASE_URL`,
  `DIRECT_URL`, `FDC_API_KEY`, `BETTER_AUTH_SECRET`, etc.) was explicitly
  reported "Kept" by the CLI and verified still present afterward.
  `.env.local` remains covered by the repository's existing `.gitignore`
  (`.env*` with `!.env.example`), confirmed by reading `.gitignore`
  directly.
- **Local configuration status:** complete — the token is present and the
  image-upload code should be genuinely functional locally, subject to the
  owner's own manual check (see "Owner intervention recommendation"
  below). This report does not claim the upload flow works end-to-end;
  that has not been verified by running the app.
- **Commands run for this provisioning action** (the one explicitly
  authorized exception to the no-Vercel-command policy for this pass):
  `npx vercel@latest whoami`, `vercel blob list-stores`, `vercel blob
  list-stores --all`, `vercel blob create-store --help`, `vercel blob
  create-store dishframe-images --access private --yes`. No deploy, no
  other project setting inspected or changed.

## Routes, services, actions, and components added or changed

**New routes:**
`src/app/api/images/[assetId]/route.ts` — GET, dual-purpose-ready but
currently owner-session-only authorization (see "share-token branch"
above), streams the private Blob object via `get(storageKey, { access:
"private" })`.

**New library modules:**
`src/lib/units/scaling.ts`, `src/lib/units/conversion.ts`,
`src/lib/dishes/scaled-display.ts`, `src/lib/images/schema.ts`,
`src/lib/images/service.ts`, `src/lib/images/actions.ts`.

**New components:**
`src/components/domain/dish/image-field.tsx` (editor upload widget),
`src/components/domain/dish/scaled-version-view.tsx` (current-Version
detail page's scaling/conversion-aware renderer, replacing
`VersionSectionsView` there only).

**Modified:**
`src/lib/dishes/schema.ts` (`dishContentSchema` gained `imageAssetId`;
new `setDefaultBatchScaleSchema`/`savePreferredUnitOverrideSchema`/
`clearPreferredUnitOverrideSchema`), `src/lib/dishes/service.ts`
(`imageAssetId` wired through `createDish`/`editDish`/
`promoteHistoricalVersion`/`duplicateDish`; `deleteDish` gained
reference-counted image cleanup; new `setDefaultBatchScale`/
`savePreferredUnitOverride`/`clearPreferredUnitOverride`),
`src/lib/dishes/queries.ts` (`dishDetailInclude` gained
`preferredUnitOverrides`), `src/lib/dishes/actions.ts` (new
`setDefaultBatchScale`/`savePreferredUnitOverride`/
`clearPreferredUnitOverride` Server Actions), `src/lib/dishes/format.ts`
(`formatIngredientLine` gained the optional `formatQuantityText` param),
`src/components/domain/dish/dish-form-values.ts` (`imageAssetId` in
`dishToFormValues`/`blankDishFormValues`), `src/components/domain/dish/dish-editor.tsx`
(renders `ImageField`), `src/components/domain/dish/dish-detail-view.tsx`
(renders the image when present; uses `ScaledVersionView` instead of
`VersionSectionsView`), `src/app/(app)/recipes/[dishId]/versions/[versionId]/page.tsx`
and the parts equivalent (render the Version's own image, if any —
`VersionSectionsView` itself was left unchanged, still used by both
history pages for the ingredient/instruction content below the image),
`package.json`/lockfile (`@vercel/blob` dependency added).

**Test-fixture fixes for the new required `imageAssetId` field** (not new
scope, just keeping existing tests compiling):
`src/components/domain/dish/dish-editor.test.tsx`,
`src/lib/dishes/dishes.integration.test.ts` (both fixture builders needed
one added line; confirmed via a repo-wide grep that no other test file
constructs `DishContentInput`/`DishFormValues` directly).

## Schema or migration changes

None. Confirmed by direct `prisma/schema.prisma` read before writing any
code that every field this slice needed already existed from the Slice 2
migration.

## Authorization, integrity, and immutable-Version guarantees preserved

- Every new/changed service function still resolves its target through
  `getOwnedDishOrThrow` (or, for `requestImageUploadUrl`'s no-Dish-yet
  case, skips that check only when there is genuinely no Dish to check
  against) — no new bypass of the owner-scoping pattern established in
  Slices 3-4.
- `imageAssetId` participates in `editDish`'s existing classification
  machinery rather than a parallel code path — the minor/major
  save-choice prompt, current-pointer rules, `sourceVersionId` provenance,
  and seeded-note logic are all completely untouched by this slice.
- `promoteHistoricalVersion`'s verbatim-copy contract is preserved —
  `imageAssetId` is copied exactly like every other field there, no
  special-casing.
- `deleteDish`'s image cleanup runs *inside* its existing transaction
  (alongside the pre-existing ShareLink-revocation/DirectShare-cancellation
  step), so a failure partway through still rolls back atomically; only
  the Blob-delete call itself happens after commit, and only
  best-effort/logged, never able to undo the already-committed database
  state.
- `PreferredUnitOverride`'s uniqueness (`@@unique([dishId,
  ingredientLineageId])`) is relied on via upsert, not re-implemented as
  an application-level check that could race.
- Substitute integrity (Slice 3): re-verified, not re-implemented — the
  "cannot itself have a substitute" rule is structural (the Zod substitute
  schema has no nested `substitute` field at all) and backed by
  `Ingredient.substituteForIngredientId`'s `@unique` DB constraint.
- Scaling/conversion never write to a `DishVersion` — `scaleIngredientQuantity`/
  `convertQuantity`/`scaledIngredientDisplay` are pure, read-only
  functions; only `setDefaultBatchScale` (writes `Dish.defaultBatchQuantity`/
  `defaultBatchUnit`) and `savePreferredUnitOverride`/
  `clearPreferredUnitOverride` (write `PreferredUnitOverride` rows) persist
  anything, and neither ever creates a Version or touches Version content.

## Automated tests written (not run)

- `src/lib/units/scaling.test.ts` — `scaleQuantity` (single/range/count,
  no premature rounding), `scaleIngredientQuantity` (free-text passthrough,
  approximate-flag preservation, null handling), `toKitchenFraction`
  (whole/simple/mixed fractions, `null` for no clean match),
  `formatCalculatedQuantity` (fraction-preferred, decimal fallback,
  the literal `1 egg → 1.5 eggs` example).
- `src/lib/units/conversion.test.ts` — `normalizeUnitName` (common
  spellings, unrecognized → `null`), `convertQuantity` (volume/weight
  factor conversion, temperature's linear formula, `null` across families
  per §53.4), `suggestSimplifiedUnit` (all three literal §53.3 examples,
  no-suggestion cases, no suggestion for temperature).
- `src/lib/dishes/scaled-display.test.ts` — `scaledIngredientDisplay`:
  authored vs. calculated style switching, free-text never scales,
  suggestion computed against the *scaled* quantity not the authored one,
  an override applies instead of suggesting, unrecognized units are inert.
- `src/lib/dishes/dishes.integration.test.ts`, new Slice-5 blocks (against
  real local Postgres, `@vercel/blob`'s `del` mocked so no live network
  call happens during the test run — see that file's own top-of-file
  comment):
  - `editDish — imageAssetId`: an unchanged `imageAssetId` creates no
    Version; an image-only change creates an automatic minor Version with
    no `versionChoice` required. **[Superseded — see the labeled
    correction section below.]** This test was rewritten: an image-only
    change now creates no Version at all, matching the corrected model.
    The correction pass's own new/updated test coverage is listed in that
    section, not duplicated here.
  - `promoteHistoricalVersion — imageAssetId`: verbatim copy.
  - `duplicateDish — imageAssetId`: the duplicate shares the same
    `ImageAsset` row (not a copy).
  - `deleteDish — image reference-counted cleanup`: the `ImageAsset` is
    deleted once its last referencing Dish is deleted; it survives while a
    duplicate still references it, then is deleted once that duplicate is
    also deleted.
  - `setDefaultBatchScale`: sets and resets without creating a Version;
    cross-user `NotFoundError`.
  - `savePreferredUnitOverride`/`clearPreferredUnitOverride`: upsert
    behavior (re-saving replaces, doesn't duplicate), one ingredient
    lineage never affects a different one, cross-user `NotFoundError`.

## Presentation tests intentionally deferred

Per this project's testing policy — new UI surfaces this slice
introduces, not yet stabilized by manual/design review:

- `ImageField`'s upload/remove interaction and error-copy presentation.
- `ScaledVersionView`'s scaling-control layout, the suggestion-chip
  "Use"/"Save" interaction, and the reset/save-default button states.
- No new Playwright e2e coverage was added for the upload → save → view-
  scaled → save-preferred-unit path — exactly the kind of still-evolving
  presentational flow this project's testing policy asks to defer rather
  than lock in with brittle coverage before design review.

## Correction: Version-trigger and Slice 5 image correction pass

**Bounded correction pass, performed after this slice was reported
complete.** The owner identified that implementation and documentation had
drifted from an already-settled product rule: title, description, and
image were being treated as ordinary Version-owned content requiring a new
Version (or an automatic minor bump) for any change, when the settled
model treats title as stable identity and description/image as
Version-associated but mutable. This section documents the correction.
Everything above this section is the original Slice 5 report, left in
place for historical record but superseded wherever it conflicts with
what follows. Per this project's product-spec-authority rules
(`AGENTS.md`), the canonical documents — now corrected alongside this
report — are the actual authority; this section is a record of what
changed and why, not itself the source of truth going forward.

### Settled lightweight Version semantics

DishFrame's Version system is product-oriented, not Git-like. Not every
field associated with a Version is immutable. Three categories, not two:

1. **Stable Dish/Part identity — never Version-owned, never triggers a
   Version.** Title, Stage, cuisine, archive state, default scaling
   preferences, preferred display-unit overrides. Editing any of these
   alone saves directly.
2. **Version-associated but mutable metadata — never triggers a Version.**
   Description and image. Each Version has its own value for each field,
   but editing either — on the current Version or on any selected
   historical Version — updates that Version's stored value in place.
   Version association does not imply immutability.
3. **Genuinely immutable Version content — triggers a Version.** Yield,
   prep/cook time, difficulty, nutrition, and Section naming/organization
   (automatic minor, no prompt); Ingredient/Instruction changes (the one
   explicit minor/major choice). Unchanged by this correction.

A save combining fields from more than one category applies each
correctly: stable-identity changes land on the Dish/Part directly,
mutable-metadata changes land on the Version being saved (the newly
created one, if this save also triggers category 3; the selected Version
in place, otherwise), and a Version is created only because of a genuine
category-3 change — never because a category-1 or category-2 field
happened to change in the same save.

### Title handling

Title moved from "Version-owned" to "stable Dish/Part identity"
(`PRODUCT_SPEC.md` §7.1, corrected from §7.2). `editDish`
(`src/lib/dishes/service.ts`) now compares the submitted title against
`Dish.currentTitle`, not the base Version's own `title` column, and
updates `Dish.currentTitle` directly and unconditionally whenever it
changes — independent of whether the same save also creates a Version,
and independent of whether that Version becomes current. `DishVersion.title`
still exists (no migration — the column just becomes an inert, write-only
historical mirror, refreshed at Version-creation time from whatever the
Dish's title is at that moment) but nothing reads it for display purposes
anymore: `dish-detail-view.tsx`, both Version-history pages, and
`dish-form-values.ts`'s `dishToFormValues` all switched to
`Dish.currentTitle`. `promoteHistoricalVersion` no longer touches
`Dish.currentTitle` at all (title is unaffected by promoting historical
*content*, exactly like Stage already was) — the promoted Version's own
inert `title` mirror reflects the Dish's current title, not the promoted
Version's original one. `duplicateDish`'s suggested `Copy of [title]` and
frozen `sourceTitle` snapshot both now read `Dish.currentTitle`, not the
specific source Version's stored value, since a duplicate's "source
title" should reflect what the source item was actually called, not a
possibly-stale mirror.

### Mutable Version description/image handling

`applyVersionMetadataUpdate` (new, `src/lib/dishes/service.ts`) is the
one sanctioned exception — alongside the pre-existing `versionNote` update
— to "DishVersion rows are never mutated in place." It updates
`description`/`imageAssetId` directly on an already-saved `DishVersion`
row, inside a transaction with the image-cleanup check described below,
and never touches version numbering, `sourceVersionId`, or
`Dish.currentVersionId`. `editDish` calls it when a save changes
description/image with no accompanying category-3 change; the new
`updateVersionMetadata` service function (below) calls it directly for a
metadata-only edit that isn't going through the full editor at all. When a
save *does* create a new Version (a genuine category-3 change), the new
Version's description/image are taken directly from the submitted values,
same as every other Version-owned field — which is how "a new Version
inherits the selected base Version's description/image unless the same
save intentionally supplies different ones" falls out naturally, with no
special-case code.

### Historical metadata editing

New component `VersionMetadataEditor`
(`src/components/domain/dish/version-metadata-editor.tsx`) — a small
`react-hook-form` instance reusing the existing `ImageField` upload
widget plus a description textarea, with its own Server Action
(`updateVersionMetadata`, `src/lib/dishes/actions.ts` →
`dishService.updateVersionMetadata`). Rendered on the current-Version
detail page (`dish-detail-view.tsx`, replacing the old static
description/image block) and on both historical Version-history pages
(`recipes/[dishId]/versions/[versionId]/page.tsx`,
`parts/[dishId]/versions/[versionId]/page.tsx`), so description/image can
be edited in place on any selected Version — current or historical —
without branching, without requiring that Version to be its major line's
latest minor, and without touching `Dish.currentVersionId`,
`sourceVersionId`, version numbering, or any Section/Ingredient/
Instruction content. The full `DishEditor` still carries description/image
fields too (needed for new-item creation, and for a save that
intentionally combines a metadata change with a category-3 change in one
action) — the two paths share the same underlying service logic
(`applyVersionMetadataUpdate`), not two different implementations of "how
to update a Version's image."

### Authorization corrections

**Attach authorization (new — this was the security gap flagged during
Slice 5 review):** `assertImageAssetAttachable`
(`src/lib/images/service.ts`) runs before `createDish`, `editDish`, and
`applyVersionMetadataUpdate`/`updateVersionMetadata` ever write a
client-supplied `imageAssetId` onto a `DishVersion`. It allows the asset
only when the caller uploaded it (`ImageAsset.uploadedByUserId` matches)
or a `DishVersion` the caller already owns references it (the legitimate
cross-account-sharing case — a duplicate or accepted copy may keep reusing
a shared asset). An unrelated user can no longer attach another account's
unreferenced uploaded asset merely by knowing or guessing its id;
`AuthorizationError` is thrown instead. `promoteHistoricalVersion` and
`duplicateDish` are unaffected — neither accepts a client-supplied image
id; both copy an already-legitimate reference structurally.

**Read authorization (`/api/images/[assetId]/route.ts`):** already
correct as originally written — re-verified, not changed. It authorizes
by "does the signed-in user own at least one `DishVersion` referencing
this asset," never by `uploadedByUserId` alone, so a legitimate
cross-account duplicate owner can read a shared image they never
uploaded, while an unrelated user with no authorized reference cannot.
The deferred `ShareLink`-token branch remains exactly as documented in
the original report — genuinely deferred to the sharing slice, not
something this pass needed to touch.

### Image cleanup corrections

The original premise — "a `DishVersion` never loses an existing
`imageAssetId` reference in place, so cleanup only ever needs to run from
`deleteDish`'s cascade" — is no longer true. `applyVersionMetadataUpdate`
captures the prior `imageAssetId` before updating the row, updates it
inside a transaction, and — if the image actually changed and there was a
prior non-null value — calls the same `deleteImageAssetIfOrphaned`
helper `deleteDish` already used, inside that same transaction; the
`ImageAsset` row is deleted only if no `DishVersion` anywhere still
references it, and its Blob object is best-effort deleted only after
commit. Replacing an image with the same id is explicitly a no-op for
cleanup purposes (never treated as freeing anything). `deleteDish`'s own
cleanup is unchanged.

The known abandoned-upload orphan case (an `ImageAsset` created via
upload-token issuance that never ends up attached to any saved
`DishVersion`) remains an accepted Tier 1 gap, exactly as the original
report documented — this correction pass didn't change that tradeoff, and
Tier 1 still has no scheduled-job infrastructure to sweep it.

### Tests written (not run)

Per this project's testing policy, written but not executed —
`src/lib/dishes/dishes.integration.test.ts` (extensively revised: several
pre-existing tests that used a title change to trigger a Version were
switched to a genuine non-cooking field like `prepTimeMinutes`, since
title alone no longer triggers anything; `promoteHistoricalVersion`'s
title assertions were corrected to expect the Dish's title survives
promotion untouched), plus new coverage for:

- title-only edit creates no Version and updates `Dish.currentTitle`
  directly;
- a title change riding with a non-cooking or material change still lands
  on the Dish, without being the Version's own trigger;
- current- and historical-Version description-only edits (both through
  `editDish` and through the new `updateVersionMetadata`) create no
  Version;
- image add, replace, and remove all create no Version and update the
  selected Version in place;
- image/description replace or remove never changes `currentVersionId`,
  `sourceVersionId`, or version numbering;
- a material Ingredient/Instruction change combined with a title/
  description/image change creates exactly one Version, with the new
  Version carrying the submitted description/image and the base Version's
  own row left untouched;
- a material Version with no explicit description/image override inherits
  the selected base Version's values;
- historical metadata edits never mutate Ingredients/Instructions/
  Sections;
- an unrelated user cannot attach another user's unreferenced uploaded
  image asset (on create, on edit, and on a metadata-only update);
- a legitimate cross-account duplicate owner can both attach (via a new
  independent save) and read a shared asset they never uploaded;
- an unrelated user cannot read a private image with no authorized
  `DishVersion` reference (new `src/app/api/images/[assetId]/route.integration.test.ts`,
  mocking the session and the Blob network read, exercising the real
  route handler against real Postgres rows);
- an old image survives replacement/removal while another Version still
  references it, and is cleaned up once its last reference is gone;
- `src/lib/dishes/compare.test.ts`: title and image are no longer present
  in `VersionMetadataSnapshot` at all, so comparison cannot report either
  as a difference; description remains diffable.

### Remaining accepted gaps

Unchanged from the original report: the abandoned-upload orphan case
(above), and the deferred `ShareLink`-token read branch. No new gaps were
introduced by this correction — it narrows scope (removing incorrect
Version-triggering) and closes a real authorization hole, rather than
adding new deferred work.

### Owner intervention recommendation

Same shape as the original report's recommendation, updated for what
actually needs a fresh look after this correction:

- **Brief real Blob upload/read sanity check** after the owner runs
  `pnpm run verify:all` — upload a photo on a Recipe, confirm it displays;
  edit the description/image on a historical Version via the new
  `VersionMetadataEditor` and confirm no Version was created; replace an
  image and confirm the old one is gone once nothing else references it.
  This session did not, and could not, verify any of this by running the
  app.
- **Defer the comprehensive scaling, conversion, image, and linked-Part
  design review to the formal Slice 6 Review Gate**, exactly as the
  original report recommended — this correction pass did not touch
  `ScaledVersionView`'s interaction design, the kitchen-fraction
  denominator choice, or the per-ingredient "accept" interaction, so those
  judgment calls remain open for that gate, not resolved here.
- **Resolved (owner decision, recorded 2026-07-27) — no longer an open
  question:** the linked-Part search-text/display-name resolution question
  flagged above is now settled. A linked Part's *displayed* name always
  resolves from the target Part's live `Dish.currentTitle`, never from
  `DishVersion.title` (inert historical mirror) or from
  `targetDishVersionId`'s own `title` column — the exact linked *content*
  still pins to `targetDishVersionId` as before, only the name is live. See
  `PRODUCT_SPEC.md` §68.5 (settled decision), `ARCHITECTURE_PROPOSAL.md`
  §44 note, and `PRISMA_SCHEMA_PROPOSAL.md` §7 for the full record. Nothing
  in the current codebase depends on this yet (`PartLink` isn't
  implemented), so no code changed as part of settling this — it removes a
  design unknown from Slice 6's planning, nothing more.

No other slice-wide re-verification is needed — the corrected
classification logic, the image-cleanup transaction, and the attach/read
authorization checks are all covered by the tests above and do not depend
on manual UI inspection to be judged correct.

## Owner intervention recommendation (original Slice 5 pass — superseded by the correction above for anything touching title/description/image)

**Focused manual review**, plus one verification-adjacent item that's
different in kind from ordinary code review:

- **Confirm the image upload flow actually works end-to-end** (upload a
  photo on a Recipe, confirm it displays, save a new Version, confirm
  inheritance; remove an image and confirm the historical Version keeps
  its own). This session did not, and could not, verify this by running
  the app — the Blob store is now provisioned and the token is present
  locally, but "the code is written correctly against the SDK's types" is
  not the same claim as "it works," and this report does not claim the
  latter.
- **The five explicitly flagged judgment calls above** — image-only
  changes classified as auto-minor **(settled and corrected by the pass
  above — no longer open)**, the nullable-`dishId` upload design
  for brand-new items, the kitchen-fraction denominator/tolerance choice,
  the per-ingredient (not per-unit-family) "accept" interaction, and the
  omitted `ShareLink`-token branch on the image route (a note for the
  future sharing slice, not something to fix now) — the remaining four are
  still open judgment calls made to keep the slice shippable, not settled
  product decisions.
- **`ScaledVersionView`'s interaction design** (the scaling control's
  placement/copy, the suggestion chip's "Use"/"Save" wording and layout)
  has no existing precedent elsewhere in this app to match against —
  worth a design pass before treating it as final, per `docs/BRANDING.md`
  §5.3's restrained-accent-color guidance and §15's voice principles,
  neither of which this report claims to have fully verified visually.

No other slice-wide re-verification is needed — the domain logic
(scaling math, conversion tables, reference-counted cleanup, the
non-cooking classification) is covered by the tests above and does not
depend on manual UI inspection to be judged correct.

## Owner verification command

```bash
pnpm run verify:all
```

Requires Docker Desktop running with the local Postgres container up
(`pnpm run db:docker:up`). Not yet run this pass — the owner runs it and
returns any failures for a separate, targeted debugging pass.
