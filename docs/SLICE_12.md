# Slice 12 — Standalone grocery lists and grocery categories

Closes PRODUCT_SPEC.md §60-65's "Grocery lists" acceptance group, in
`STANDALONE` mode only. This is the last Tier 1 slice — Review Gate 5 and
the seed-process update are deliberately **not** done in this pass, per the
prompt's instructions.

No schema/migration change — `GroceryList`/`GroceryListSource`/
`GroceryListItem`/`GroceryItemContribution`/`IngredientCategoryMemory`
already existed (Slice 2/Slice 2 follow-up) and are exercised for the first
time here. Grocery Category management itself (create/rename/reorder/
delete, fallback protection) already shipped in the Slice 2 follow-up and
is untouched.

## New modules

- `src/lib/grocery/ingredient-gather.ts` — recursive Section+PartLink walk
  producing flat ingredient "slots" (primary + optional saved substitute,
  `isOptional`). Deliberately its own walker rather than reusing
  `cooking/queries.ts#buildCookableUnits`: that function strips
  `isOptional`/`substitute` (not needed for a cooking checklist) and, by
  design, does **not** compound a nested Part's multiplier with its
  ancestors' (each Part is independently re-plannable in Cooking Setup).
  Grocery generation offers no per-nested-Part selection — a nested Part's
  multiplier genuinely composes multiplicatively down the chain (1.5x a
  Part that itself uses 3x of a nested Part needs 4.5x of that nested
  Part's ingredients overall). Verified by an integration test.
- `src/lib/grocery/combine.ts` — pure safe-combination matching (§61):
  exact normalized-name equality + identical/convertible units. A range
  quantity, free text, or unrecognized unit (`"can"`) never auto-combines.
  15 unit tests, including both §61.1/§61.2 named examples.
- `src/lib/grocery/list-service.ts` — `generateGroceryList` (one
  transaction: `GroceryList` + `GroceryListSource` snapshots + combined
  `GroceryListItem`/`GroceryItemContribution` rows, category assigned from
  `IngredientCategoryMemory` else the fallback category),
  `preview`/`applyGroceryListSourceRefresh`, `toggleGroceryItem`,
  `addManualGroceryItem`, `editGroceryItem`, `removeGroceryItem`,
  `recategorizeGroceryItem`, `reorderGroceryListItems`,
  `combineGroceryItems` (manual merge), `uncombineGroceryItem`,
  `switchGroceryItemToSubstitute`, `completeGroceryList`,
  `reopenGroceryList`, `duplicateGroceryList`, `deleteGroceryList`,
  `renameGroceryList`.
- `src/lib/grocery/queries.ts` — added `listGrocerySourceCandidates`,
  `getOwnedGroceryListOrThrow`, `listGroceryListsForOwner`.
- `src/lib/grocery/list-schema.ts` / `list-actions.ts` — zod schemas + "use
  server" action wrappers, one per service function above.
- UI: `/grocery-lists` (source-selection + active/completed list index),
  `/grocery-lists/[id]` (category-grouped detail view) —
  `grocery-source-picker.tsx` reuses Cooking Setup's `ScaleControl` for
  each source's target-amount entry; `grocery-list-detail-view.tsx` covers
  checkoffs, manual add, category reassignment, combined-item source
  breakdown, uncombine, manual-merge selection mode, substitute switch,
  up/down reordering within a category, source-refresh preview dialog, and
  the list-level rename/complete/reopen/duplicate/delete menu.

## Snapshot, scaling, and combination

Generation always uses the source Dish's **current** Version at generation
time; `GroceryListSource` stores `dishId`/`dishVersionId` plus a durable
title/kind/Version-label snapshot (`onDelete: SetNull` on the live FK, so a
later permanent deletion leaves the snapshot readable — verified). Every
`GroceryItemContribution` stores its own denormalized
name/quantity/unit — a later Recipe/Part edit never touches an already-
generated list (verified: editing a source Recipe's ingredient after
generation leaves the list's stored quantity unchanged).

Combination groups newly-generated contributions by `combine.ts`'s
matching rule and creates one `GroceryListItem` per group. **Uncombine**
fully reverses this — one `GroceryListItem` per original contribution
(the exact "keep separate" outcome), not a partial name-only regroup.
**Manual merge** (`combineGroceryItems`) lets the user deliberately
combine items the conservative matcher rejected (e.g. "1 can tomatoes" +
"400 g tomatoes"); when the merged contributions aren't uniformly
convertible, the item falls back to a concatenated quantity display
(`"1 can + 400 g"`) rather than fabricating one arithmetic total.

## Optional ingredients and substitutes — a scoped design choice

Optional ingredients are included by default, marked `isOptional`, and
removable via `removeGroceryItem`. The primary ingredient is always used at
generation; `switchGroceryItemToSubstitute` lets the user switch a
single-contribution item to its saved substitute afterward, re-deriving the
substitute's values by re-walking the pinned (immutable) source Version at
the source's own stored `scaleFactor` — it throws on a combined
(multi-contribution) item, asking the user to uncombine first, since a
substitute swap can silently break the combinability that put those
contributions together.

**Both §11.5/§62.1/§62.2 bullets list "before generation" as one of two
available entry points** ("before or after generation" for optional
removal; "before generation; while editing the generated list" for
substitutes). This slice implements only the post-generation entry point
for each — the source-selection screen selects whole Recipes/Parts only,
with no per-ingredient customization step, matching Cooking Setup's own
established precedent (its equivalent Setup screen has no per-ingredient
optional/substitute controls either). Each spec bullet's requirement is
still met (every entry point it names is an "or", not an "and"), but this
is a real scope choice made without an explicit owner check-in first,
flagged here per AGENTS.md's deviation policy — happy to add the
pre-generation customization step if the owner wants it.

## Source refresh (§60.4/§60.5)

`previewGroceryListSourceRefresh` defaults its target to the source's own
major line's highest minor (never auto-offering a newer major line, per
§60.4's own example); an explicit `targetVersionId` supports the
"deliberately choose another major Version" path. `apply` only touches the
refreshed source's own contributions — matched, updated, added, or removed
by `ingredientLineageId` — leaving every other item, source, and manual
edit in the list untouched (verified: an unrelated manual item's checkoff
survives a refresh).

## Category assignment

Generation and refresh both look up `IngredientCategoryMemory` by
normalized ingredient name, falling back to the account's protected
fallback category (never left uncategorized). `recategorizeGroceryItem`
upserts that memory and never touches `Dish`/`DishVersion` (verified: no
new Version is created).

## Completion / reopen / duplicate / delete

Every mutating item/source action rejects on a completed list
(`ValidationError`) except reopen; `duplicateGroceryList` copies
sources/items/contributions into a fresh independent list with every
checkoff reset (a new shopping trip, not a continuation).

## Tests

- `combine.test.ts` — 15 unit tests (both §61.1/§61.2 example sets, count-
  based combination, range/free-text/unrecognized-unit exclusion,
  transitive grouping).
- `grocery-list.integration.test.ts` — 21 tests: generation/combination/
  optional/substitute defaults, nested-Part multiplier composition,
  snapshot immutability against a later source edit, deleted-source
  retention, category-memory assignment, cross-owner authorization,
  uncombine round-trip (no contribution lost), manual merge fallback
  display, substitute switch (single- and rejected multi-contribution),
  `recategorizeGroceryItem`'s no-new-Version guarantee, completion
  freeze/reopen, duplication, and refresh preview+apply (including the
  deleted-source rejection case).

Narrowly targeted commands actually run this pass: `tsc --noEmit`
(repeatedly, clean throughout); `vitest run` on `combine.test.ts` and both
`src/lib/grocery/*.integration.test.ts` files (36 new + 9 pre-existing
tests, all green); a dev-server smoke check confirming `/grocery-lists`
and `/grocery-lists/[id]` compile and redirect correctly when signed out,
with no server-side error in the log. No broader command (`verify:feature`,
`verify:all`, full suites, Playwright) was run — final verification is
intentionally left to the owner, per standing policy.

## Manual review targets

- Source-selection and generated-list-view layout/visual design — no
  frontend design pass applied yet (same status Slice 11 flagged for its
  own new screens).
- Item reordering is up/down buttons within a category group, not
  drag-and-drop (a scope decision, unlike Grocery Categories' own
  drag-and-drop reorder) — confirm this is an acceptable interaction, or
  request drag-and-drop parity.
- "Switch to substitute" is shown on every single-contribution,
  non-manual item regardless of whether a substitute actually exists;
  clicking one without one surfaces an error message rather than being
  hidden/disabled ahead of time — minor discoverability rough edge worth a
  look.
- No full interactive browser walkthrough was performed (no logged-in
  session was created) — recommend at least a brief sanity check of
  generate → check off → complete → confirm frozen before broader use.

## Owner intervention recommendation

**Focused manual review**, targeted at two things: (1) the scoped design
choice above — deciding whether pre-generation per-ingredient optional/
substitute customization is actually wanted, since that's a product
decision, not a bug; and (2) a quick generate → check off → uncombine/
combine → refresh → complete → confirm-frozen walkthrough, since no
interactive browser session was used during implementation. Everything
else (combination correctness, snapshot immutability, authorization,
category-memory behavior) is covered by the integration tests above and
doesn't need a manual pass.

## Genuine limitations

- Pre-generation per-ingredient optional-removal/substitute-selection is
  not built (see "a scoped design choice" above) — both are available
  post-generation only.
- Refresh operates on one source at a time; no bulk "refresh all" action.
- `switchGroceryItemToSubstitute` requires a single-contribution item and
  a still-resolvable source (not permanently deleted).
- Category-name matching (both combination and `IngredientCategoryMemory`)
  is exact trim+lowercase — no stemming/pluralization normalization,
  consistent with the deliberately conservative combination rule.
- `MEAL_PLAN_LINKED` mode, pantry inventory, and retailer aisle
  mapping remain entirely out of scope (Tier 2/Slice 15, per §63.5/§64).
