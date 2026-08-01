# Slice 12 — Standalone grocery lists and grocery categories

Closes PRODUCT_SPEC.md §60-65's "Grocery lists" acceptance group, in
`STANDALONE` mode only. This is the last Tier 1 slice — Review Gate 5 and
the seed-process update are deliberately **not** done in this pass.

`GroceryList`/`GroceryListSource`/`GroceryListItem`/`GroceryItemContribution`/
`IngredientCategoryMemory` already existed (Slice 2/Slice 2 follow-up) and
were exercised for the first time in this slice. Grocery Category management
itself (create/rename/reorder/delete, fallback protection) shipped in the
Slice 2 follow-up and is untouched. Two migrations were added across this
slice's two correction passes (below): `20260801010251_slice12_grocery_
contribution_snapshot_fields` (per-contribution optionality + substitute
snapshot columns) and `20260801035732_slice12_contribution_selected_variant`
(the reversible `selectedVariant` enum column). Both are additive-only,
applied and verified — `db:verify:local`/`db:scan-migrations` both clean.

## New modules

- `src/lib/grocery/ingredient-gather.ts` — recursive Section+PartLink walk
  producing flat ingredient "slots" (primary + optional saved substitute,
  `isOptional`). Deliberately its own walker rather than reusing
  `cooking/queries.ts#buildCookableUnits`: that function strips
  `isOptional`/`substitute` (not needed for a cooking checklist) and, by
  design, does **not** compound a nested Part's multiplier with its
  ancestors' (each Part is independently re-plannable in Cooking Setup).
  Grocery generation offers no per-nested-Part selection — a nested Part's
  multiplier genuinely composes multiplicatively down the chain. Verified by
  an integration test.
- `src/lib/grocery/combine.ts` — pure safe-combination matching (§61):
  exact normalized-name equality + identical/convertible units + matching
  optionality (required and optional never auto-combine, even on an
  otherwise exact match). A range quantity, free text, or unrecognized unit
  (`"can"`) never auto-combines. 19 unit tests.
- `src/lib/grocery/list-service.ts` — `generateGroceryList` (one
  transaction: `GroceryList` + `GroceryListSource` snapshots + combined
  `GroceryListItem`/`GroceryItemContribution` rows), `preview`/
  `applyGroceryListSourceRefresh`, `toggleGroceryItem`,
  `addManualGroceryItem`, `editGroceryItem`, `removeGroceryItem`,
  `recategorizeGroceryItem`, `reorderGroceryListItems`,
  `combineGroceryItems` (manual merge), `uncombineGroceryItem`,
  `selectGroceryItemVariant` (reversible substitute selection — see below),
  `completeGroceryList`, `reopenGroceryList`, `duplicateGroceryList`,
  `deleteGroceryList`, `renameGroceryList`.
- `src/lib/grocery/queries.ts` — `listGrocerySourceCandidates`,
  `getOwnedGroceryListOrThrow`, `listGroceryListsForOwner`.
- `src/lib/grocery/list-schema.ts` / `list-actions.ts` — zod schemas + "use
  server" action wrappers, one per service function above.
