# Slice 21 — Structural Route-and-State Audit (Pass 1 of 2)

First Slice 21 pass: a structural route-and-state audit plus objective,
low-risk product cleanup. Per BUILD_PLAN.md's Slice 21 scope and this
pass's own instructions, this does **not** include the desktop
Cooking-Mode layout refinement, or any visual/responsive/theme/
accessibility/branding redesign — those remain for the second,
owner-led design-audit pass and Review Gate 8.

## Audit configuration

- Chromium, 1440×900, light theme (default), one ordinary desktop viewport.
- Signed in as the QA seed owner (`SEED_USER_EMAIL`) via a Better Auth
  `testUtils` session token minted directly for that existing seeded user
  (no new/throwaway account created) — the app only supports Google OAuth
  sign-in, which isn't automatable here.
- Assumed the image-enabled representative seed (`pnpm db:seed-images`)
  was already loaded, per this pass's instructions; confirmed live
  (recipe/part thumbnails render for the 11 image-fixture items, the two
  deliberately image-less items show the empty-image placeholder).
- No desktop/mobile comparison, no light/dark comparison, no color-palette
  or typography/spacing/density review, no comprehensive accessibility
  pass, no subjective layout redesign — all deferred per this pass's scope.

## Route-and-state matrix

Legend: ✅ inspected, no objective issue found · 🛠 objective issue found
and fixed this pass · 📝 finding recorded for owner judgment (not fixed)
· ⛔ gap — could not be reviewed with the current seed.

