# Slice 10 — Search, filtering, sorting, tags, Favorite, cuisine, Flavor profiles

Closes PRODUCT_SPEC.md §43-50/§79 for both Recipe and Part libraries. No
schema/migration change — `Dish.currentTitle`/`currentStructuralSearchText`,
their trigram indexes, `Tag`/`DishTag`, and `FlavorProfileValue`/
`DishFlavorProfile` all already existed from Slice 2; this slice is the first
to actually populate/query/attach them.

## Search, filter, sort architecture

`src/lib/dishes/library-filters.ts` is a new, entirely DB-free module: types
(`LibraryFilters`, `LibrarySortValue`, `RatingFilterValue`), URL
parse/serialize (`parseLibrarySearchParams`/`libraryFiltersToSearchParams`),
`buildLibraryWhere` (AND across categories, OR within Stage/cuisine,
match-all for tags/Flavor profiles per §47.4-47.7), `computeSearchTier`
(§44.5's exact/prefix/partial-title → cuisine → Flavor profile → tag →
structural-text ranking), and `compareDishesForSort`/
`compareDishesForLibrary` (§48's sort rules, tier-first when searching,
selected Sort as tiebreaker). Keeping this pure (no Prisma) is what makes the
ranking/sort/filter-combination logic directly unit-testable against the
spec's own examples, per the Build Plan's ask.

