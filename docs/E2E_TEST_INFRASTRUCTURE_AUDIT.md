# E2E Test Infrastructure Audit

Date: 2026-08-28. Scope: `tests/e2e/*`, `playwright.config.ts`. No new
product-flow coverage was added (account deletion, onboarding-adjacent
flows, Meal Plans/Grocery Lists gaps are intentionally left for the
separate deferred E2E coverage pass).

## What was inspected

All 16 spec files, `seed-session.ts`, and `playwright.config.ts` were read
in full. Swept for: duplicated `isSameOriginPost`/`clickAndWaitForServerAction`
implementations; duplicated auth/session-seeding boilerplate; arbitrary
`waitForTimeout` sleeps; `waitForURL`/`waitForLoadState`/manual response-race
patterns; `page.reload()` call sites and what precedes them; dialog/toast
synchronization; and the seed-session/database safety boundary.

## Findings and changes implemented

### 1. `isSameOriginPost` / `clickAndWaitForServerAction` — consolidated

Byte-identical (including the full rationale comment) in
`onboarding.spec.ts` and `preferences-tasters-grocery.spec.ts`. Genuinely
equivalent, and the underlying problem (optimistic client state racing a
Server Action's real POST before a `reload()`/navigation) recurs anywhere a
mutation precedes an eventual-consistency check. Moved into a new
`tests/e2e/helpers.ts`, generalized slightly:

- `isSameOriginPost(page, response)` — unchanged predicate.
- `waitForServerAction(page, action)` — the general form: runs `action()`
  and waits for its Server Action POST, returning `action()`'s result. Works
  for any triggering interaction, not just `.click()`.
- `clickAndWaitForServerAction(page, locator)` — thin wrapper over
  `waitForServerAction` for the common click case; kept because most call
  sites are exactly this.

`preferences-tasters-grocery.spec.ts`'s `reorderUpViaKeyboard` used to hand-roll
the same `Promise.all([waitForResponse(...), keyboard.press(...)])` pattern
inline for its drag-and-drop keyboard flow — that now calls
`waitForServerAction` too, so there's one implementation of "wait for the
mutation's round trip," not three.

### 2. Auth/session-seeding boilerplate — consolidated (larger than the flagged pair)

A second, larger duplication was hiding in plain sight: the `SeedCookie`
type, `SEED_SCRIPT` path, the `seed()` shell-out wrapper, and the
seed-then-`context.addCookies()` login logic were copied near-verbatim into
**13 of 16** spec files (either inlined directly in `beforeEach`, or behind
a locally redefined `login`/`loginAs` function in `home-dashboard.spec.ts`
and `direct-sharing.spec.ts`). This was the single largest source of
repetition in the suite — more files than the pair named in the brief.

`tests/e2e/helpers.ts` now also exports:

- `seed(...args)` — the `tsx` shell-out, unchanged behavior/rationale.
- `cleanup(userId)` — thin wrapper for the `afterEach` teardown call.
- `login(context, { withIntro?, name? })` — seeds one account, applies its
  cookies to `context`, returns `{ userId, email, cookies }`. Replaces both
  the inline per-file pattern and the two local `login`/`loginAs`
  functions. `withIntro` (onboarding.spec.ts's real-first-run case) and
  `name` (direct-sharing.spec.ts's sender/recipient pair) cover every call
  shape actually used across the suite — no behavior changed at any call
  site.

All 13 files were updated to import from `./helpers` instead of redefining
this. Net effect: the suite shrank by ~665 lines (2989 → ~2320, including
the new 135-line `helpers.ts`) with no test behavior change.

### 3. Fixed a real reload-after-mutation race in `cooking-mode-timers.spec.ts`

The one test in this file checked two checklist items and started two
Timers (`toggleChecklistItem` and `createTimer` — both genuine `"use
server"` Server Actions in `src/lib/cooking/actions.ts`), then called
`page.reload()` immediately afterward to assert the state persisted. None
of the four mutating actions waited for their POST to resolve first — the
exact optimistic-update race `isSameOriginPost`'s own doc comment was
written to describe, just not applied here. Unlike similar-looking spots
elsewhere in the suite (see "Documented, not changed" below), this one had
no intervening awaited work between the last mutation and the reload, so it
was the highest-confidence real flake risk in the audit. Now wrapped in
`waitForServerAction`/inline `waitForServerAction(page, () => ...click())`
for all four mutations. No assertions or product behavior changed.

## Findings documented, not implemented

- **`mealplans-golden-path.spec.ts`**: a grocery-list checkbox `.click()` is
  followed (several navigations and 10–15s-timeout assertions later) by a
  `page.goto()` back to the same list expecting the checkbox still checked.
  Structurally the same race class as #3, but with substantial real
  intervening work before the assertion, making it a low-probability flake.
  Left as-is — fixing it would mean editing a spec that isn't currently
  failing, for a theoretical benefit; flagging here so a future flake in
  this file is easy to recognize.
- **`session-review.spec.ts`**: a checklist-item check is followed by
  "End cooking" → "Finish session" (itself a Server Action, several UI
  steps later) before evidence is asserted. Same reasoning as above —
  documented, not changed.
- **`recipe-golden-path.spec.ts`**: Archive → assert "Archived" badge
  visible → `page.goto("/recipes")` → assert title not visible. The final
  assertion is a retrying `not.toBeVisible()`, which already absorbs a
  short lag, so this is lower-risk than #3. Left alone; the dialog-close
  wait pattern a few lines below it (Restore: `await
  expect(page.getByRole("dialog")).not.toBeVisible()` before navigating) is
  already a good local pattern worth reusing if this ever needs it.
- **Second browser context for multi-account specs** (`direct-sharing.spec.ts`,
  `print.spec.ts`'s signed-out check): `browser.newContext()` is used ad hoc
  per spec rather than as a shared helper. Only two call sites, each with a
  different shape (persistent recipient context vs. one-off signed-out
  check) — a shared abstraction would be speculative for two genuinely
  different usages. Left local.
- **Dialog/menu/toast assertions**: reviewed across all specs. All use
  role-scoped `getByRole`/`getByText` with Playwright's own auto-retrying
  `expect`, and generous timeouts are already commented with a specific
  reason (Turbopack first-compile cost, Radix Tooltip open-delay) rather
  than being cargo-culted. No standardization gap found worth abstracting —
  each pattern is either already shared (`clickAndWaitForServerAction`) or
  is intentionally local to one component's specific ambiguity (e.g. the
  `DisabledActionHint` span/button intersection queries in
  `preferences-tasters-grocery.spec.ts`, which are correctly local since
  they encode one component's specific DOM shape, not shared mechanics).
- **`seed-session.ts`**: reviewed for duplication/fragility. Single
  responsibility, already minimal, and its Neon/production safety check
  (`DATABASE_DRIVER !== "pg"` refusal) is exactly the kind of guard this
  audit was told to preserve — left untouched.

## Suite hygiene already in good shape (no action needed)

- No arbitrary `waitForTimeout` sleeps used *for correctness* anywhere in
  the suite. The only `waitForTimeout` calls (in the keyboard-reorder
  helper) are between a pick-up and move keypress to let dnd-kit's
  `KeyboardSensor` attach its listeners — a real, well-commented UI-timing
  need, not a synchronization workaround, and the mutation-completion wait
  right after it already uses `waitForServerAction`.
- No `waitForURL` usage anywhere — the suite already consistently uses
  `expect(page).toHaveURL(...)`, which is the auto-retrying, preferred
  form.
- No unscoped `waitForLoadState` reliance found.
- `playwright.config.ts` is already minimal and correct: single worker
  concern is handled per-file via `test.describe.configure({ mode:
  "serial" })` where a spec's own tests share database state
  (`recipe-golden-path.spec.ts`, `library-search-and-filters.spec.ts`), not
  globally.

## Optional future improvements (not implemented)

- If a third multi-account or second-browser-context spec is added,
  revisit whether `browser.newContext()` setup deserves a shared helper —
  two call sites wasn't enough signal to abstract now.
- If `mealplans-golden-path.spec.ts` or `session-review.spec.ts` are ever
  observed flaking on CI, the fix is a direct, low-risk application of the
  same `waitForServerAction` pattern used in `cooking-mode-timers.spec.ts`
  — the checkbox/toggle interactions to wrap are identified above.

## Deferred E2E coverage (explicitly out of scope for this pass)

Confirmed per instructions: account deletion, onboarding-adjacent flows
beyond what `onboarding.spec.ts` already covers, and Meal Plans/Grocery
Lists coverage gaps were not added here and remain for the separate
deferred E2E coverage pass.