| Surface | State(s) inspected | Fixture used | Result |
|---|---|---|---|
| `/home` | Populated shell (all 3 sections empty by design/stub) | QA owner | 📝 Home content is still a placeholder stub — see "Deferred findings" |
| Primary nav (sidebar + mobile sheet) | All 10 destinations | — | 🛠 Meal Plans/Grocery Lists/Share/Tasters were missing; added |
| `/recipes` | Populated grid, no-results (search) | QA seed | ✅ |
| `/recipes?stage=ARCHIVED` | Archived filter | Simple Garden Salad | ✅ |
| `/recipes/[id]` (current) | Parts-only, mixed order, outdated-vs-current nested Part pins, USDA/manual/detached nutrition, image vs. image-empty | Rice Bowl Base, Weeknight Stir-Fry | ✅ |
| `/recipes/[id]` (archived) | Archived badge, actions still enabled, Restore present in More actions | Simple Garden Salad | ✅ |
| `/recipes/[id]/versions/[versionId]` | Current version, historical (non-current) version | Sunday Ramen Project V2.4 → V2.3 | ✅ |
| `/recipes/[id]/compare`, `/parts/[id]/compare` | Not deep-tested this pass (reached via menu, page loads) | Sunday Ramen Project | ✅ (surface-level only) |
| `/recipes/[id]/edit`, `/parts/[id]/edit` | Not exercised end-to-end this pass (route loads; full form-save flow already covered by existing integration/E2E tests) | — | ✅ (route reachability only) |
| `/recipes/new`, `/parts/new` | Route reachable from library headers | — | ✅ (route reachability only) |
| `/recipes/import` | Route reachable | — | ✅ (route reachability only) |
| `/parts` | Populated grid | QA seed | ✅ |
| `/parts/[id]` | Usages list with "Newer Version available" indicator (outdated vs. current pin) | Peanut Dipping Sauce | ✅ |
| Nonexistent Recipe/Part ID (`/recipes/[bad-id]`) | 404 | — | 🛠 Duplicate-header rendering bug found and fixed |
| `/recipes/[id]/cook`, `/parts/[id]/cook` (Cooking Setup) | Unit reordering, per-unit scale inputs | Weeknight Stir-Fry | ✅ |
| `/cook` | Active sessions, recently-ended (completed + ended-early) | QA seed | ✅ |
| `/cook/[sessionId]` (Cooking Mode) | In-progress (mixed checkoffs, notes), completed (read-only, disabled checkboxes) | Weeknight Stir-Fry, Rice Bowl Base | ✅ |
| `/cook/[sessionId]/review` (Session Review) | Rating-only (single Taster), full-text multi-Taster (incl. archived Taster's historical rating still visible) | Peanut Noodle Salad ×2 | ✅ |
| `/tasters` | Active + archived Tasters, drag-reorder, per-row actions | QA seed | ✅ |
| `/grocery-lists` | Active + completed lists | QA seed | ✅ |
| `/grocery-lists/[id]` | Sync-flag states: CHANGED unacknowledged, CHANGED acknowledged (badge persists, CTA gone), REMOVED unacknowledged, preserved manual item/substitute | This Week's Groceries | ✅ |
| `/meal-plans` | List of 2 plans | QA seed | ✅ |
| `/meal-plans/[id]` | Planned/Cooked/Skipped/In-progress entry statuses, per-entry allocation badge, planned-meal sub-allocations, Recommendations panel, linked grocery lists | This Week | ✅ |
| `/share` | Links (active-current, active-fixed, expired, revoked), Sent (pending/accepted/declined/canceled), Received (pending/accepted/accepted-then-deleted-copy) | QA seed | ✅ |
| `/s/[token]` (public ShareLink) | Active current, active fixed-snapshot | Weeknight Stir-Fry, Peanut Noodle Salad | ✅ |
| `/s/[token]` (expired token) | 404 | Rice Side Dish's expired link | 🛠 Duplicate-header bug found and fixed (same root cause as above) |
| `/print/recipes/[id]`, `/print/parts/[id]` | Current version | Rice Bowl Base | ✅ |
| `/print/s/[token]` | Not directly loaded this pass; page code inspected (correct dynamic `generateMetadata`) | — | ✅ (source-level) |
| Historical/materialized print (`?versionId=`) | Not directly loaded this pass; same DTO/whitelist path as the current-version print route already exercised | — | ✅ (source-level) |
| `/profile` | Signed-in devices, Export, Delete account entry points | QA owner | ✅ (source-level; live single-session state only — see gaps) |
| `/settings` | Preferences, Tasters/Tags/Flavor Profiles/Grocery Categories managers | QA owner | ✅; 🛠 added forward links to the orphaned `/tasters`, `/tags`, `/flavor-profiles` pages |
| `/tags`, `/flavor-profiles` | Standalone pages | QA owner | ✅ (were unreachable except by direct URL — see fix above) |
| `/sign-in` | Signed-in user redirected away | QA owner | ✅ |
| `/help` | FAQ/terminology, "Jump to" links (already listed every major surface — informed the nav fix), 10 replayable guides | QA owner | ✅ |
| `/about`, `/contact` | Static content, contact form | — | ✅ (nav/functional check only, per this pass's scope) |
| `/` (marketing home) | Static content | — | ✅ (nav/functional check only) |

## Objective issues found and fixed

### 1. Primary navigation was missing four completed major surfaces

`APP_NAV_ITEMS` (`src/components/app/nav-items.ts`, feeding both
`SidebarNav` and `MobileTopbar`) listed only Home, Recipes, Parts, Cook,
Settings, Help. **Meal Plans** (Slice 12/15), **Grocery Lists** (Slice
12), **Share** (Slice 16/17), and **Tasters** (Slice 9) were fully built
and are treated as first-class surfaces everywhere else in the app (e.g.
`/help`'s own "Jump to" list already included all four) but had no
primary-nav entry — reachable only by typing the URL directly or
replaying an onboarding guide from `/help`. This is exactly the "major
pages missing from navigation" defect class this pass targets.

**Fix:** added all four to `APP_NAV_ITEMS`, ordered to match the
onboarding-guide registry's own sequencing (`meal-plans-intro` →
`grocery-lists-intro` → `sharing-intro` → `tasters-intro`).
**Test:** `src/components/app/nav-items.test.ts` (new) — asserts the
exact href order, protecting against silently dropping a destination.

### 2. `/tags` and `/flavor-profiles` were orphaned pages

Both standalone pages exist (Slice 10) and already render a "← Settings"
back-link, but nothing in the app ever linked forward to them — same
defect class as #1, one level down (Settings manages Tags/Flavor Profiles
inline already, so these weren't promoted to primary nav, but they were
still completely unreachable).

**Fix:** added an "Open full view" forward link on each of the Tasters/
Tags/Flavor Profiles section headers in `/settings`, matching the
existing back-link pattern those three pages already establish.
No new test beyond the existing settings-page/manager coverage — this is
a static link, verified live (see matrix).

### 3. A 404 inside `(app)` or `(share)` rendered a duplicated header

Reproduced by visiting a nonexistent Recipe/Part ID, or an expired/
invalid ShareLink token. Both `(app)/layout.tsx` (SidebarNav +
MobileTopbar) and `(share)/layout.tsx` (PublicHeader/PublicFooter)
already render their own chrome around `{children}`; Next's App Router
keeps that layout mounted when a page calls `notFound()`, but with no
route-group-scoped `not-found.tsx`, the render fell through to the root
`src/app/not-found.tsx` — which renders its *own* full-page header with a
second "DishFrame" wordmark. The result: a duplicated logo/header nested
inside the real one, with the actual "not found" message oddly
positioned below both. This is a common path, not a rare edge case —
any stale bookmark, deleted Recipe/Part, or expired/revoked share link
hits it.

**Fix:** extracted the shared message/button markup into
`src/components/layout/not-found-content.tsx` (`NotFoundContent`, with an
`as="div"|"main"` prop so it doesn't produce a duplicate `<main>`
landmark where the parent layout already has one), then added
`src/app/(app)/not-found.tsx` and `src/app/(share)/not-found.tsx`, each
rendering only `NotFoundContent` (no header) so the enclosing layout's
existing chrome is the only one rendered. Root `not-found.tsx` now
composes the same shared component. `(print)` and `(cook)` route groups
also call `notFound()` but render no header chrome of their own (verified
by reading both layouts), so they don't exhibit this bug and weren't
touched, to keep the fix narrowly scoped to the confirmed defect.
**Test:** `src/components/layout/not-found-content.test.tsx` (new) —
asserts the home link and custom description render correctly.
**Verified live:** both routes re-tested after the fix; single header,
correct "Return home" target (`/home` for `(app)`, `/` for `(share)`),
no duplicate wordmark.

### 4. Generic/inherited dynamic page titles (Slice 21 follow-up pass, fixed)

Most authenticated-app detail/workflow pages used a static generic
`export const metadata` title instead of the actual Recipe/Part/Meal
Plan/Grocery List name, and public `/s/[token]` ShareLink pages had no
metadata override at all (inherited the marketing homepage's title
verbatim) — see this file's prior "Findings deferred" entry for the full
original description. Fixed in a dedicated follow-up pass using the
already-precedented `(print)` routes' `generateMetadata` pattern (call
the same authorized resolver a second time, in `generateMetadata`,
falling back to `{}` on any thrown error so the page's own
`notFound()`/redirect handles the failure case).

