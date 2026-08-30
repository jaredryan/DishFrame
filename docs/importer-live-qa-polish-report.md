# Recipe Gallery import — live-QA polish pass

Turns the working `.rga`/paste/upload/website import pipeline
(`docs/importer-enhancement-implementation.md`) into a polished, recoverable
experience, based on issues found in the owner's real full-library (~65
recipe) migration. No changes to the underlying `.rga` extraction, ZIP
safety limits, or bplist decoding — this pass is UI/UX, validation, and
recovery only.

## Upload control (task §1)

`src/components/domain/dish/file-dropzone.tsx` (new): a DishFrame-styled
drag-and-drop target (`border-border bg-card`, hover/drag-over/focus-visible
states) wrapping the same hidden `<input type="file">` as before. Click,
Enter/Space, and drag-and-drop all resolve to the same `onFileSelectedAction`
callback; the underlying `<FieldLabel htmlFor>` association is unchanged, so
existing `getByLabelText` queries still resolve it. All existing
validation/extraction (`extractTextFromImportFile`,
`extractRecipesFromArchiveFile`) is untouched — this only changes
presentation and adds a drop target.

## Pre-import section hierarchy (task §2/§3)

The flat draft list is now two page sections, "Needs review" first:

- **Needs review** — any draft that is `status: "error"` (couldn't be
  read), has `needsReviewCount > 0` from the parser, *or* now fails the
  bulk-import preflight check (see §10 below). Copy is explicit that this
  means "content it couldn't confidently place," not "the whole recipe is
  unreliable."
- **Ready to import** — everything else.

Explanatory copy ("Choose what each item becomes in DishFrame...") sits once
above both sections, above the Recipe/Part controls. Each row is a single
horizontal flex row, vertically centered (checkbox, title, source-category
badge, status badge, Recipe/Part toggle, Review); the checkbox's extra
top margin is gone. Review is now an icon+label ghost button (`Pencil`
icon) instead of a bare text link.

## Discard import (task §4)

"Start over" → **"Discard import"**, destructive-styled, in both the
pre-import list and (renamed from "Discard and start over") the single-item
review screen. In the batch list, it now confirms first
(`ConfirmDialog`, destructive) whenever there's real pending work to lose —
tracked via `hasUnsavedBatchWork` (any draft reviewed, any row
reclassified off the RECIPE default, or any category mapping set away from
Ignore). With nothing pending, it discards immediately, same as before.

## Source-metadata mapping (task §5)

