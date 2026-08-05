# Slice 20 — Progressive onboarding and Help

## Onboarding data model

No migration: `UserPreference.onboardingState` (Arch §D.14) already existed
in the applied schema. Guide keys/statuses are typed in
`src/lib/preferences/onboarding-guides.ts`. Ten guides, each independently
`completed` / `dismissed` / absent (= incomplete, §92.5):

- `intro` — the initial introduction overlay.
- `recipe-sections-stage`, `editor-versions` — the Recipe/Part editor.
- `parts-intro` — the Parts library.
- `cooking-session`, `session-review` — cooking and reviewing.
- `meal-plans-intro`, `grocery-lists-intro`, `sharing-intro`,
  `tasters-intro` — added in this hardening pass (see below).

`ONBOARDING_GUIDE_INFO` (same file) gives each guide a title/description/
href for Help's replay list — generic over the registry, so adding a guide
key there is enough to make it appear in Help without touching
`ReplayableGuideList` itself.

`src/lib/preferences/service.ts` has `markOnboardingGuideState` (merges one
guide's status without touching others) and `resetOnboardingGuideState`
(clears one guide, for replay); `src/lib/preferences/actions.ts` wraps both
as Server Actions.

## Client-side plumbing — strict provider (hardened this pass)

`src/components/onboarding/onboarding-provider.tsx`: `OnboardingProvider`
seeds a `useState` from server-fetched `onboardingState` and updates
optimistically (still persists server-side, so completion is shared across
devices/logins, not local-storage-only).

`useOnboarding()` now **throws** (`"useOnboarding must be used within an
OnboardingProvider"`) when there's no ancestor provider — the context
default is `undefined`, not a fallback value. The original implementation
defaulted to "every guide reads as completed" specifically to avoid
rewriting the many pre-existing `DishEditor`/`CookingModeShell`/
`SessionReviewForm` component tests that render those components
standalone; that silent fallback risked quietly disabling onboarding in
production if the provider were ever missing from the real layout, so it's
gone. `DishEditor`, `CookingModeShell`, and `SessionReviewForm`'s
component tests now wrap `render` in an explicit
`<OnboardingProvider initialState={{}}>` (a local `render` wrapper
shadowing RTL's own, so every existing call site in each file picked it up
without individually editing 40+ call sites) — see
`dish-editor.test.tsx`/`nutrition-fields.test.tsx`/
`cooking-mode-shell.test.tsx`/`session-review-form.test.tsx`.

Both production layouts still supply a real provider, unchanged in
substance: `(app)/layout.tsx` (seeded alongside the existing
`defaultsInitializedAt` recovery check) and `(cook)/layout.tsx` (no chrome
— `(cook)/cook/[sessionId]/layout.tsx` still owns that route's session
check/redirect).

## Initial introduction (§92.2–§92.3)

`InitialIntro` (`src/components/onboarding/initial-intro.tsx`), mounted
globally in `(app)/layout.tsx`, is a two-step, always-skippable Dialog:
Step 1 explains the Save→cook→evaluate→revise→reuse loop, Versions, and
Parts, plus a live fictional demo; Step 2 offers the five preference
fields from §92.3. Skip/close/"Done" all mark the single `intro` guide
`completed` or `dismissed` — either way it never reappears. Standalone
overlay, not the Recipe-creation flow itself, so it doesn't conflict with
§8.1's "no multi-step onboarding flow" for the Recipe editor.

`ExampleRecipeDemo` is the §92.4 temporary example: hard-coded fictional
data, interactive via local `useState` only — no import of `prisma`, a
Server Action, or any domain service, enforced by
`example-recipe-demo.test.tsx`'s static import scan plus a
mocked-`createDish`/`editDish` interaction test.

## Contextual teaching coverage (§93.1) — substantial workflows only

Rule applied: a substantial, non-obvious page/workflow gets a `CoachMark`;
a smaller concept gets Help/FAQ coverage instead. Nine guides across nine
pages/components:

| Guide | Where | Why a CoachMark |
|---|---|---|
| `recipe-sections-stage` | `DishEditor`, create mode, Recipe | First Recipe creation — Sections/Stage aren't inferable from the UI. |
| `editor-versions` | `DishEditor`, edit mode | First meaningful edit — Versions' non-destructive behavior isn't obvious. |
| `parts-intro` | `parts/page.tsx` | Parts require explicit upfront explanation (§92.2). |
| `cooking-session` | `CookingModeShell`, active session | First cook — a dedicated mode with its own concepts (timers, plan). |
| `session-review` | `SessionReviewForm` | First review — optional/conversational framing needs stating. |
| `meal-plans-intro` | `meal-plans/page.tsx` | Substantial planning workflow (date-range plan → synced grocery list). |
| `grocery-lists-intro` | `grocery-lists/page.tsx` | Substantial workflow (generation, combining, sync-vs-standalone). |
| `sharing-intro` | `(app)/share/page.tsx` | Substantial + easy to misunderstand: link vs. direct send vs. copy. |
| `tasters-intro` | `tasters/page.tsx` | Kept small per the reviewed scope — one sentence, not a walkthrough. |

Smaller/completed concepts route to Help instead of a tenth+ CoachMark:

- **Nutrition** — a compact Help FAQ + a "Nutrition basis" term, not a
  CoachMark inside `DishEditor` (which already carries two CoachMarks;
  a third there would be clutter, not clarity).
- Tier 3 Publish/moderation — intentionally not covered anywhere (unbuilt).

All nine CoachMark placements were copy-checked against the exact spec
sections they describe (§81.2/§81.5 for Meal Plan↔grocery sync, §83–§85
for the link/direct-share/copy distinction) to avoid asserting behavior
the product doesn't actually have — e.g., a share Link does **not**
create a copy on view; only an explicit "save"/"accept" action does.

## Help (§93.4)

`/help`: direct links to every major area (added Sharing, Tasters),
`ReplayableGuideList` (generic over the whole registry — the four new
guides needed no component changes to appear), an FAQ section (added
nutrition entry and Meal-Plan-sync entry), and expanded terminology
(added Grocery List, Share Link, Direct Share, Nutrition basis; tightened
Independent copy's wording to state explicitly that viewing alone never
creates one). The stale "Coming later" section (unchanged since Slice 3)
was removed in the original pass.

## Playwright fixture fix — `seed-session.ts`

**Bug found and fixed this pass:** `InitialIntro` correctly shows for any
genuinely brand-new account's first `(app)` page view — but every
pre-existing e2e spec (`cooking-golden-path`, `recipe-golden-path`,
`mealplans-golden-path`, `session-review`, `preferences-tasters-grocery`,
`library-search-and-filters`, `paste-import`, `print`,
`cooking-mode-timers`, `theme`) seeds a "brand-new" account purely as a
login mechanism for an unrelated flow, via the same `tests/e2e/
seed-session.ts login` command `onboarding.spec.ts` uses. None of them
expect or dismiss a modal, so the Dialog's overlay silently blocked their
first pointer interaction — reproduced directly against
`cooking-golden-path.spec.ts`: `page.getByRole("button", { name: "Add
ingredient" }).click()` hung for the full 60s timeout because the
"Welcome to DishFrame" dialog (confirmed present in the failure's
accessibility snapshot) was intercepting the click.

Fix: `seed-session.ts`'s `login` command now pre-marks the `intro` guide
`completed` by default (making a freshly seeded account "an ordinary
already-onboarded test user," which is what every non-onboarding spec
actually wants). `onboarding.spec.ts` opts back into the real first-run
state via `seed("login", "with-intro")`. This is a single shared fix
point — every other spec calls plain `seed("login")` and picks it up
automatically, no per-spec changes needed.

Not a product bug: `InitialIntro`'s behavior for a real new account is
correct per §92.2. The gap was purely in what a "freshly seeded" e2e test
account should represent by default.

## Tests

- `src/lib/preferences/onboarding.integration.test.ts` — merge/reset
  behavior against real Postgres (generic over any guide key).
- `src/components/onboarding/coach-mark.test.tsx` — renders when
  incomplete; hidden once completed/dismissed; "Got it"/dismiss persist
  the right status; `it.each` over the four newly registered guides
  (`meal-plans-intro`, `grocery-lists-intro`, `sharing-intro`,
  `tasters-intro`) confirming each specifically appears/hides correctly,
  not just the mechanism in the abstract.
- `src/components/onboarding/replayable-guide-list.test.tsx` (new) —
  lists all ten registered guides including the four additions; replaying
  one resets it (mocked action) and navigates to its registered `href`.
- `src/components/onboarding/onboarding-provider.test.tsx` (new) —
  `useOnboarding()` throws outside a provider; does not throw inside one.
- `src/components/onboarding/example-recipe-demo.test.tsx` — isolation
  negative test, unchanged.
- `tests/e2e/onboarding.spec.ts` — unchanged assertions; updated to seed
  with `with-intro` per the fixture fix above. Re-run to confirm the
  strict-provider change and the seed-script change didn't affect it.

## Commands actually run

- `pnpm exec vitest run src/components/domain/dish/dish-editor.test.tsx src/components/domain/dish/nutrition-fields.test.tsx src/components/domain/cooking/cooking-mode-shell.test.tsx src/components/domain/cooking/session-review-form.test.tsx src/components/onboarding "src/app/(app)/layout.test.ts"` — pass (65/65)
- `DATABASE_URL=... DIRECT_URL=... DATABASE_DRIVER=pg pnpm exec vitest run --config vitest.integration.config.mts src/lib/preferences/onboarding.integration.test.ts` — pass (2/2)
- `pnpm exec playwright test tests/e2e/onboarding.spec.ts --project=chromium --workers=1` — pass (2/2), run twice: once after the strict-provider change, once after the seed-script fixture fix
- `pnpm exec playwright test tests/e2e/cooking-golden-path.spec.ts --project=chromium --workers=1` — run **before** the fixture fix, to confirm/diagnose the reported failure (reproduced: timeout waiting for "Add ingredient", "Welcome to DishFrame" dialog present in the failure snapshot). Not re-run after the fix — left for the owner, per their explicit request.

No `tsc` (in any form), no repo-wide lint/format, no production build, no
`verify:feature`/`verify:all`, no full unit/integration/Playwright suite,
and no Git command were run.

## Limitations / Slice 21 targets

- CoachMark styling/placement (inline callout, fixed copy length) hasn't
  had a responsive/visual pass — Slice 21 owns that.
- `InitialIntro`'s demo and preference step aren't independently
  replayable from Help (only the whole `intro` guide resets together) —
  acceptable per spec (§92.2 treats it as one brief unit).
- `editor-versions`, `cooking-session`, and `session-review` replay links
  go to list pages (`/recipes`, `/cook`) rather than a specific dish/
  session, since replay has no target instance to deep-link to.
- Public Home/About/Contact and the broader first-use visual revisit
  remain fully deferred to Slice 21, per this pass's explicit scope —
  not touched.
- Owner should confirm `cooking-golden-path.spec.ts` (and, if time
  allows, a spot-check of one or two other pre-existing specs) now pass
  with the `seed-session.ts` fixture fix in place.