- UI: `/grocery-lists` (source-selection + active/completed list index),
  `/grocery-lists/[id]` (category-grouped detail view) —
  `grocery-source-picker.tsx` reuses Cooking Setup's `ScaleControl`;
  `grocery-list-detail-view.tsx` covers checkoffs, manual add, category
  reassignment, combined-item source breakdown, uncombine, manual-merge
  selection mode, reversible substitute selection ("Use substitute"/"Use
  original"), up/down reordering within a category, source-refresh preview
  dialog, and the list-level rename/complete/reopen/duplicate/delete menu.

## Snapshot, scaling, and combination

Generation always uses the source Dish's **current** Version at generation
time; `GroceryListSource` stores `dishId`/`dishVersionId` plus a durable
title/kind/Version-label snapshot (`onDelete: SetNull` on the live FK, so a
later permanent deletion leaves the snapshot readable — verified). Every
`GroceryItemContribution` stores its own denormalized
name/quantity/unit/`isOptional` plus a full substitute snapshot (see below)
— a later Recipe/Part edit never touches an already-generated list
(verified).

Combination groups newly-generated contributions by `combine.ts`'s matching
rule (name + unit + **optionality**) and creates one `GroceryListItem` per
group — applies uniformly to generation, refresh's "added" fold-in, and
`recomputeItemAggregate`'s uniformity check, since all three route through
`canCombine`/`groupForCombination`. **Uncombine** fully reverses combination
— one `GroceryListItem` per original contribution, each restoring its own
`isOptional` from its own contribution row, not the combined item's
aggregate. **Manual merge** (`combineGroceryItems`) lets the user
deliberately combine items the conservative matcher rejected, including
across differing optionality (§61.5) — see "Mixed optionality display"
below for how that's represented truthfully; when the merged contributions
aren't uniformly convertible, the item falls back to a concatenated
quantity display (`"1 can + 400 g"`).

## Reversible substitute selection (§60.3/§62.2)

Every `GroceryItemContribution` permanently carries **two** frozen
snapshots — its primary ingredient fields (`originalName`/
`quantityDecimal`/`quantityText`/`unit`) and, when the ingredient has a
saved substitute, a `substitute*` snapshot at the same generation-time
scale. A `GroceryContributionVariant` enum column, `selectedVariant`
(`PRIMARY` default / `SUBSTITUTE`), records which one is currently
effective — **neither snapshot is ever overwritten or cleared** by
selecting the other. `selectGroceryItemVariant(ownerId, listId, itemId,
variant)` replaces the old destructive "switch" operation: it only ever
flips `selectedVariant` and recomputes the owning `GroceryListItem`'s
displayed name/quantity/unit from whichever snapshot is now effective
(`recomputeItemAggregate`, via a shared `effectiveContributionFields`
helper used everywhere a contribution's display value is read: aggregation,
combinability checks, and the non-uniform-merge concatenated fallback).

Selection is reversible in both directions, repeatedly, and requires only
the list's own persisted data — it never re-reads source content, so it
works identically after the source Recipe/Part is edited, superseded by a
newer Version, or permanently deleted (§60.6). Preconditions unchanged from
the original single-direction design: rejects a manual item (no
contribution to select on), rejects a multi-contribution (combined) item
(uncombine first, §61.4), and rejects selecting `SUBSTITUTE` when no
substitute snapshot is stored. Completed-list mutation protection and owner
authorization are enforced the same way as every other mutation.
Duplication copies both snapshots and the selected variant.

**Refresh** (`applyGroceryListSourceRefresh`) updates both frozen snapshots
from the freshly-resolved occurrence and decides `selectedVariant` for the
refreshed contribution: a `SUBSTITUTE` selection is preserved when the
refreshed Version still has a substitute (showing the refreshed substitute
values), reverts to `PRIMARY` when the refreshed Version no longer has one,
and a `PRIMARY` selection is never disturbed by a newly-appearing
substitute. Only the refreshed source's own contributions are touched —
unrelated sources, manual items, checkoffs, and categories are unaffected
(verified).

## Optional ingredients — a scoped design choice (unresolved)

Optional ingredients are included by default, marked `isOptional`, and
removable via `removeGroceryItem`. The primary ingredient is always used at
generation.

**Both §11.5/§62.1/§62.2 bullets list "before generation" as one of two
available entry points.** This slice implements only the post-generation
entry point for each — the source-selection screen selects whole
Recipes/Parts only, with no per-ingredient customization step, matching
Cooking Setup's own established precedent. Each spec bullet's requirement is
still met (every entry point it names is an "or", not an "and"), but this
is a real scope choice made without an explicit owner check-in first,
flagged here per AGENTS.md's deviation policy — happy to add the
pre-generation customization step if the owner wants it. (Unchanged by
either correction pass.)

## Mixed optionality display (§61.1/§61.5)

A manual merge may deliberately combine a required and an optional
contribution — auto-combination never does this, since `canCombine`
rejects any optionality mismatch. A multi-contribution `GroceryListItem`'s
own `isOptional` boolean can't honestly represent that mix, so the UI
derives the truthful state directly from each contribution's own
`isOptional` rather than trusting the item-level flag whenever more than
one contribution exists: uniformly-optional groups still show `Optional`;
uniformly-required groups show nothing; a genuinely mixed group shows
`Total (with optional)` instead. The expandable source breakdown marks
each individual optional contribution. No new item-level enum was added —
the state is derived, not persisted.

## Category assignment

Generation and refresh both look up `IngredientCategoryMemory` by
normalized ingredient name, falling back to the account's protected
fallback category (never left uncategorized). `recategorizeGroceryItem`
upserts that memory and never touches `Dish`/`DishVersion` (verified).

## Completion / reopen / duplicate / delete

Every mutating item/source action rejects on a completed list
(`ValidationError`) except reopen; `duplicateGroceryList` copies
sources/items/contributions (including both substitute snapshots and the
selected variant) into a fresh independent list with every checkoff reset.

## Tests

- `combine.test.ts` — 19 unit tests (§61.1/§61.2 named examples, count-based
  combination, range/free-text/unrecognized-unit exclusion, transitive
  grouping, required/optional combine rules).
- `src/lib/grocery/grocery-list.integration.test.ts` — 39 tests:
  generation/combination/optional/substitute defaults, nested-Part
  multiplier composition, snapshot immutability, deleted-source retention,
  category-memory assignment, cross-owner authorization, uncombine
  round-trip, manual-merge-then-uncombine optionality restoration,
  reversible substitute selection (both directions, repeated switching,
  after source edit, after permanent deletion, through duplication,
  rejection cases, completed-list/cross-owner protection), refresh
  (quantity changes, substitute add/replace/remove/preserve/revert,
  unrelated-data preservation), completion freeze/reopen, and the legacy
  category-service re-export.
- `src/lib/grocery/grocery.integration.test.ts` — 9 pre-existing Grocery
  Category tests, unchanged.
- `src/components/domain/grocery/grocery-list-detail-view.test.tsx` (new) —
  10 component tests: "Use substitute"/"Use original" visibility and the
  action each invokes, hidden for no-substitute/manual/multi-contribution/
  completed-list cases, and the mixed-optionality display (`Total (with
  optional)` vs. uniform `Optional`/no-badge, plus the per-contribution
  breakdown marker).

Narrowly targeted commands actually run this pass: `tsc --noEmit` (clean);
`pnpm exec prisma migrate dev --create-only` for the `selectedVariant`
migration (the generated shadow-diff also proposed spurious `DROP
CONSTRAINT`/`DROP INDEX` statements against unrelated protected raw-SQL
objects, per the known shadow-database-diff issue in AGENTS.md's "Database
migrations" section — stripped before applying, leaving only the intended
`CREATE TYPE`/`ALTER TABLE`); `prisma migrate deploy`; `pnpm db:verify:local`
(clean — 16 constraints/7 indexes present); `pnpm db:scan-migrations`
(clean — no unallowed removal across 13 migration files); `prisma generate`;
`vitest run` on `combine.test.ts` (19/19), `grocery-list.integration.test.ts`
(39/39, via `vitest.integration.config.mts`), and the new
`grocery-list-detail-view.test.tsx` (10/10). No broader command
(`verify:feature`, `verify:all`, full suites, Playwright, formatting, lint,
build) was run — final verification is intentionally left to the owner.

## Manual review targets

- Source-selection and generated-list-view layout/visual design — no
  frontend design pass applied yet.
- Item reordering is up/down buttons within a category group, not
  drag-and-drop — confirm this is an acceptable interaction, or request
  drag-and-drop parity.
- No full interactive browser walkthrough was performed during this or the
  original pass — recommend at least a brief sanity check of generate →
  check off → complete → confirm frozen, and a reversible substitute
  selection round-trip, before broader use.

## Owner intervention recommendation

**Focused manual review**, targeted at two things: (1) the scoped
optional-ingredient design choice above — deciding whether pre-generation
per-ingredient customization is actually wanted, since that's a product
decision, not a bug; and (2) a quick generate → check off → uncombine/
combine → select substitute → select back → refresh → complete → confirm-
frozen walkthrough, since no interactive browser session has been used
across either pass. Everything else (combination correctness, snapshot
immutability, reversibility, authorization, category-memory behavior,
mixed-optionality display) is covered by the automated tests above and
doesn't need a manual pass to proceed.

## Genuine limitations

- Pre-generation per-ingredient optional-removal/substitute-selection is
  not built — both are available post-generation only.
- Refresh operates on one source at a time; no bulk "refresh all" action.
- `selectGroceryItemVariant` requires a single-contribution item; a combined
  item must be uncombined first (§62.2's post-generation entry point).
- Category-name matching (both combination and `IngredientCategoryMemory`)
  is exact trim+lowercase — no stemming/pluralization normalization.
- A multi-contribution item's mixed optionality is derived for display only
  — no per-contribution optionality is exposed anywhere selection could
  change it, since selection is blocked on combined items entirely.
- `MEAL_PLAN_LINKED` mode, pantry inventory, and retailer aisle mapping
  remain entirely out of scope (Tier 2/Slice 15, per §63.5/§64).

## Correction history

Two same-day correction passes, both folded into the sections above rather
than left as separate chronological narratives: **correction 1** added
per-contribution optionality and the (then single-direction) substitute
snapshot; **correction 2 (this pass)** made selection reversible and fixed
the mixed-optionality display. Each added one additive-only migration (both
named above); both migrations' generated SQL was inspected before applying,
per AGENTS.md's "Database migrations" policy, stripping the same known
spurious shadow-diff `DROP` proposal each time.