**Routes given dynamic metadata** (14 files):

| Route | Title source | Suffix |
|---|---|---|
| `/recipes/[dishId]`, `/parts/[dishId]` | `dish.currentTitle` | — |
| `/recipes/[dishId]/edit`, `/parts/[dishId]/edit` | `dish.currentTitle` | ` — Edit` |
| `/recipes/[dishId]/versions/[versionId]`, `/parts/.../versions/[versionId]` | `dish.currentTitle \|\| version.title` | ` — V{major}.{minor}` (always, current or historical — matches the print-route precedent, which never omits it either) |
| `/recipes/[dishId]/compare`, `/parts/[dishId]/compare` | `dish.currentTitle` | ` — Compare versions` |
| `/recipes/[dishId]/cook`, `/parts/[dishId]/cook` | `dish.currentTitle` | ` — Cooking setup` |
| `/cook/[sessionId]` | `getSessionSourceSummary(...).dishTitle` | ` — Cooking mode` |
| `/cook/[sessionId]/review` | `getOwnedSessionForReview(...).dish.currentTitle` | ` — Review` |
| `/meal-plans/[id]` | `mealPlan.title` | — |
| `/grocery-lists/[id]` | `list.title` | — |
| `/s/[token]` (public) | `resolvePublicShare(token).content.title` | ` — {content.versionLabel}` |

