# Slice 11 — Deterministic import, Recipe Gallery migration, export, and backup

Closes PRODUCT_SPEC.md §55-59/§65 ("Export and import" acceptance group).
No schema/migration change — `Ingredient.originalImportedText` and
`Dish.sourceKind = IMPORT` already existed from Slice 2 and are wired up for
the first time here.

## Recipe Gallery migration — deferred by owner decision

No real Recipe Gallery export sample or documented format exists in this
repo or the canonical docs (§58.2: "the exact mapping depends on the real
Recipe Gallery data"). Per an explicit owner decision during this pass, no
`/import/gallery` route or Recipe-Gallery-specific parser was built. The
shared deterministic import architecture below is the swappable
`rawSource → structuredProposal → review → confirm` pipeline
(ARCHITECTURE_PROPOSAL.md §L) a future Gallery-specific parser stage would
plug into without touching review/confirm/creation — and the paste-and-review
importer serves as the interim migration path (Roadmap's own fallback
option 4) until real export data is available. This is not a completed
requirement — flagging prominently, not burying it.

## Paste-and-review import (`/recipes/import`)

- `src/lib/importExport/paste-parser.ts` — pure, DB-free deterministic
  parser (`parsePastedRecipe`). Recognizes `Ingredients:`/`Instructions:`/
  `Directions:`/`Steps:`/`Method:` headings, generic colon-terminated
  sub-headings (new named Sections, §9.3's "For the sauce:" convention),
  numbered/bulleted steps, and ingredient lines (leading quantity/range/
  approximate + a ~50-word unit list, reusing `parseQuantityText` — moved
  from `number-field.tsx` to the new framework-agnostic
  `src/lib/dishes/quantity-text.ts` so both the client field and this
  server-side parser share one fraction/mixed-number rule). A line that's
  long and appears before any structure is recognized is flagged instead of
  guessed at, landing in a trailing "Needs review" Section as its own
  editable Instruction row — nothing is ever silently dropped. Every parsed
  ingredient's raw source line is preserved via `originalImportedText`.
- `src/lib/importExport/service.ts` — `proposeImportFromPaste` (pure parse,
  no persistence) and `confirmImport`, which calls
  `dishes/service.ts#createDish` directly (extended with an optional
  `source` param that sets `sourceKind: "IMPORT"`) — the exact same
  transaction every ordinary Recipe save uses, never a parallel path.
- `DishEditor` (`dish-editor.tsx`) gained three optional props —
  `initialValues`, `onCreate`, `heading` — so the review step reuses the
  entire ordinary create-mode editor/validation/Save UI, pre-filled with the
  parser's proposal. `PasteImportFlow` (new client component) is the
  two-step wizard: paste → parse (no persistence) → review in `DishEditor`
  → Save (via `confirmImport`). The original pasted text stays visible
  (collapsible) throughout review, never persisted. Canceling before Save
  creates nothing (§56.1) — there's no draft system to bypass.

## Export tiers (§55.2-§55.6)

`src/lib/importExport/export-dto.ts` — explicit field-whitelisting DTO
builders (named properties only, never `{ ...row }`), served by
`GET /api/export/dish/[dishId]?kind=&tier=&versionMode=&versionId=`
(owner-scoped lookup, 404 for another owner's Dish). Defaults to the
current Version only; the dialog also offers picking one historical Version
or an explicit "Include all Versions" mode — see the correction section
below (§55.2 offers "one Version or full history" as alternatives; the
original pass chose full history unconditionally, corrected here to a real
picker).

- **STANDARD**: content + aggregate rating + count only.
- **DETAILED**: adds per-rating evidence (value, session outcome,
  Version label) with Taster identity anonymized as "Taster 1", "Taster 2"
  (stable per-export ordinal — no separate "reveal names" toggle exists
  anywhere in this codebase yet, so this tier is always anonymized, matching
  §55.4's default).
- **FULL_PRIVATE_HISTORY**: adds real Taster names, Cooking notes, and
  Session Reviews per Cooking Session.

Per-Dish "Export" action (tier picker with the required privacy warning on
the full-private-history option) lives in `dish-detail-actions.tsx`'s
overflow menu.

## Full account data export (§55.1)

`buildAccountBackupDto` (same file — kept to avoid needless churn, see the
correction section below), served by `GET /api/export/account`, linked from
`/profile` ("Export my data", with its own privacy note). This is a
structured data export, not a restorable backup — see the correction
section below.
Covers Dishes/Versions/Sections/Ingredients/Instructions/PartLinks, Tags,
Flavor Profiles, preferred-unit overrides, Tasters, Cooking Sessions
(notes, reviews, ratings), Grocery Categories, Grocery Lists/items, Meal
Plans/entries/planned meals, and preferences — every model
`User`/`Account`/`Session`/`Verification` (passwords, provider credentials,
session tokens) is never queried at all, so those fields are excluded by
construction, not redaction. `ShareLink`/`DirectShare` are also
deliberately excluded — no sharing creation path exists anywhere in this
codebase yet (Tier 2, Slice 16), same reasoning
`api/images/[assetId]/route.ts` already documents for its own share-token
branch. Flagged here so Slice 16 adds a sharing section to this backup
rather than discovering it's missing.

## Privacy and authorization

Both export/backup Route Handlers require a session and never accept a
`dishId` without an owner-scoped lookup (mirrors `getOwnedDishOrThrow`'s
pattern). `imageAssetId` is included as an internal DishFrame reference only
— not independently portable, and the image binary itself is never included
in export output (corrected below); the Blob `storageKey` is never included
anywhere in export output either — verified by a dedicated poison-field
unit test.

## Schema/migration

None. `Ingredient.originalImportedText` and `SourceKind.IMPORT` already
existed; this slice is the first to write/read them.

## Tests

- `paste-parser.test.ts` (12 cases): headings, sub-headings, numbered
  steps, range/approximate/fraction/mixed-number quantities, free-text
  fallback (§10.7), needs-review flagging, no-invented-linked-Parts,
  empty-input handling.
- `export-dto.test.ts` (2 cases): poison-field unit tests — a raw-row-shaped
  object with extra `password`/`sessionToken`/`storageKey` fields, proving
  the DTO builders never surface them.
- `import-export.integration.test.ts` (7 cases): `confirmImport` → real
  `createDish` + `sourceKind: IMPORT` + `originalImportedText` persisted;
  `proposeImportFromPaste` creates no DB rows; all three export tiers'
  inclusion/exclusion boundaries; cross-owner export rejection
  (`NotFoundError`); full-account backup covering Dish content, Tasters,
  Cooking history, Grocery Categories/Lists, and Meal Plans, scoped to the
  correct owner only.
- `paste-import-flow.test.tsx` (4 cases): parse → review hand-off, needs-
  review banner, discard-and-restart, parse-error handling.
- `dish-editor.test.tsx` (38, pre-existing) and `dishes.integration.test.ts`
  (100, pre-existing) still pass unmodified after `DishEditor`'s new props
  and `createDish`'s new optional `source` param.
- Playwright: `tests/e2e/paste-import.spec.ts` — paste → review → correct
  the one line the deterministic parser flagged as needing review → confirm
  → find it in `/recipes`. Run twice via
  `npx playwright test tests/e2e/paste-import.spec.ts --project=chromium --workers=1`,
  both green (~4-7s).

## Verification

`pnpm run verify:feature`: format/lint/typecheck/build clean. 350 frontend
tests (up from 306), 235 backend integration tests (up from 228),
protected-object/migration scans clean.

## Manual review targets

- Paste-import wizard layout (textarea sizing, needs-review banner
  placement, "Show original pasted text" toggle) — no frontend design pass
  applied yet.
- Export-tier and Version-picker dialog copy/layout on
  `dish-detail-actions.tsx` and the `/profile` "Export my data" card
  (resolved by the correction pass below: current-Version default, explicit
  historical-Version or all-Versions choice — no longer an open question).

## Limitations / deferred

- **Recipe Gallery-specific importer is not built** (see above) — the
  single largest deviation from the Build Plan's literal route list, made
  as an explicit owner decision this pass rather than guessed at.
- The deterministic parser's accuracy is inherently limited by input
  variety (Build Plan's own named risk) — mitigated by mandatory review,
  not by parser sophistication.
- No AI-assisted parsing (§59.3, correctly out of scope — Tier 3).
- `/parts/import` does not exist — Build Plan's route list only names
  `/recipes/import`.

## Correction pass — export correctness and terminology (2026-07-31)

Owner-directed correction to the export tiers/backup work above. Full
Version history was previously implicit on every individual export, and the
account export's own copy overclaimed "backup"/portable-image-reference
language it can't back up. Both are now settled product decisions, applied
here.

**Terminology.** The account export is a structured **data export**, not a
restorable backup — it never included image binaries and still has no
restore/import path. User-facing copy (`/profile`'s "Export my data" card)
and route/module doc comments now say so plainly; `imageAssetId` is
documented as an internal DishFrame reference only, never as "portable."
Internal names (`buildAccountBackupDto`, `/api/export/account`) were kept to
avoid needless churn — only public/canonical language changed.

**Envelope.** Both `buildDishExportDto` and `buildAccountBackupDto` now
return a stable `{ format, formatVersion: 1, exportedAt, scope, ... }`
envelope (`export-dto.ts`). `scope` carries `exportType`/`tier` plus
`versionMode` (`SINGLE`/`ALL`) and, for a single-Version export, the
selected Version's id and label. Still an explicit allowlist — no
schema-version, credential, Blob-key, or other internal-only field is
exposed.

**Headers.** Both export Route Handlers now send `Cache-Control: private,
no-store` alongside the existing JSON content type and
`Content-Disposition: attachment`. `sanitizeExportFilename` (new,
`export-dto.ts`) centralizes title-to-filename sanitization: only
alphanumerics/space/`.`/`-` survive, so a hostile title can never inject
CRLF/quote header content; falls back to `export.json` for a blank title.
The account export's filename dropped "backup" wording
(`dishframe-account-export-YYYY-MM-DD.json`).

**Version selection.** `buildDishExportDto` takes an optional
`DishVersionSelection` (`{ mode: "SINGLE", versionId? }` or
`{ mode: "ALL" }`; defaults to `SINGLE` with no `versionId`, which resolves
to the Dish's current Version). The export dialog
(`dish-detail-actions.tsx`) gained one `Select` covering every existing
Version plus "Include all Versions" — one coherent control, never an
ambiguous specific+all state — defaulting to the current Version each time
the dialog opens and applying to all three privacy-tier download links.
Stable Dish metadata (title, stage, cuisine, tags, Flavor profiles) was
already sourced from the Dish row rather than the Version, so it needed no
change.

**Evidence scoping.** `ratingRowsForDish`/`buildDetailedEvidence`/
`buildFullPrivateHistory` all take an optional `versionId` filter.
Aggregate rating/count, per-rating evidence, and private Cooking Session
evidence are now scoped to the exported Version(s) only — a `SINGLE` export
never surfaces another Version's evidence; an `ALL` export retains each
rating's/session's `versionLabel` provenance (already present on those
rows, now verified by test). The account export is unaffected — it still
carries every owned Dish's complete Version history regardless of any
individual-export Version selection.

**Tests.** `export-dto.test.ts` gained `sanitizeExportFilename` unit
coverage (safe passthrough, header-injection stripping, blank-title
fallback, determinism). `import-export.integration.test.ts` gained: current-
Version-default scoping, explicit historical-Version scoping (content,
aggregate rating, and session evidence all excluding the other Version),
ALL-Version provenance retention, an unknown-`versionId` rejection, and
envelope/format-version assertions on both dish and account exports; the
account-backup test now also asserts complete Version history survives a
Version bump. New `route.integration.test.ts` files (dish and account
routes) cover session/owner authorization, header values, filename
sanitization against a header-injection attempt, and `versionMode` query
validation. New `dish-detail-actions.test.tsx` covers the export dialog's
Version `Select`: current-Version default, switching to a historical
Version, switching to "Include all Versions" with no `versionId` ever
present alongside it, the default resetting on dialog reopen, and the
selection applying to all three tier download links.

Narrowly targeted commands actually run this pass: the new/updated
`export-dto.test.ts`, `dish-detail-actions.test.tsx`,
`import-export.integration.test.ts`, and both new
`route.integration.test.ts` files (30 tests total, all green), plus a
project-wide `tsc --noEmit` to confirm the signature changes didn't break
any caller. No broader command (`verify:feature`, `verify:all`, full
suites, Playwright) was run — final verification is intentionally left to
the owner, per standing policy.

**Genuine remaining limitations.** Image binaries are still never included
in either export, and there is still no import/restore path for the
account export (unchanged from the original slice, now accurately
documented rather than overclaimed). The Version `Select` lists every
Version with no pagination — fine at current Version-count scales, but
untested at a large Version history.