New "Source categories" section in the pre-import list (only rendered when
the archive has at least one non-"Uncategorized" `sourceCategory`): each
unique category, its recipe count, and two selects — **target** (Ignore /
Cuisine / Tag / Flavor profile) and, for Tag/Flavor profile, **which one**
(every existing option, plus a "Create new ... " entry defaulting to the
category's own text). Switching to Tag/Flavor profile auto-pre-selects an
existing option on a normalized-name (trim + lowercase) match; the "Create
new" resolution reuses the exact same `createTag`/`createFlavorProfile`
Server Actions Settings' Tag/Flavor-profile managers use, so a re-resolve
is always dedup-safe (same `normalizedName` unique constraint).

"Apply mappings" resolves any pending "create" mappings into real ids and
applies a "cuisine" mapping directly into the matching drafts'
`cuisine` field (preferring an existing cuisine's canonical casing on a
case-insensitive match, else the raw category text) — this is also run
automatically, idempotently, the moment Import or Retry is clicked, so
skipping the button doesn't lose the mapping.

Tags/Flavor profiles aren't part of `dishContentSchema` (they're separate
join tables, same as the ordinary editor's Tags & Flavors popover) — a
mapped draft's resolved `tagIds`/`flavorProfileValueIds` now ride along on
`BulkImportItemInput`, and `confirmImportBatch` (`importExport/actions.ts`)
calls `dishMetadata.setDishTags`/`setDishFlavorProfiles` right after that
item's Dish is created. A metadata-mapping failure there is logged and
swallowed, not reported as an import failure — the Dish itself did save.

**Known limitation:** a category mapping is applied to matching drafts
by category string, overwriting each draft's live `cuisine` value on every
`resolveCategoryMappings()` call — if a draft's cuisine was hand-edited
during Review *after* a cuisine mapping was set for its category, the
mapping will overwrite that edit on the next Apply/Import/Retry. Acceptable
for now (documented, not silently accepted) given real Recipe Gallery
exports never set cuisine themselves.

**Tier 3, deferred (not built):** a Meal Type / Course / Recipe Format
taxonomy came up during QA as a possible future mapping target alongside
Cuisine/Tag/Flavor profile. No such taxonomy exists in DishFrame today;
revisit if/when one is added.

## Batch-review navigation (task §6) and Finish review (task §7)

`DishEditor` gained two optional props, both `undefined` for every ordinary
caller (no behavior change outside import):

- `onCancelAction?: () => void` — when set, the sticky-footer Cancel button
  calls this instead of rendering a `<Link>` to `cancelHref`. This was the
  actual bug: in batch Review, Cancel previously always linked to
  `/recipes`/`/parts`, unmounting `PasteImportFlow` and discarding the
  whole in-memory pending-import workspace (all reviewed drafts,
  reclassifications, metadata mappings). Now it just clears the review
  step's local state and falls back to whichever of the pending list or
  post-import results screen was underneath — no edits applied, batch
  state untouched.
- `submitLabel?: string` — batch Review passes `"Finish review"` in place
  of "Save". `DishEditor`'s own `onCreate` override for batch Review
  (`handleBatchItemReviewSave`) already never called the server; the label
  change makes that semantics visible instead of implying persistence.

The standalone button above the editor (previously "Back to recipe list")
is now **"Back to import list"** in batch-review context specifically,
separate from "Discard import" (§4) — it returns to the list, it doesn't
throw away the batch.

## Needs Review inline treatment (task §8)

`DishEditor` now detects a Section literally named `"Needs review"` (the
importer's own marker, `paste-parser.ts`'s exported
`NEEDS_REVIEW_SECTION_NAME` — never something a user names a Section by
hand) and, when present:

- renders a dedicated orange-accent alert card near the top of the form
  ("Some imported lines need review" / the task's exact supporting copy),
  listing the unresolved lines and a **"Jump to these lines"** anchor link;
- wraps that one Section's own rendering in an orange border/background,
  with a stable `id` (react-hook-form's own field id) as the jump target.

All unresolved lines currently land in one consolidated Section (as
`buildParseResult` already did), so one jump link covers all of them —
there's no per-line anchor granularity. The existing supplemental
"N lines couldn't be confidently structured" banner in `PasteImportFlow`
is unchanged, now genuinely supplemental to the inline treatment.

## Root cause of the `<=200 characters` failures (task §9)

**Field:** `Ingredient.name` (200-char cap, `dishContentSchema` /
`ingredientInputSchema`).

**Content:** a long hand-typed prose line from one of the ~22% of the
owner's real export that used personal notes rather than the
`INGREDIENTS:`/`INSTRUCTIONS:` convention (per
`importer-enhancement-implementation.md`'s own inspection of the real
data).

**Why the parser placed it there:** `buildSections`'s fallback-to-ingredient
branch only length-checked a line (`UNSTRUCTURED_LINE_LENGTH_THRESHOLD`,
140 chars → Needs review) while the Section's mode was still `"UNKNOWN"`.
Once mode flipped to `"INGREDIENTS"` (from an `Ingredients:` heading, or
just an earlier short ingredient line), *every* later line — regardless of
length — fell straight into `parseIngredientLine`, with no length check at
all. Fixed in `paste-parser.ts`: the line is now parsed speculatively, and
if the resulting `name` exceeds 200 characters, the *raw line* is routed to
Needs review instead, matching the treatment an unstructured paragraph
already got under `UNKNOWN` mode. Same fix philosophy applied defensively
to `buildParseResult`'s title/cuisine/section-name overrides (clamped to
their own schema limits) — belt-and-suspenders for any *other* adapter
(website `name`/`recipeCuisine`, RGA `Title`) that could theoretically
produce an over-length value, even though none did in the real export.

**Is the 200-char limit correct?** Yes — kept as-is; the fix is in the
import path, not the domain constraint.

**Review-time vs. persistence-time validation:** they *differed* — the
`DishEditor` form had (and, for every field not covered by the parser fix,
still has) **no client-side length validation at all**; only the raw HTML
`<Input>`s with no `maxLength`, and no `zodResolver` wired into
`useForm`. The 200-char cap was enforced *only* server-side, inside
`dishContentSchema.parse`, surfacing as `toActionErrorMessage`'s
raw-Zod-message fallback: `error.issues[0]?.message` with no field name.

**User-facing message fix:** new `src/lib/dishes/validation-messages.ts`
(`describeDishContentIssue`) maps a `dishContentSchema` Zod issue to a
specific, human-readable message (using the issue's `path` plus the
values being validated for context) — e.g. `Ingredient name for "..." in
"Sauce" must be 200 characters or fewer.` `importExport/actions.ts`'s
`confirmImport`/`confirmImportBatch` now use this for any `ZodError`
thrown by `dishContentSchema.parse`, replacing the raw Zod fallback for
*this* schema specifically (other error types still go through the
existing `toActionErrorMessage`).

## Preflight validation (task §10)

`validateDishContentForPersistence` (same module) runs
`dishContentSchema.safeParse` — the exact persistence schema — against
every "ok" draft's current values, recomputed (`useMemo`) whenever drafts
change. This both:

1. **feeds the Needs Review grouping** (§2/§3) — a draft failing preflight
   is grouped under Needs Review even before Import is ever clicked, per
   the task's "integrate ... into the same review model" ask; and
2. **blocks Import/Retry** — clicking "Import N recipes" (or "Retry failed
   imports") first resolves category mappings, then preflight-checks every
   *selected* draft. Any failure opens a blocking dialog naming the
   affected recipe(s) and the specific problem(s), with a Review button per
   row; nothing is imported until the user either fixes the flagged drafts
   (via Review) or unchecks them and re-clicks Import with a clean
   selection.

With the paste-parser fix (§9) in place, a fresh Recipe Gallery import
should rarely trip this — it's defense-in-depth for any other source
(paste/upload/website) or any future adapter, not the primary fix.

## Chunk-based progress (task §11)

`runChunkedConfirm` (shared by the initial import and retry) treats each
`confirmImportBatch` chunk boundary (chunk size unchanged at 15) as the only
real progress checkpoint: while a chunk's call is in flight, an interval
eases the progress bar toward (but never reaches) 90% of that chunk's own
segment; the moment the call resolves, the bar snaps to the segment's exact
boundary before the next chunk's animation begins. No fake per-recipe count
is shown — just "Importing recipes… / This may take a moment. Keep this
page open." Selection controls, kind toggles, Review, and Discard import
are all disabled while `batchImporting` is true, preventing a duplicate
submission.

## Post-import Results / Failed / Added (task §12) and retry (task §13/§14)

Replaces the old flat mixed-result list with three sections, matching the
`<h2 className="font-heading text-lg font-medium">` header pattern already
used elsewhere in the editor:

1. **Results** — a card with a dynamically computed summary ("N imported,
   M failed." or "N recipes imported." on full success).
2. **Failed to import** (only when failures exist, shown before successes)
   — each failed draft is an expandable card (default expanded, matching
   the existing Cooking-Session-card disclosure pattern), title + Recipe/
   Part badge + source-category hint, a **Review** action, and the specific
   error inside a destructive-styled block with brief guidance. Review
   reopens the exact same batch-review `DishEditor` step; "Back to import
   list"/Cancel there return to this Results screen (not the pre-import
   list) since `batchResults` is never cleared by that step — "Finish
   review" only updates the pending draft, same as everywhere else.
3. **Recipes added / Parts added / Items added** (label reflects what
   actually succeeded — never assumes every success was a Recipe) — a
   read-only row per success with a link to its new detail page.

**"Retry failed imports"** retries only drafts still marked `error` in the
current results (re-running the same category-mapping resolution and
preflight check first). A successful retry moves that item into the added
section and updates the Results counts; a still-failing item stays in
Failed to import, editable/retryable again. This intentionally supersedes
the prior pass's "navigate to `/recipes` on full success" behavior — the
Results screen is now always the landing point (with "Go to
Recipes"/"Go to Parts" as an explicit action), since retry needs somewhere
to live and a screen that sometimes appears and sometimes doesn't would be
confusing.

## Tests

Updated/added (Vitest component/unit tests only — this session's standing
`deny-self-run-bash.sh` PreToolUse hook blocks Vitest/Playwright invocation
at the Bash-tool level, so none of these were run this session):

- `paste-parser.test.ts` — the exact root-cause scenario (§9: a long line
  after mode is already "INGREDIENTS"), and a title-clamp test.
- `validation-messages.test.ts` (new) — valid input passes; over-length
  ingredient name/title/instruction each produce the specific expected
  human-readable message, not a raw Zod string.
- `dish-editor.test.tsx` — `submitLabel` override, `onCancelAction`
  override (never navigates, no `createDish` call), and the Needs-review
  banner + working jump-link anchor for an imported Needs-review Section.
- `paste-import-flow.test.tsx` — rewritten/extended: Needs-review/Ready-to-
  import grouping (via `within(section)` scoping), drag-and-drop upload
  (dispatches a native `drop` event at the dropzone), "Discard import"
  rename + confirm-when-dirty + Keep-editing preserving state, "Back to
  import list"/"Finish review" batch-review nav, Cancel-in-batch-review
  discarding edits, a source-category-to-existing-Tag mapping applied to
  the bulk payload, the redesigned partial-failure Results/Failed/Added
  sections, and a full retry cycle (partial failure → retry → one moves to
  Added, one stays Failed with its new message). Every pre-existing test
  case is preserved, adjusted only for renamed labels/restructured
  sections/removed auto-navigation.

**Not covered by a new test** (existing coverage or judged low-value per
the project's test-value policy): the progress bar's exact animation
curve (visual, not a regression risk worth a timer-driven unit test); the
"create a new Tag/Flavor profile" mapping path (mocked at the action
boundary — the dedup/creation logic itself is `tags/service.ts`'s own
existing coverage, not new here).

**Owner: please run**, in a fresh session:
`vitest run src/lib/importExport/paste-parser.test.ts src/lib/dishes/validation-messages.test.ts src/components/domain/dish/dish-editor.test.tsx src/components/domain/dish/paste-import-flow.test.tsx`
as the first check — the rewritten `paste-import-flow.test.tsx` in
particular leans on this more than usual given the self-run block.

## Owner intervention recommendation

**Focused manual review** before relying on this for another real
migration:

- Run the real ~65-recipe `.rga` archive through Import again end-to-end —
  confirm the Needs-review/Ready-to-import split looks right, that no
  `<=200 characters` failure recurs, and that the chunk progress bar reads
  sensibly across ~5 chunks.
- Sanity-check the Source categories mapping UI against your real category
  list ("Vegetables", "Breads", etc.) — confirm "Create new tag" actually
  produces the tag you expect and it's attached to the right recipes after
  import.
- Force a couple of partial failures (e.g., temporarily break one draft)
  to walk the Failed → Review → Finish review → Retry loop once by hand.

No unresolved product/design questions beyond what's flagged above (the
cuisine-mapping-overwrite limitation, and the deferred Tier 3 taxonomy
idea).

## Follow-up: metadata-mapping fixes (narrow pass after live QA)

Three issues in the source-metadata mapping design above, all fixed.

**1. Dish success vs. metadata-attachment warning.** `confirmImportBatch`
(`importExport/actions.ts`) no longer swallows a Tag/Flavor-profile
attachment failure — the item's result stays `status: "success"` (the
Dish did save; retrying the whole item would create a duplicate), but now
carries an optional `metadataWarnings: string[]` naming the specific Tag/
Flavor profile that couldn't attach (e.g. `Tag "Desserts" could not be
applied.`). `BulkImportItemInput.tags`/`.flavorProfiles` changed from bare
id arrays to `{ id, displayName }[]` so the warning message can name the
value without an extra lookup. The Results screen's "Recipes/Parts added"
row renders that warning inline (orange, same treatment as the Needs-
review banner) beneath the title/View link — it's never placed in the
Failed section and never gets a Retry action, since the Dish already
exists.

**2. Cuisine precedence.** Category→Cuisine mapping is now a *default*,
not reapplied unconditionally. A new `manualCuisineOverrides` (Set of
draft indices) is set whenever a batch Review save actually changes that
draft's `cuisine` value; `applyCuisineMappingsToDrafts` (the old cuisine-
writing half of `resolveCategoryMappings`) skips any index in that set.
Applies to Apply mappings, Import, and Retry alike, since all three now
route through the same function. Resolves the "Known limitation" this
report previously documented.

**3. Deferred Tag/Flavor-profile creation.** `resolveCategoryMappings`
was split in two: `applyCuisineMappingsToDrafts` (pure/local, used by
"Apply mappings") and `resolveMetadataMappingsForCommit` (the part that
calls `createTag`/`createFlavorProfile`, called only from `handleImportClick`/
`handleRetryFailed` — i.e. at actual commit time). "Apply mappings" now
only writes Cuisine defaults into pending drafts; a "Create new Tag/Flavor
profile" selection stays a pending `{ target, selection: "create" }` in
`categoryMappings` until Import or Retry resolves it. Discarding the
import before that point calls neither Server Action, so no Tag/Flavor
profile is left behind. Existing-value mappings and normalized-name
dedup matching are unchanged.

**Tests** (`paste-import-flow.test.tsx`, `actions.ts` behavior exercised
through it — same self-run Vitest block as the rest of this pass, not run
this session): updated the existing-Tag-mapping test for the new `tags`/
`flavorProfiles` shape, and added: a metadata-attachment-warning test
(success-with-warning result, no Failed section, no Retry button, warning
text + View link visible); a Cuisine-mapping-default-then-manual-override
test (Apply mappings sets the Review default, a Review edit then survives
Import); "Create new Tag" + Discard and "Create new Flavor profile" +
Discard tests (create action never called); and a Tag-creation-at-Import
and Flavor-profile-creation-at-Import test (create action called exactly
once, resolved id/displayName flow into the `confirmImportBatch` payload).

**Owner: please run**, in a fresh session, in addition to the file list at
the top of this report's own "Owner: please run" line:
`vitest run src/components/domain/dish/paste-import-flow.test.tsx`
covers this follow-up specifically.

No unresolved product/design questions on this follow-up.
