# Seed review guide (Slices 7–15)

Practical map from the seeded database to what to open for the
comprehensive manual functional/UI/design review. This extends
`docs/MANUAL_QA_SEED.md` (Recipe/Part/Version/propagation/deletion, Slices
1–6) — read that first for setup/safety/signing-in; this file only covers
what Slices 7–15 added on top of it. Not an exhaustive row-by-row listing.

## Reset and load

Same commands as `docs/MANUAL_QA_SEED.md`:

- `pnpm db:seed` — idempotent, **offline** (never contacts Vercel Blob,
  USDA, or any other external service, regardless of what's in
  `.env.local`). Rebuilds every `[QA]`-titled/named row (Dishes,
  GroceryLists, MealPlans, and the three added Tasters) owned by
  `SEED_USER_EMAIL`. Safe to rerun after destructive manual testing. Every
  Recipe/Part is image-less under this command.
- `pnpm db:seed-images` — the same seed, plus the opt-in image fixtures
  (requires `BLOB_READ_WRITE_TOKEN`). See "Image fixtures" below.
- `pnpm db:reset` — destructive full local reset, then `db:seed` (offline;
  run `db:seed-images` afterward for images too).

The owner's own built-in "You" Taster is never deleted/recreated (it's a
protected per-account singleton) — only the three `[QA] `-named Tasters
this pass added are wiped and rebuilt each run.