`dishes/queries.ts`'s new `queryDishLibrary` is the one query the library
page needs: a single `Dish.findMany` (base filters AND, plus a broad OR
pre-filter across every searchable field when a query is present, including
live joins to `DishTag`/`Tag` and `DishFlavorProfile`/`FlavorProfileValue` —
never denormalized, per Arch round-3 Correction 6), then batches principal
ratings (`getPrincipalRatingsForDishes`, reused from Slice 9) and, only when
the sort needs it, Last-cooked (`getLastCookedAtForDishes`, a new batched
sibling of Slice 9's per-dish `getLastCookedAt` in `cooking/queries.ts`).
Ranking/filtering/sorting then run in JS via `library-filters.ts` —
proportionate to a personal library's scale rather than a second
per-candidate round trip.

Stage's own value set already includes `ARCHIVED` (§43.3), so the old
`?archived=1` link/`includeArchived` prop is gone — Stage defaults to
excluding `ARCHIVED`, and selecting it as a Stage filter chip is the one and
only way archived items appear.

## Tags, Favorite, cuisine, Flavor profiles

- **Dish-metadata attachment** (`src/lib/dishes/dish-metadata.ts`, new):
  `setDishTags`/`setDishFlavorProfiles` (full-replace, ownership- and
  identity-validated) and `toggleFavorite` — direct `DishTag`/
  `DishFlavorProfile` writes, entirely outside `createDish`/`editDish`'s
  Version-creation machinery, the same reasoning that gave Stage its own
  `updateDishStage` in Slice 9. Neither creates a Version (§45.2/§79.2).
- **Flavor Profile management** (`src/lib/flavor-profiles/*`, new): mirrors
  `tasters/service.ts`'s shape — create/rename/reorder/delete only, no
  archive (§79.3). Rename-to-an-existing-value merges (same identity-
  collision handling as Tag's §45.6, since the underlying
  `ownerId+normalizedName` uniqueness is the same shape).
- **Tag management UI** (`src/components/app/tag-manager.tsx`, new,
  `/tags` + inline in `/settings`): flat, unordered list; Favorite pinned
  first and protected from rename/merge/delete; rename-to-an-existing-tag
  shows an explicit "Merge into X?" confirm (§45.6); delete shows the
  affected-item count (§45.7, via new `listTagsWithUsageCount`).
- **Flavor Profile UI** (`/flavor-profiles` + inline in `/settings`):
  drag-reorder, mirroring `TasterManager`.
- **Detail page**: `FavoriteToggle` (one-tap star, optimistic) and
  `DishTagFlavorEditor` (popover multi-select, Save writes both tags and
  Flavor profiles) sit beside cuisine in the existing chips row
  (`dish-detail-view.tsx`). Cards show a small Favorite star indicator.

## Library UI

`LibraryFilterBar` (new): search box, Stage/Tag/Cuisine/Flavor-profile
popovers, Rating select, Sort select, and an active-filter chip row with
per-criterion remove + "Clear all" (§47.8) — every change is a URL
navigation (`router.push`), so the server component re-runs
`queryDishLibrary`; no client-held filter state. `DishLibraryView`/
`DishLibraryDisplay` were rewired to source filters from `searchParams`
(`recipes`/`parts` `page.tsx`) and distinguish an ordinarily-empty library
from a filtered no-result state (§50.3) via `isDefaultLibraryFilters`.

## Tests

- `library-filters.test.ts` (31 cases): parse/serialize round-trip,
  filter-combination shapes (§47.4-47.7's examples), the exact-title-vs-
  cuisine ranking case (Arch round-3 Correction 6), rating-filter/sort
  behavior including a provisional rating's numeric ordering (§48.4).
- `flavor-profiles.integration.test.ts` (8 cases), `dish-library.integration.test.ts`
  (12 cases, new): dish-metadata auth/behavior; `queryDishLibrary` end-to-end
  (Stage=Archived inclusion, AND+match-all combination, rating filter/sort,
  search ranking); a cuisine edit, a tag rename, and a Flavor-profile merge
  each immediately reflected in search with no explicit refresh step.
- Component: `library-filter-bar.test.tsx` (9 cases, URL/query-state),
  `dish-tag-flavor-editor.test.tsx` (2 cases), updated
  `dish-library-display.test.tsx` (adds the empty-vs-no-results cases).
- `TagManager`/`FlavorProfileManager` have no dedicated component test,
  consistent with the existing untested `TasterManager`/
  `GroceryCategoryManager` precedent this slice mirrors.
- Playwright: `tests/e2e/library-search-and-filters.spec.ts` — creates two
  Recipes, applies a Stage+Cuisine+Tag combination, confirms only the
  matching Recipe shows and the active-filter chips match §47.8's example,
  then Clear all restores both. Written, not run.

## Verification

`pnpm run verify:feature`: format/lint/typecheck/build clean (two
`react-hooks/set-state-in-effect` lint errors from prop-driven local state
in `FavoriteToggle`/`LibraryFilterBar` were fixed by adjusting state during
render instead of in an effect, per React's own guidance — not deferred).
325 frontend tests (up from 281), 224 backend integration tests (up from
199), protected-object/migration scans clean.

## Manual review targets

- Filter-bar layout/wrapping on phone width; popover checkbox lists at
  narrow viewports.
- Favorite star legibility on cards (both themes) and the detail-page
  toggle's pressed state.
- "Merge into X?" tag-rename confirm wording/placement.
- No-matches vs. empty-library copy distinction.

## Limitations / deferred

- ~~Search's "tolerant of ordinary punctuation differences" (§44.5) is
  satisfied via case-insensitive substring matching only, not
  punctuation-agnostic matching~~ — fixed in the correction pass below;
  see that section for the current behavior.
- Each filter-popover checkbox navigates immediately (no batched "Apply");
  simplest correct behavior, but rapid multi-select causes one navigation
  per click rather than one at the end.
  - **Correction:** this originally caused a real data-loss race, not just
    the extra-navigations cost noted above — `navigate()` built each next
    URL from the `filters` prop, and since `router.push` resolves async, a
    second rapid click read the same stale prop and clobbered the first
    click's change instead of composing with it (caught by
    `tests/e2e/library-search-and-filters.spec.ts`'s multi-criterion case).
    Fixed by mirroring `filters` in local state, updated synchronously in
    `navigate()` before the `router.push` call, so rapid clicks compose off
    the latest local selection instead of the last-confirmed server props.
- Tag/Flavor-profile popover checkbox toggles in the filter bar and the
  detail-page editor have no visual design pass beyond reusing existing
  primitives — final layout is open for frontend design work, same as
  other recent slices' nesting-hint disclaimers.

## Correction pass (post-Slice-10 review)

- **Relevance vs. explicit Sort precedence.** The original report's "tier
  first, selected Sort as tiebreaker" applied unconditionally whenever
  searching — wrong once a Sort is explicitly chosen. Corrected:
  `LibraryFilters` gained `sortIsExplicit` (true only when the URL's `sort`
  param was present and valid — distinct from an absent param defaulting to
  `RECENTLY_UPDATED`). `compareDishesForLibrary` now bypasses tier ranking
  entirely when `sortIsExplicit` is true, letting the chosen Sort (Highest
  rated, Alphabetical, Recently cooked, etc.) order every match directly;
  tier-first + Recently-updated-tiebreaker remains the behavior only when no
  Sort was explicitly selected. `LibraryFilterBar`'s Sort dropdown always
  sets `sortIsExplicit: true` on change (even when the picked value equals
  the default), and `libraryFiltersToSearchParams` serializes `sort` in that
  case too, so the distinction survives a full URL round-trip.
- **Grid/list view verification.** Confirmed already correct: `DishLibraryDisplay`
  toggles view purely via local React state + `localStorage`, never touching
  the router — search/filter/sort params and Recipe/Part scope (all URL-encoded)
  are structurally unaffected by a view switch. Added coverage proving both
  views render the identical ID/order sequence and that switching views never
  calls `router.push`.
- **Favorite decision unchanged.** No functional or accessibility regression
  found — cards already show a read-only Favorite star, the one-tap toggle
  already lives only on the detail page, and Favorite is already filterable
  via the ordinary Tag popover. No changes made.
- **Structural search freshness — real bug fixed.** `Dish.
  currentStructuralSearchText` was built from Section names only;
  `insertSections`'s five write-sites never actually included linked
  Part titles despite the Build Plan's own description of tier 7 as
  "Section names + linked Part-Version titles." Centralized the rebuild
  into one `structuralSearchTextFor` helper (Section names + each direct
  PartLink's target Dish's *current* `currentTitle`, resolved live at
  rebuild time, not the frozen `DishVersion.title` snapshot) used by all
  six Version-creating call sites (create/edit/promote/propagate/duplicate/
  resolve-part-usage). Since a Part's title can change without creating a
  Version (§7.1), added `refreshStructuralSearchTextForPartUsages` — run
  whenever `editDish` changes a Part's title (both the no-Version and
  Version-creating branches) — which finds every current parent still
  directly linking that Part and recomputes its search text in place.
- **Punctuation tolerance — real gap fixed.** `normalizeForSearch` now
  lowercases and collapses any run of non-letter/non-digit characters
  (hyphens, slashes, ordinary punctuation, and whitespace alike) into a
  single space, so `lemon-garlic`/`lemon garlic`/`lemon/garlic` all
  normalize identically — applied to both `computeSearchTier` and a new
  `searchQueryTokens` used by `queryDishLibrary`'s DB prefilter (tokenizing
  the query and OR-ing every searchable field against each token) so the
  database can no longer discard a punctuation-equivalent match before the
  JS ranking layer ever sees it. The former "case-insensitive substring
  matching" limitation note above is superseded by this fix.
- **Tests.** `library-filters.test.ts` (+16 cases: explicit-vs-default sort
  parsing/serialization, tier-bypass-on-explicit-sort for three sort kinds,
  punctuation-tolerant `computeSearchTier`); `dish-library.integration.test.ts`
  (+5 cases: Section rename refresh + old-term invalidation, linked-Part
  detach/replace refresh, linked-Part-rename cascade refresh across two
  renames, full-path punctuation tolerance); `dish-library-display.test.tsx`
  (+2 cases: identical ID/order across views, no navigation on view switch);
  `library-filter-bar.test.tsx` (+1 case: explicit default-Sort round-trip).
  All existing `dishes.integration.test.ts` (100) and `dish-library.integration.test.ts`
  cases still pass unmodified.
- **Playwright.** Fixed three real, previously-unrun failures (owner-reported,
  debugged with permission): `library-search-and-filters.spec.ts` had an
  accidentally-dropped `page.goto("/settings")` from an earlier locator edit,
  plus locator ambiguity from Slice 10 adding Tag/Flavor-profile managers
  inline in `/settings` (multiple "Add" buttons) and from Stage/Cuisine
  values also appearing as plain text on library cards behind the popover/
  chip row — all now scoped to the relevant form/popover/chip. `recipe-golden-path.spec.ts`
  still referenced the removed "Show archived" link (§43.3 replaced it with
  the Stage=Archived filter chip) — updated to use the Stage popover; this
  also unblocked its serial-mode-skipped second test, which needed no
  changes of its own. `cooking-golden-path.spec.ts` passed cleanly on re-run
  with no code changes. Updated specs were run and verified green; not
  re-run gratuitously beyond confirming each fix.
- **Schema/migration:** none.
- **Remaining limitations:** none known beyond what's already listed above
  (filter-popover immediate-navigation, Tag/Flavor-profile popover visual
  design).