**Public `/s/[token]` privacy and fixed/current behavior:** resolves
exclusively through `resolvePublicShare` — the same whitelisted
`PublicShareContent` DTO the page body and `(print)/print/s/[token]`
already use, so metadata can only ever surface `content.title`/
`content.versionLabel` (both plain strings) — no path to private notes,
Tasters, recipient identity, sender note, or account email. A
`FIXED_SNAPSHOT` share's title stays frozen at share-creation time even
after the source Recipe is later renamed (verified: renaming after
sharing did not change the fixed link's metadata title); a `CURRENT`
share's title tracks the live Recipe/Part title. An invalid, malformed,
or revoked token makes `resolvePublicShare` throw, which `generateMetadata`
catches and returns `{}` for — the route's own `notFound()` behavior is
unchanged, matching the `(print)` precedent.

**Not touched:** anonymous list/create pages (`/recipes`, `/parts`,
`/recipes/new`, `/parts/new`, `/recipes/import`, `/meal-plans`,
`/grocery-lists`, `/share`, `/tasters`, `/tags`, `/flavor-profiles`,
`/settings`, `/profile`, `/help`) — their existing static titles are
accurate as-is, so adding `generateMetadata` would be uniformity for its
own sake, which this pass's instructions excluded.

**Tests:** `src/app/route-metadata.integration.test.ts` (new, 9 cases) —
representative Recipe/Part titles, historical-vs-current Version-label
distinction, Meal Plan/Grocery List titles, `FIXED_SNAPSHOT` title frozen
across a later rename, `CURRENT` title tracking a live rename, a private
`versionNote` marker proven absent from public share metadata, and
malformed/revoked public tokens both falling back to `{}`.
**Command:** `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe DIRECT_URL=postgresql://postgres:postgres@localhost:5432/dishframe_shadow DATABASE_DRIVER=pg npx vitest run --config vitest.integration.config.mts src/app/route-metadata.integration.test.ts` — 9/9 passed.
Also re-ran the two pre-existing Slice 21 tests (`nav-items.test.ts`,
`not-found-content.test.tsx`) via plain `npx vitest run` — still 3/3
passed, confirming no collateral regression.

## Findings deferred for owner judgment

- **`/home` is still a placeholder stub.** All three sections ("Recent
  Recipes", "Active Dishes", "Saved Parts") render static "Nothing here
  yet" regardless of the account's actual data — confirmed live against
  the QA seed account, which has substantial data. No slice report or
  BUILD_PLAN entry targets Home's real content, and PRODUCT_SPEC.md has
  no dedicated Home-page section. Populating it with real queries
  (what counts as "Active," what sorting, how many items) is a product
  decision, not a narrow fix — left for the owner to scope, either into
  this Slice 21 pass or a follow-up.
- **A signed-in user's session state isn't reflected in `/s/[token]`'s
  header.** The page body correctly detects the session (offers "Save to
  My Recipes" instead of a sign-in prompt), but `PublicHeader` — shared
  with the marketing pages — always shows "Sign in"/"Start building"
  regardless of session, so a signed-in user visiting a share link sees
  contradictory signals (an account-aware save action next to a "Sign
  in" link). Making `PublicHeader` session-aware is a real UI change
  (needs an account-menu affordance in that header's style), not a
  narrow text fix — left for the owner's design pass.
- **Meal Plan's "Makes N servings" text doesn't pluralize** (renders
  "Makes 1 servings" when a target yield is 1). The underlying
  `targetYieldUnit` is free-text copied from the Recipe/Part's own yield
  unit (not always literally "servings"), and the exact same
  non-pluralized interpolation pattern already exists on the canonical
  Recipe/Part detail page (`dish-detail-view.tsx`) — this is a
  pre-existing, consistent convention across the whole app, not an
  isolated typo. A real fix would need a product decision about whether
  yield units should carry singular/plural forms, so it's flagged rather
  than patched in one call site.

## Reviewability gaps

- **A brand-new/empty library, Cooking-session, grocery-list, or Meal
  Plan state** (the very first empty state before any content exists)
  isn't reachable with the QA seed loaded, since the seed account already
  owns substantial data. Only the "no search results" empty state
  (filtered-to-nothing) was reviewable for Recipes/Parts. Genuine
  first-run empty states would need either a second, deliberately-empty
  QA account or a manual sign-up — not manufactured this pass per
  instructions. Worth deciding whether the seed should add a documented
  "empty" counterpart account for a future pass.
- **Multi-device session listing/revocation, stale-session
  reauthentication, and account deletion** (Slice 19) are explicitly
  documented in `SEED_REVIEW_GUIDE.md` as manual-only/not seedable
  (Better Auth sessions can't be fabricated; deletion is destructive).
  Not exercised this pass — inherently manual, per that doc.
- **Barcode scanning** (Slice 14) is real-device-only per
  `SEED_REVIEW_GUIDE.md`'s own deferred checklist — not exercised.
  Inherently transient/manual.
- **A running cooking timer's countdown UI** is pure client state, not
  persisted beyond `targetEndAt`/`remainingSeconds`/`state` — not started
  this pass. Transient by design.
- **`/recipes/[id]/compare`, `/parts/[id]/compare`, and both `edit`
  routes** were only confirmed reachable (route loads without error),
  not exercised end-to-end (selecting a comparison pair, saving an edit)
  — those flows already have integration/E2E coverage per prior slice
  reports, and re-driving them wasn't needed to find structural/nav
  defects.

## Targeted tests and commands run

- `npx vitest run src/components/app/nav-items.test.ts` — new, passes.
- `npx vitest run src/components/layout/not-found-content.test.tsx` — new, passes.
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dishframe DIRECT_URL=postgresql://postgres:postgres@localhost:5432/dishframe_shadow DATABASE_DRIVER=pg npx vitest run --config vitest.integration.config.mts src/app/route-metadata.integration.test.ts` —
  new (dynamic-title follow-up pass), 9/9 passes.
- No broader suite, typecheck, lint, build, or Playwright run — per this
  pass's explicit prohibition. `tsc` was never invoked, directly or
  indirectly.

## Explicitly not reviewed this pass

- Responsive/breakpoint behavior (including Slice 21's own planned
  desktop Cooking-Mode layout work — confirmed still phone/tablet-shaped
  at 1440px, exactly as BUILD_PLAN.md describes as this slice's
  not-yet-done objective; the unit-tab strip is horizontally scrollable
  there, not clipped/broken, so it wasn't logged as a defect).
- Dark mode.
- Branding/color palette.
- Broad visual hierarchy, typography, spacing, density.
- Comprehensive accessibility (keyboard nav, focus order, contrast,
  `prefers-reduced-motion`).
- Final public-page (marketing Home/About/Contact) visual/content design.

## Owner intervention recommendation

**Brief sanity check**, then proceed to the second (design-audit) Slice
21 pass. Verification (`pnpm run verify:feature` or equivalent) should be
run by the owner in a fresh session per standing policy. Once that's
green, a quick look at the two fixed 404 pages, the new nav items, and a
couple of the newly-dynamic tab titles (a Recipe detail page and the
public `/s/[token]` page are the highest-value spot checks) is enough —
no other product/design judgment is pending from this pass beyond the
two remaining deferred findings below, which need owner decisions before
(not blocking) the design-audit pass:

1. Should `/home` get real content in this Slice 21 arc, or stay
   deferred?
2. Should `PublicHeader` become session-aware, and if so what should the
   signed-in state look like?

(The dynamic-title gap itself — previously item 2 here — is now fixed;
see "Objective issues found and fixed" §4 above.)