**Dates are relative to run time, not fixed.** `[QA] This Week`'s entries
are computed from `new Date()` at seed time (e.g. "today", "today − 2
days") so the plan reads as genuinely active/upcoming/past no matter when
you reseed — expect the exact calendar dates to shift between runs; the
structure (allocation states, statuses, sync fixtures) does not.

## Coverage matrix

| Feature | Where to look |
|---|---|
| No nutrition | `[QA] Steamed White Rice` (Part), `[QA] Simple Garden Salad` (Recipe) |
| Manual nutrition, WHOLE basis, primary only | `[QA] All-Purpose Seasoning Blend` |
| Manual nutrition, PER_OUTPUT_UNIT basis, primary + More nutrients | `[QA] Peanut Dipping Sauce` |
| USDA FDC attribution (non-branded) | `[QA] Cauliflower Rice` |
| USDA FDC attribution (branded-style, the post-barcode-scan result stand-in) | `[QA] Garlic Confit` |
| Manual, detached/no source attribution | `[QA] Weeknight Stir-Fry` |
| Ingredient substitute (original ⇄ substitute) | Weeknight Stir-Fry's "Bell pepper" → "Poblano pepper" |
| Extra Tags/Flavor profiles/Favorites for filter diversity | `[QA] Quick`, `[QA] Meal Prep` tags; `[QA] Spicy/Savory/Umami/Citrusy` Flavor profiles; Favorites on Rice Side Dish (Experimental), Peanut Noodle Salad (Proven), Sunday Ramen Project (Active), Cauliflower Rice (Part) |
| Cooking Session — in progress | `[QA] Weeknight Stir-Fry`'s session (whole-session 1.5× scale, mixed checkoffs, one unit rescaled after checkoff — a live progress-conflict badge) |
| Cooking Session — ended early | `[QA] Rice Side Dish` (a unit removed after progress → `removedAfterProgress` evidence) |
| Cooking Session — completed, no Review | The Meal-Plan-linked session on `[QA] Rice Bowl Base` (see Meal Plans below) |
| Cooking Session — completed, rating only | Second `[QA] Peanut Noodle Salad` session (nested Part omitted) |
| Cooking Session — completed, full Review | First `[QA] Peanut Noodle Salad` session (nested Part included, per-unit scales) and `[QA] Sunday Ramen Project`'s session |
| Nested-Part unit selected vs. omitted | Compare Peanut Noodle Salad's two sessions — the nested `[QA] All-Purpose Seasoning Blend` unit is independently included in #1, left out of #2 |
| Tasters — active, archived, rated/unrated per session | "You" (owner), `[QA] Partner`, `[QA] Kid` (active); `[QA] Former Roommate` (archived after rating one session — still visible on that session's own history) |
| Cooking notes independent of Review | Weeknight Stir-Fry's active session, Rice Side Dish, Sunday Ramen Project |
| Stage-suggestion / learning-loop banner | Cook `[QA] Peanut Noodle Salad` again (already PROVEN with a finished session) — the "Change Stage" suggestion should offer ACTIVE |
| Standalone grocery list — active | `[QA] Weeknight Shopping` (2 sources, manual-merge across differing optionality on "Salt," reversible substitute selection on Bell pepper, manual items in a new "[QA] Household" category, a recategorized item, checkoffs, custom order) |
| Standalone grocery list — completed/frozen | `[QA] Pantry Restock` |
| Meal-Plan-linked grocery list — active, with sync flags | `[QA] This Week's Groceries` — see "Linked-list sync states" below |
| Meal-Plan-linked grocery list — completed/frozen | `[QA] This Week's Groceries (Frozen)` |
| Meal Plan — allocation states (under/balanced/over/unknown) | `[QA] This Week`'s 7 authored entries (6 live — see table below) |
| Meal Plan — Recipe and standalone Part entries | All entries are Recipes except the Seasoning Blend Part entry (removed partway through — see below) |
| Meal Plan — Planned/In progress/Cooked/Skipped | All four statuses present — see entry table below. `IN_PROGRESS` is reachable only via a real unfinished Cooking Session (`startSessionFromEntry`, never a forced status field) |
| Meal Plan — linked vs. unlinked Cooking Sessions | Two linked sessions: Rice Bowl Base's first entry (linked + completed, no Review) and Rice Bowl Base's second entry (linked + still `IN_PROGRESS` — never ended). Rice Side Dish is manually marked Cooked without linking its own (separate, `ENDED_EARLY`) session |
| Meal Plan — sticky unacknowledged CHANGED (post-Slice-15 correction) | See "Linked-list sync states" below — Weeknight Stir-Fry-sourced items stay `CHANGED` through unrelated resyncs until acknowledged; one example item is acknowledged, one is left unacknowledged, for contrast. Covered by 2 integration tests in `mealplans.integration.test.ts` |
| Meal Plan — recommendation-ranking inputs | Use "Get recommendations" from `/meal-plans` — Rice Side Dish (Experimental + Favorite) should never outrank Weeknight Stir-Fry (Active, not Favorite) once "include Experimental" is on (§80.3) |
| Meal Plan — duplicated/independent plan | `[QA] Duplicated Next Month` (every entry reset to Planned, including the copy of the in-progress one — duplication never copies a linked session) |
| Image-present Recipes/Parts (`pnpm db:seed-images` only) | 11 of 13 — see "Image fixtures" below |
| Image-empty Recipes/Parts (both `db:seed` and `db:seed-images`) | `[QA] Toasted Sesame Oil Drizzle` (Part), `[QA] Weeknight Stir-Fry` (Recipe) |

## Meal Plan entry allocation table (`[QA] This Week`)

| Recipe/Part | Target yield | Authored yield | Allocation | Status |
|---|---|---|---|---|
| Weeknight Stir-Fry | 6 servings → 8 (changed later) | 4 servings | over | Planned |
| Rice Bowl Base | 3 servings | 2 servings | over | Cooked (linked session) |
| Peanut Noodle Salad | 3 servings | 3 servings | balanced | Skipped |
| Sunday Ramen Project | — | 2 servings | unknown | Planned |
| All-Purpose Seasoning Blend (Part) | — | — (no authored yield) | unknown | *removed partway through the seed* |
| Rice Side Dish | 2 servings | 2 servings | balanced | Cooked (manual) |
| Rice Bowl Base (2nd entry) | 1 serving | 2 servings | under | **In progress** — linked to a real, still-unfinished Cooking Session (`startSessionFromEntry`, never ended) |

## Linked-list sync states (`[QA] This Week's Groceries`)

Built, then deliberately mutated so the review can compare before/after
against the frozen `[QA] This Week's Groceries (Frozen)` list (generated
and completed before these mutations — its items should show no sync
flags regardless, proving the completion freeze, §81.5).

**Acknowledgment does not clear the visible warning.**
`acknowledgeGroceryItemSync` only sets `flagAcknowledgedAt`/
`acknowledgedAt` — it never changes `syncFlag` itself. In the UI
(`grocery-list-detail-view.tsx`), the "Plan changed" / "No longer in the
plan" badge is driven purely by `syncFlag !== "UNCHANGED"` and stays
visible either way; acknowledging an item only removes that item's
"Acknowledge" link/CTA. So an "acknowledged" CHANGED item is **not**
visually cleared — it still shows "Plan changed," just without the
Acknowledge prompt. The three sync states below are set up as three
separate items specifically so this distinction (badge always visible;
acknowledgment only removes the CTA) is reviewable side by side rather
than inferred:

- **CHANGED, unacknowledged** — "Chicken thigh" (a Weeknight Stir-Fry-only
  ingredient no other Plan1 entry produces). The Stir-Fry entry's target
  yield was bumped 6 → 8 servings after generation; this item was checked
  off *before* that change. Confirm the checkoff survives, the item shows
  the previous-quantity-preserved "Plan changed" badge, and the
  "Acknowledge" link is still present.
- **CHANGED, acknowledged** — "Broccoli florets" (also Stir-Fry-only),
  checked off before the same yield-bump mutation, then explicitly
  acknowledged via `acknowledgeGroceryItemSync`. Confirm the checkoff
  survives, the "Plan changed" badge is **still shown** (see note above),
  and the "Acknowledge" link is now gone. Both this item and Chicken thigh
  sit behind several *later, unrelated* entry additions in the seed
  pipeline (Meal Plan grocery generation runs one resync per mutating
  action) — both correctly stay `CHANGED` (one acknowledged, one not)
  through all of them rather than silently reverting, per the
  post-Slice-15 reconciliation correction
  (`src/lib/grocery/list-service.ts#resyncGroceryListFromMealPlan`;
  regression coverage in `mealplans.integration.test.ts`'s "sticky
  unacknowledged CHANGED contributions" describe block). The same
  yield-bump mutation also flips every other item solely sourced from the
  Stir-Fry entry (directly or via its nested Rice/Sauce Parts) to
  `CHANGED` — expect several more unacknowledged `CHANGED` items on this
  list beyond the two named here; they aren't individually tracked as
  fixtures, but their presence is expected, not a bug.
- **REMOVED, unacknowledged** — "Garlic powder": the standalone Seasoning
  Blend entry was removed from the plan after generation. Its
  contribution's item was also checked off first — confirm the checkoff
  survives and the item shows "No longer in the plan," left
  **unacknowledged** for contrast with the CHANGED items above.
- **Preserved through both resyncs**: a manual item ("Sparkling water,"
  checked, in a new "[QA] Extras" category) and a reversible substitute
  selection (Bell pepper → Poblano, a second instance independent of List
  A's own selection).

## Transient states — not persisted, require manual setup

- **A running JavaScript cooking timer.** DishFrame only persists
  `targetEndAt`/`remainingSeconds`/`state` — start a real timer from
  Cooking Mode on the in-progress Weeknight Stir-Fry session to review
  the countdown UI itself.
- **Barcode scanning (Slice 14).** Camera/permission/decode flows are
  real-device-only and cannot be seeded. `[QA] Garlic Confit`'s
  branded-style USDA FDC attribution stands in for a *post-scan result*;
  the scan flow itself needs the deferred checklist below.
- **A currently-open dialog/sheet/toast** or any other pure client state.

## Deferred Slice 14 barcode checklist (real device, not seedable)

Carried forward from `docs/SLICE_14.md`/`docs/SLICE_15.md`:

- real-device barcode scanning on iOS Safari and Android Chrome;
- camera permission allow and deny;
- immediate dialog close during scanner startup;
- camera indicator/stream stopping after success, cancel, timeout, close;
- a recognized and an unrecognized retail barcode;
- no-camera desktop fallback to text search.

## Known accepted edge cases

- **A manually removed optional grocery item may reappear after a later,
  unrelated resync** if the ingredient is still part of the plan's live
  entries — an accepted pre-existing behavior from Slice 12/15
  (`applyGroceryListSourceRefresh`'s "added" fold-in has no record that an
  item was deliberately removed), explicitly left for the Slice 21A
  review rather than fixed here. Not reproduced as a standing fixture
  (nothing in this seed was deliberately left in that state), but worth
  keeping in mind if a resync during manual testing reintroduces
  something you removed.
- **The "Salt" manual-merge item in `[QA] Weeknight Shopping`** combines
  two contributions with incompatible units (tsp vs. tbsp) on purpose —
  expect the concatenated-quantity fallback display (§61.5), not a single
  converted total.

## Open product/design question worth a decision during this review

**Meal Plan grocery-generation UI scope.** `generateGroceryListFromMealPlan`
already supports three source modes — whole plan (omit `entryIds`),
selected entries, or a caller-filtered date range (SLICE_15.md's
completeness pass) — but the `/meal-plans` UI itself only ever exposes
"whole plan." Both linked lists in this seed were generated whole-plan.
Worth deciding during 21A whether the UI should expose a selected-entries
or date-range picker, or whether whole-plan-only is an acceptable
permanent scope.

## Sync-now discoverability

`resyncMealPlanGroceryLists` ("Sync now") exists for the one gap the
automatic per-mutation resync can't cover: a source Recipe/Part edited
*outside* the Meal Plan entirely (e.g. from its own detail page). To
exercise this deliberately: edit `[QA] Weeknight Stir-Fry` directly (not
through the Meal Plan), then check whether `/meal-plans` or the linked
list surfaces any staleness indicator before you manually trigger "Sync
now" — this is a good moment to judge whether the affordance is
discoverable enough, or reads as a dead/unnecessary button when nothing
looks out of date yet.

## Image fixtures

`pnpm db:seed` never contacts Vercel Blob and leaves every Recipe/Part
image-less. `pnpm db:seed-images` (sets `SEED_UPLOAD_BLOB_IMAGES=true`,
requires `BLOB_READ_WRITE_TOKEN`) attaches a real local food photo (from
`prisma/seed-assets/food/`, mapped by descriptive filename — source
formats deliberately mixed across `.jpg`/`.jpeg`/`.webp`) to 11 of the 13
seeded Recipes/Parts:

| Recipe/Part | Source file |
|---|---|
| Steamed White Rice (Part) | `steamed-white-rice.jpg` |
| All-Purpose Seasoning Blend (Part) | `all-purpose-seasoning-blend.jpg` |
| Peanut Dipping Sauce (Part) | `peanut-dipping-sauce.jpeg` |
| Cauliflower Rice (Part) | `cauliflower-rice.jpeg` |
| Garlic Confit (Part) | `garlic-confit.webp` |
| Simple Garden Salad | `simple-garden-salad.jpg` |
| Rice Bowl Base | `rice-bowl-base.jpg` |
| Peanut Noodle Salad | `peanut-noodle-salad.jpg` |
| Rice Side Dish | `rice-side-dish.jpeg` |
| Sunday Ramen Project | `sunday-ramen-project.jpeg` |
| Confit Toast Plate | `garlic-confit-toast.webp` |

- **Image-empty (both commands):** Toasted Sesame Oil Drizzle (Part),
  Weeknight Stir-Fry (Recipe) — the two intentional image-empty UI-state
  fixtures.

Each source file is normalized through the app's real upload pipeline
(`normalizeImageBuffer` — format sniffing, EXIF-orientation correction,
resize, WebP conversion) before storage, so the attached image is a
genuine processed photo, not a synthetic placeholder. Licensing/ownership
of the files under `prisma/seed-assets/food/` is the repository owner's
responsibility.

Repeated `db:seed-images` runs reuse each item's same stable Blob
pathname/`ImageAsset` row rather than uploading a new one, and
reference-count-clean up anything an earlier run's now-wiped Dishes left
orphaned — see `docs/MANUAL_QA_SEED.md`'s "Image fixtures" section for the
full mechanism.

**Accidental-upload cleanup (this correction pass).** The Slice 7–15 seed
pass's verification accidentally contacted Vercel Blob (fixed here). That
upload and a subsequent one-time `pnpm db:seed-images` verification run
both left orphaned `ImageAsset` rows once later plain `db:seed` runs wiped
their Dishes; both batches (1 row, then 11 rows) were confirmed
zero-live-reference via the real `deleteImageAssetIfOrphaned` reference
count and deleted, using the same dry-run-first narrow script pattern —
nothing beyond the `images/qa-seed/` prefix was inspected or touched. As
of this pass, zero `ImageAsset` rows remain under that prefix in the
configured local dev Blob store.

## Useful routes

- `/recipes`, `/parts` — library, filter by the new `[QA] Quick`/
  `[QA] Meal Prep` tags and `[QA] Spicy`/`[QA] Savory`/`[QA] Umami`/
  `[QA] Citrusy` Flavor profiles for search/sort diversity.
- `/cook` — active/recent Cooking Sessions index.
- `/grocery-lists` — both standalone lists.
- `/meal-plans` — both Meal Plans; open `[QA] This Week` for allocation
  badges, entry statuses, and "Get recommendations."
- Recipe/Part detail pages for the nutrition states above (primary values
  + expandable "More nutrients" + attribution disclaimer where sourced).

## Reference

`docs/MANUAL_QA_SEED.md` still covers Slices 1–6's own fixture catalog
(Recipe/Part/Version/propagation/deletion/materialized-snapshot/image) —
not repeated here.
