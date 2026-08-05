# Slice 21 — Empty-Account Structural Audit

Companion to `docs/SLICE_21_STRUCTURAL_AUDIT.md` (the populated-account
structural pass). That pass could only reach the "no search results"
empty state for Recipes/Parts, since the QA seed account already owns
substantial data — this pass covers the genuine first-run/zero-data
states it flagged as a reviewability gap. Same scope boundary as that
pass: objective, design-independent defects only — no visual/responsive/
theme/accessibility/branding work, which remains for the second, owner-led
design-audit pass.

## Audit configuration

- Chromium, 1440×900, light theme (default).
- One newly created local-only account, minted via
  `tests/e2e/seed-session.ts login with-intro` (the same Better Auth
  `testUtils` mechanism the Playwright specs use) against a database
  already cleared with `pnpm db:clear` — so the account starts with zero
  Recipes, Parts, Cooking Sessions, Grocery Lists, Meal Plans, shares,
  only the protected built-in "You" Taster, default Flavor Profiles/
  Grocery Categories (seeded by `initializeNewUser`, not this pass), and
  genuinely incomplete first-run onboarding (`with-intro` opts out of the
  e2e helper's usual "pre-mark intro completed" default).
- Cookies injected directly into a Playwright/Chromium session (no manual
  Google OAuth, per this pass's instructions).
- The account and its Meal Plan created during testing were deleted via
  the same script's `cleanup <userId>` command after the audit; the
  representative image-enabled QA seed (`pnpm db:seed-images`) was then
  restored — see "Restoration" below.

## Routes and states inspected

| Surface | What an empty/first-run account sees | Result |
|---|---|---|
| Initial onboarding (`InitialIntro`) | "Welcome to DishFrame" dialog opens automatically on first `/home` load; Skip persists server-side (confirmed via reload) and never reappears | ✅ |
| `/home` | Static "Start your DishFrame" hero + Create/Import CTAs + three "Nothing here yet." sections | ✅ for an empty account (see "Home-page finding" below — not query-driven) |
| `/recipes` | "No recipes yet" / "Recipes you create will show up here." + Create/Import CTAs still visible | ✅ |
| `/parts` | "No parts yet" + Create CTA + first-run CoachMark explaining what a Part is | ✅ |
| `/cook` | "No Cooking Sessions in progress." + explicit next action ("Open a Recipe or Part and choose Cook…") | ✅ |
| `/grocery-lists` | "No active grocery lists yet." + CoachMark | 🛠 "New grocery list" dead-ended — see below |
| `/meal-plans` | "No Meal Plans yet." + CoachMark; creation flow (title/date range) doesn't require existing Recipes/Parts | ✅ |
| `/meal-plans/[id]` (freshly created) | "No entries yet"; "Recipe or Part" is a native `<select>` with only "Choose…" (zero options), "Add entry" correctly stays `disabled`; "Get recommendations" returns "No matches — try adjusting the filters above." (not the dead-end from Grocery Lists — see note) | ✅ |
| `/share` | "You haven't shared anything yet." / Sent / Received all correctly point to sharing being initiated from a Recipe/Part's own actions | ✅ |
| `/tasters` | Only the protected "You" row; Archive/Delete correctly disabled with "(unavailable)" | ✅ |
| `/tags` | Only the protected default "Favorite" tag; Rename/Delete correctly disabled | ✅ |
| `/flavor-profiles` | Default seeded set (Sweet/Savory/Spicy/Tangy/Smoky/Rich/Fresh/Umami), fully editable | ✅ |
| `/settings` | Appearance/Preferences plus inline Tasters/Tags/Flavor Profiles/Grocery Categories managers, each with a working "Open full view" forward link | ✅ |
| `/profile` | Account identity, one "Signed-in devices" row (this session), Export/Sign out/Delete account all present | ✅ |
| `/help` | Full "Jump to" list and all 10 replayable guides, matching primary nav | ✅ |
| `/recipes/new` | Loads cleanly; "Attach a Part" dialog correctly shows "You don't have any reusable Parts yet." (no dead-end) | ✅ |
| `/parts/new` | Loads cleanly, no console errors | ✅ |
| `/recipes/import` | Fully functional paste-and-review import flow | ✅ (see Home-page finding below) |

No runtime, request, console, hydration, or authorization errors were
observed on any inspected route (`browser_console_messages` checked at
`error` level after each navigation).

## Objective defects found and fixed

### 1. "New grocery list" dead-ended for an account with zero Recipes/Parts

`GrocerySourcePicker` (`src/components/domain/grocery/grocery-source-picker.tsx`)
always rendered an enabled "New grocery list" button. Opening it showed a
Title field and a "Generate list" button, but its `SourceGroup` helper
returns `null` when its candidate list is empty — so with zero owned
Recipes and zero Parts, *both* groups rendered nothing. Clicking
"Generate list" then failed with "Select at least one Recipe or Part.",
a validation error the user had no way to satisfy from that screen: no
picker was ever shown, and there was no link out to create a Recipe or
Part first. This is exactly the "empty-state action hidden behind an
unavailable prerequisite" defect class named in this pass's instructions
— a genuine dead end for any brand-new account's very first visit to
Grocery Lists, not a rare edge case.

By contrast, `/recipes/new`'s "Attach a Part" dialog and
`/meal-plans/[id]`'s "Add entry" control both handle the same
zero-candidates case correctly already (an explanatory empty state, or a
correctly `disabled` submit control) — this was the one outlier.

**Fix:** when `candidates.length === 0`, `GrocerySourcePicker` now renders
a `disabled` "New grocery list" button wrapped in the app's existing
`DisabledActionHint` component (same pattern already used on `/home`'s
"Import a recipe" prior to this pass, and elsewhere for unavailable
actions), with the explanation "Create a Recipe or Part first — a grocery
list is generated from what you've saved." No new UI pattern introduced.
**Test:** `src/components/domain/grocery/grocery-source-picker.test.tsx`
(new) — asserts the disabled/hint state for zero candidates and the
normal open-picker path for one candidate.

### 2. `/home`'s "Import a recipe" was a stale "coming soon" dead button

`src/app/(app)/home/page.tsx` rendered "Import a recipe" as a hard-
`disabled` button via `DisabledActionHint`, with the explanation
"Importing recipes from other sources isn't available yet" and adjacent
text "Import a recipe: coming soon". But `/recipes/import`
(`src/components/domain/dish/paste-import-flow.tsx`, PRODUCT_SPEC.md
§56.1/§59) is a fully built, working paste-and-review import flow, backed
by real server actions (`proposeImportFromPaste`/`confirmImport`) — and
the `/recipes` page's own "Import" link already points there. This is
stale/misleading feature terminology on the one other CTA a brand-new
account sees on its very first screen besides "Create a recipe."

**Fix:** replaced the disabled button with a working `Link` to
`/recipes/import`, styled identically to the existing "Create a recipe"
button (matching the app's `Button asChild` + `Link` pattern already used
one line above it). Removed the now-unused `DisabledActionHint` import.
**Test:** `src/app/(app)/home/page.test.tsx` (new) — asserts the link
targets `/recipes/import` and isn't disabled.

### 3. `/meal-plans/[id]`'s "Get recommendations" misdirected an empty-library account (fixed, then corrected)

`RecommendationsPanel` (`src/components/domain/mealplans/meal-plan-detail-view.tsx`)
showed "No matches — try adjusting the filters above." for *any* empty
result set, including an account with zero owned Recipes — where
adjusting the Include Experimental/Include Ideas/Favorites-only filters
can never produce a match, since there is nothing in the library to
match at all. Originally flagged in this doc as a deliberately-unfixed
minor observation.

**First fix (superseded — recorded here only so the history is legible):**
branched on `candidates.length === 0` (the `MealPlanEntryCandidate[]`
prop, i.e. `listMealPlanEntryCandidates`'s pool) and, when empty, offered
both "Create a Recipe" and "Create a Part." This was inaccurate on
several counts: recommendations are Recipe-only, so "Create a Part" never
helps; `candidates` excludes archived Dishes, so an account owning only
archived Recipes would still see "you don't have any yet" even though it
does own Recipes; and `candidates` carries no Stage, so it can't tell
"no Recipes owned" apart from "Recipes owned, but none are
recommendation-eligible."

**Corrected fix:** established what the data actually represents —
`listMealPlanEntryCandidates` (feeding `candidates`) is a Recipe+Part,
archived-excluded pool built for the plan-entry picker, not a Recipe
ownership or recommendation-eligibility signal. Recommendation
eligibility (§80) is Recipe-only and additionally excludes archived
Dishes and Stage-`ARCHIVED` Recipes unconditionally
(`rankMealPlanRecommendations`'s `stage !== "ARCHIVED"` filter is never
opted back into). A new query, `countRecipeRecommendationEligibility(ownerId)`
(`src/lib/mealplans/queries.ts`), returns two cheap counts — no broad
Recipe graph load — using the *exact same* `where` clause
`listRecommendationCandidates` already uses (RECIPE, `archivedAt: null`,
has a current Version), not a hand-rewritten copy, so the two can't
silently drift apart:
`totalRecipeCount` (every owned Recipe, any archived/Stage state) and
`eligibleRecipeCount` (owned, non-archived, has a current Version).
`service.ts#getRecommendations` now returns both alongside the ranked
list, and `getMealPlanRecommendations` (the Server Action) passes them
through. `RecommendationsPanel` stores them alongside `results` and,
when a fetch returns zero recommendations, branches truthfully:

1. **`totalRecipeCount === 0`** (no owned Recipes at all): "Recommendations
   are drawn from your saved Recipes — you don't have any yet." plus a
   single "Create a Recipe" (`/recipes/new`) button. No Parts mentioned,
   no filter-adjustment suggestion.
2. **`eligibleRecipeCount === 0`** but `totalRecipeCount > 0` (every owned
   Recipe is archived): "None of your saved Recipes are currently
   eligible for recommendations — archived Recipes aren't included."
   plus a "View your Recipes" (`/recipes`) link. Never claims the library
   is empty, never offers Create a Part, never suggests adjusting the
   Experimental/Idea/Favorites filters (none of them can un-archive a
   Recipe).
3. **`eligibleRecipeCount > 0`** but the ranked result is still empty
   (the current filter selection excludes every eligible Recipe): the
   original "No matches — try adjusting the filters above." message,
   unchanged.

No recommendation ranking, Stage rules, eligibility, archive behavior, or
filter logic was changed — only which explanatory copy/actions the panel
shows for an already-empty result.

**Terminology correction.** The first pass's state-2 copy read "archived
Recipes, and Recipes at Archived Stage, aren't included," implying two
separate archive systems. They are not: archiving a Dish *is* setting its
Stage to `ARCHIVED`
(`dishes/service.ts#archiveDish` → `updateDishStage(..., "ARCHIVED", ...)`,
which derives `archivedAt` from that Stage transition via
`nextArchivedAt`) — `archivedAt` is a timestamp of the same fact, not a
second gate. The product's own UI reinforces this: the Archive button
(`dish-detail-actions.tsx`) and the resulting `StageBadge` both use the
single word "Archived," with no separate "archived" indicator anywhere
else in the Recipe/Part UI. Simplified to "archived Recipes aren't
included," and `countRecipeRecommendationEligibility`'s query dropped a
redundant `stage: { not: "ARCHIVED" }` clause that was already implied
by `archivedAt: null` (see the query's own comment for the invariant).

**Test:** `src/components/domain/mealplans/meal-plan-detail-view.test.tsx`
(rewritten) — three cases, one per state above, each asserting the
correct message/links appear and the other two states' text does not.
**Integration coverage (this correction pass):**
`src/lib/mealplans/mealplans.integration.test.ts`'s new
`"recommendation eligibility (§80)"` block (3 new cases, real database):
1. an account owning zero Dishes plus one Part (proving Parts don't
   count) → `totalRecipeCount: 0`, `eligibleRecipeCount: 0`,
   `recommendations: []`.
2. an account owning two archived Recipes — one created directly with
   `stage: "ARCHIVED"`, one archived via the real `archiveDish` flow
   after creation — → `totalRecipeCount: 2`, `eligibleRecipeCount: 0`,
   `recommendations: []` even with every optional filter enabled.
3. an account owning one Recipe each at Active/Experimental/Idea/Archived
   Stage plus one Part: with default filters, `eligibleRecipeCount: 3`
   (Archived excluded, the other three all still eligible) while
   `recommendations` returns only the Active one (Experimental/Idea
   filtered out by the *optional* filters, not ineligible); with every
   optional filter enabled, `recommendations.length` equals
   `eligibleRecipeCount` (3) exactly — the direct proof that the count
   and `rankMealPlanRecommendations`'s ranking rules cannot drift apart,
   since raising every optional filter makes the ranked output converge
   on precisely the unconditionally-eligible pool.
**Commands:**
`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe DIRECT_URL=postgresql://postgres:postgres@localhost:5432/dishframe_shadow DATABASE_DRIVER=pg npx vitest run --config vitest.integration.config.mts src/lib/mealplans/mealplans.integration.test.ts`
— 23/23 passed (3 new + 20 pre-existing, no regression);
`npx vitest run src/components/domain/mealplans/meal-plan-detail-view.test.tsx`
— 3/3 passed (wording assertion updated to match the simplified copy).

## States already satisfactory (no fix needed)

- Onboarding: dialog shows once, Skip persists server-side across reload,
  no CoachMark or dialog blocks ordinary navigation.
- `/recipes`, `/parts`, `/cook`, `/meal-plans`, `/share`, `/tasters`,
  `/tags`, `/flavor-profiles`, `/settings`, `/profile`, `/help` — all
  explain the feature's purpose, offer a correct next action, and use
  accurate terminology.
- `/recipes/new`'s "Attach a Part" picker and `/meal-plans/[id]`'s
  "Add entry" control both handle zero-candidates correctly already
  (explanatory text or a properly `disabled` control) — the precedent
  the Grocery Lists fix above now follows.

## Home-page finding (factual, not fixed — matches the populated-audit finding)

`/home` is confirmed to be a fully static component
(`src/app/(app)/home/page.tsx`): `SECTIONS` is a hard-coded array, and
"Nothing here yet." is a literal string with no query behind it — the
page does not read `session`, `prisma`, or any account data at all. For
this empty account, that happens to be truthful (there genuinely is
nothing yet), but it is not "reading real data that happens to be empty"
— the exact same three sections would render identically for a fully
populated account, which is exactly what the populated-audit pass
(`docs/SLICE_21_STRUCTURAL_AUDIT.md`) already found and deferred as a
placeholder-stub finding. This pass adds no new information beyond
confirming the empty-account rendering is coincidentally correct, not
independently verified — the underlying "should `/home` get real
content" product decision is unchanged and still owner-deferred.

## Remaining owner decisions

Unchanged from `docs/SLICE_21_STRUCTURAL_AUDIT.md`'s "Owner intervention
recommendation": (1) whether `/home` gets real content in this Slice 21
arc, and (2) whether `PublicHeader` becomes session-aware. This pass
found nothing that changes either question.

The `/meal-plans/[id]` "Get recommendations" empty-library observation
noted here previously is now fixed and, on a closer read of what the
underlying data actually represents, corrected to three truthful states
— see "Objective defects found and fixed" §3 above.

## Tests and browser commands run

- `npx vitest run src/components/domain/grocery/grocery-source-picker.test.tsx`
  — new, 2/2 passed.
- `npx vitest run "src/app/(app)/home/page.test.tsx"` — new, 1/1 passed.
- `npx vitest run src/components/domain/mealplans/meal-plan-detail-view.test.tsx`
  — rewritten (correction pass), 3/3 passed.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe DIRECT_URL=postgresql://postgres:postgres@localhost:5432/dishframe_shadow DATABASE_DRIVER=pg npx vitest run --config vitest.integration.config.mts src/lib/mealplans/mealplans.integration.test.ts`
  — new "recommendation eligibility (§80)" block (this correction pass),
  23/23 passed (3 new + 20 pre-existing, no regression).
- Manual Chromium/Playwright walkthrough of every route in the table
  above, plus live re-verification of both original fixes after applying
  them (`/grocery-lists`'s button now correctly disabled with hint text;
  `/home`'s Import link now reaches the real `/recipes/import` flow). The
  §3 follow-up/correction was verified via its focused component and
  integration tests only, not a repeated browser walkthrough.
- No broader suite, typecheck, lint, build, or Playwright run — per this
  pass's explicit prohibition. No command containing `tsc` was run,
  directly or indirectly.

## Restoration

- Temporary audit account deleted via
  `tests/e2e/seed-session.ts cleanup <userId>` (confirmed 0 rows in
  `users` immediately after).
- `pnpm db:seed-images` re-run successfully — confirmed 2 users (primary
  QA + counterparty), 11 `ImageAsset` rows, and 19 `[QA]`-titled Dishes
  restored. The database is back to the representative, image-enabled
  review fixture set described in `docs/SEED_REVIEW_GUIDE.md`.

## Owner intervention recommendation

**Brief sanity check.** After the owner runs verification, open
`/grocery-lists`, `/home`, and `/meal-plans/[id]`'s Recommendations panel
on a genuinely empty account (or re-run this pass's account-creation
steps) to confirm all three fixes render as described. No other product/
design judgment is pending from this pass — the two owner decisions
carried over from the populated-audit pass remain open.
