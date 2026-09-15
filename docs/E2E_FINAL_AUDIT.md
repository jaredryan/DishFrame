# E2E Final Coverage Audit (2026-09-15)

Reviewed the full `tests/e2e/` suite (20 specs, `helpers.ts`/`seed-session.ts`)
against the app's route tree (`src/app`) and spot-checked integration/unit
tests for areas suspected of already being covered below the browser layer.
Baseline: the current suite, including the recently added account-deletion,
onboarding/help, Meal Plan UI, and Grocery List UI specs, was treated as
settled and not rewritten.

## Areas reviewed and judged sufficient (no changes)

- **Auth/session/account lifecycle**: sign-in redirect boundaries
  (`public-pages.spec.ts`, `print.spec.ts`), account deletion
  (`account-deletion.spec.ts`).
- **Recipe/Part CRUD**: `recipe-golden-path.spec.ts` covers create/view/edit/
  archive/restore/duplicate/delete and ingredient controls; Parts share the
  same components (`compare`/`history`/`versions` page pairs are near-
  identical thin wrappers per `kind`), so Recipe coverage transfers.
- **Cooking Setup/Mode**: `cooking-golden-path.spec.ts`,
  `cooking-mode-timers.spec.ts`.
- **Import**: only a paste-based import exists in the product (no URL/photo
  variant); `paste-import.spec.ts` covers paste → review → correct → confirm
  → find-in-library.
- **Direct sharing**: `direct-sharing.spec.ts` already exercises the real
  Send dialog plus accept/decline/sender-cancel across two genuine browser
  contexts/accounts — nothing missing here.
- **Meal Plans, Grocery Lists, Settings (Preferences/Grocery
  Categories/Tasters), Appearance, Help/onboarding, public/contact/SEO**:
  existing specs are current and were not touched.

## Meaningful gaps found and closed

**Version history, promotion, and comparison** (`dish-detail-actions.tsx`'s
"Version history" / "Compare versions" overflow items) had zero E2E
coverage. `recipe-golden-path.spec.ts` creates multiple Versions but never
navigates to `/versions/[versionId]`, `/compare`, or exercises
`promoteHistoricalVersion` — three real, spec'd (PRODUCT_SPEC.md §13.7/
§13.8/§37.2) navigation targets with real routing, historical-content
rendering, and a state-changing action, none of it protected by any browser-
level test. Unit/component tests (`compare.test.ts`,
`version-picker-field.test.tsx`) cover the diff calculation and picker
component in isolation, not real navigation or persisted content.

Added `tests/e2e/version-history-and-compare.spec.ts`:
- creates a two-Version Recipe, opens Version history from the overflow
  menu, confirms the current-version banner;
- switches to the historical Version via the searchable picker, confirms
  the read-only banner and that historical content (not the current
  Version's) renders;
- promotes the historical Version back to current and confirms the
  original content is restored as a new Version;
- opens Compare versions from the overflow menu and confirms the default
  pair (promoted Version vs. its own historical source) shows "No
  differences" — an end-to-end fidelity check unit tests can't provide;
- explicitly compares two other Versions and confirms the ingredient
  rename renders as a real diff row.

**Cooking history page** (`/recipes/[dishId]/history`, the "Cooking
history" overflow item) was also never navigated to by any spec. Rather
than add a new spec/seed, extended `session-review.spec.ts`'s existing
golden path — which already produces a real ended Cooking Session — with a
final check that the Session appears under "Completed" on that page instead
of the empty state.

## Follow-up (2026-09-15): signed-in devices / revoke-session closed

The gap flagged below was closed rather than left deferred. Added
`seed-session.ts`'s `add-session <userId>` command and `helpers.ts`'s
`addAuthSession` — mints a genuine additional Better Auth session row for
an already-seeded account (not a second context with the same session's
cookies copied over), so a spec can hold two or more real, independently
revocable sessions for one account across separate browser contexts.

Added `tests/e2e/auth-sessions.spec.ts`: seeds three real sessions for one
account (current + two others, each its own context), confirms `/profile`
lists all three with exactly one "This device" badge, revokes one specific
other session and confirms only that context loses authenticated access
(redirected to sign-in) while the remaining other session and the current
session stay usable, then uses "Sign out all other devices" and confirms
the last remaining other session is also revoked while the current session
remains fully usable throughout. `auth-session-manager.test.tsx` and
`account.integration.test.ts` (see below) were left untouched — this adds
the missing browser layer on top, not a replacement for them.

### Original gap (for reference)

**Signed-in devices / revoke-session** (`/profile`'s `AuthSessionManager`,
`revokeAuthSessionAction`/`revokeOtherAuthSessionsAction`) is a real
session-security boundary with no E2E coverage, and `/profile` itself is
only visited for the account-deletion flow today. Not added here:
authorization-critical behavior (a session can't revoke another user's
session; "revoke others" excludes the current one) is already covered by
`src/lib/account/account.integration.test.ts`, and the click-triggers-
action/refresh wiring is covered by
`src/components/app/auth-session-manager.test.tsx`. A true E2E version
would need a second **real** auth session for the same account (not just a
second browser context with copied cookies, which is the same session) —
`seed-session.ts` has no primitive for that today. Given the authorization
boundary and the UI wiring are both already protected, this was judged not
worth the setup cost. Flagging it rather than silently skipping it, in case
the owner wants `seed-session.ts` extended for this later.

## Cleanup

None needed — no duplicate sync helpers, stale selectors, or redundant
tests found during this pass; `helpers.ts` was already consolidated in a
prior pass (see its own header comment).

## Product defects found

None.
