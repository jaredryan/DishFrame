# Slice 19 — Profile/security refinements, authentication-session management, sharing management

**Status:** Implemented, plus one correction pass. Sharing management
(§90.1) needed no changes — Slices 16/17's `/share` page (active/expired
links, revoke without locating the item, pending/received direct shares,
cancel-in-place) already satisfies it in full; this slice only touched
account/session/deletion.

## Correction pass (this pass)

Two fixes to the original account-deletion/session-freshness implementation
below:

1. **Pending received DirectShares now terminalize on account deletion.**
   `deleteAccount` previously hard-deleted shares the account *sent* but
   left a share the account only *received* as an indefinitely-`PENDING`,
   un-actionable-looking row for the sender (`recipientId` merely nulled by
   the `SetNull` FK). `deleteAccount` now cancels every `PENDING` share
   where `recipientId` is the account being deleted, in the same
   transaction and *before* the `User` row is deleted (so the query can
   still filter by `recipientId`) — the identical `updateMany({ status:
   "PENDING" } → CANCELED)` pattern `revokeSharesAndCancelPendingShares`
   (dishes/service.ts) already uses for ordinary Dish deletion, not a new
   mechanism. Already-`ACCEPTED`/`DECLINED`/`CANCELED` received shares are
   untouched (the `status: "PENDING"` filter); shares the account *sent*
   keep their existing hard-delete behavior; another user's accepted
   share/copy is untouched (scoped to this one `recipientId`).

   Consequence: the surviving sender-facing row is `CANCELED` with
   `recipientId` null — not previewable (`getDirectSharePreview` already
   rejects non-`PENDING`), not acceptable/declinable (recipientId no longer
   matches any caller), not image-authorizing
   (`isImageAssetVisibleViaDirectShare` already rejects non-`PENDING`), and
   — because `deleteImageAssetIfOrphaned`'s pending-share retention check
   only counts `PENDING` rows — its `frozenImageAssetIds` no longer block
   ordinary orphan cleanup once no other reference remains.

2. **Session-freshness constant centralized, semantics confirmed correct.**
   Inspected the installed `better-auth@1.6.24` source directly
   (`freshSessionMiddleware`, `dist/api/routes/session.mjs`): freshness
   compares `Date.now()` against `session.createdAt` only, default
   `freshAge` is `3600 * 24` (24h) when unset. `auth.ts` previously left
   `session.freshAge` unset (relying on that library default) while
   `account/service.ts` independently hardcoded a matching 24h constant —
   correct by coincidence, not by construction. `auth.ts` now exports
   `SESSION_FRESH_AGE_SECONDS` and sets `session.freshAge` to it
   explicitly; `account/service.ts`'s `isSessionFresh` imports the same
   constant instead of redeclaring it. Confirmed `isSessionFresh` already
   used `session.createdAt` (not `updatedAt`) — the last-active display
   value (`AuthSessionSummary.lastActiveAt`) was already sourced from
   `updatedAt` separately, so no behavior changed there, only the constant's
   provenance.

## Authentication-session management (§89)

`/profile` gained a "Signed-in devices" section (`AuthSessionManager`,
server-rendered list from `accountService.listAuthSessionsForDisplay`).
Thin wrapper over Better Auth's own `auth.api.listSessions`/`revokeSession`/
`revokeOtherSessions` — no new schema, no parallel session store. Raw
session tokens never reach the client (§89's explicit prohibition):
`revokeAuthSession(requesterId, sessionId)` resolves the client-supplied row
`id` to its token server-side only, after an ownership check
(`Session.userId === requesterId`) that's redundant with — but defense-in-
depth alongside — Better Auth's own internal check. Device/browser
description is a small regex-based `describeUserAgent` (no dependency
added); "approximate last-active time" uses `Session.updatedAt`.

**Freshness — `auth.ts`'s `session.freshAge`, set explicitly to the exported
`SESSION_FRESH_AGE_SECONDS` (24h; matches the `better-auth@1.6.24` default,
now pinned rather than merely relied upon):** Better Auth's own
`freshSessionMiddleware` compares `Date.now()` against
`session.session.createdAt` — never `updatedAt` — so ordinary activity
(which bumps `updatedAt` via `session.updateAge`) never silently
re-extends the window; `updatedAt` is used only for the separate, cosmetic
"last active" display value (`AuthSessionSummary.lastActiveAt`). Confirmed
by reading the installed library's source directly, not assumed.
`listSessions` enforces `freshAge` natively; `account/service.ts`'s
`isSessionFresh` imports the same `SESSION_FRESH_AGE_SECONDS` constant
(rather than an independently hardcoded duration that could drift from it)
so the page's pre-check and `deleteAccountAction`'s hand-rolled gate both
match Better Auth's actual rule by construction, and a stale session
renders a `ReauthenticatePrompt` instead of surfacing Better Auth's raw
error. Genuine limitation, not invented: this app is Google-OAuth-only
with no password/OTP to re-verify in place, and `/sign-in` already
redirects away a still-signed-in visitor — so "reauthenticate" here is
sign out, then sign back in via Google (`ReauthenticatePrompt`, shared by
both session management and account deletion below). After ~24h since the
last real sign-in, both features require this round trip; that's Better
Auth's own security posture for sensitive operations, not a bug introduced
here.

## Account deletion (§91, Arch §I/§J/§K.6)

New `src/lib/account/service.ts`'s `deleteAccount(userId)`: collects every
`ImageAsset` id this account's own `DishVersion`s reference **and** every
`ImageAsset` this account ever uploaded (closing Slice 5's "never-attached
upload" accepted gap, but only at this one full-account-sweep point — not a
general fix for ordinary per-Dish deletion), then one transaction:

1. Clears two raw-SQL `Restrict` FKs that would otherwise block the cascade
   — `PartLink.targetVersion` (any PartLink targeting this account's own
   Part Versions, deleted outright — account deletion isn't `deletePart`'s
   two-phase materialization flow) and `GroceryList.linkedMealPlan` (any of
   this account's own linked lists flipped to `STANDALONE`, mirroring
   `deleteMealPlan`'s existing step) — same defensive pattern
   `src/test/factories.ts`'s `deleteTestUser` already uses in test teardown.
2. Cancels every `PENDING` `DirectShare` where `recipientId` is the account
   being deleted (`status → CANCELED`, same pattern as ordinary Dish
   deletion's `revokeSharesAndCancelPendingShares` — see "Correction pass"
   above) — done *before* the `User` row is deleted so the query can still
   filter by `recipientId`.
3. `tx.user.delete(...)` — Postgres `ON DELETE CASCADE` removes every owned
   aggregate, including a genuine **hard delete** of every `ShareLink`/
   `DirectShare` this account *sent* (not the soft revoke/cancel a single
   Dish's deletion uses — `senderId`/`ownerId` cascade; `recipientId` is
   `SetNull`, so a share this account only *received* survives as a
   `CANCELED` row per step 2, not untouched).
4. Re-runs the existing `deleteImageAssetIfOrphaned` reference count
   against the collected candidate ids (now accurate, post-cascade) and
   returns freed storage keys.

`bestEffortDeleteBlob` runs after commit, same after-commit-only discipline
as `deleteDish`. No new schema/migration — every FK behavior this relies on
(`SetNull` on `Dish.sourceDishId`, `ShareLinkAcceptance.createdDishId`,
`DirectShare.createdDishId`, `ImageAsset.uploadedByUserId`) was already in
place from Slices 16/17.

**Confirmation UI:** `DeleteAccountDialog` (in `/profile`) requires typing
the exact account email (re-validated server-side against the session,
never trusted from the client), explains what's removed, links to the
existing `/api/export/account` export, and gates on the same freshness
check as session listing — `deleteAccountAction` returns `needs_reauth`
instead of deleting when stale.

## Cross-user survival (proven, not just asserted)

Both a `ShareLink`-accepted copy and a `DirectShare`-accepted copy survive
the source account's deletion, owned by the recipient, with `sourceDishId`
null and `sourceTitle` intact (plain string, no live join) — no
personally-identifying link remains. An `ImageAsset` still referenced by
another account's copy survives with `uploadedByUserId` nulled; one
referenced only by the deleted account is deleted and its blob queued for
best-effort removal. Correction pass: the mirror case — a `PENDING`
`DirectShare` a *deleted account only received* — no longer survives as a
dangling actionable-looking row; see "Correction pass" above.

## Schema / migration

None. Confirmed by inspecting the applied schema before writing any code —
every FK/cascade this slice depends on already existed.

## Tests

- `src/lib/account/service.test.ts` (unit): `isSessionFresh` fresh/stale
  boundary, exact-cutoff match against the imported `SESSION_FRESH_AGE_SECONDS`
  constant, and — correction pass — confirmation that a bumped `updatedAt`
  does not re-freshen an old `createdAt`; `describeUserAgent` browser/OS
  recognition.
- `src/lib/account/account.integration.test.ts` (12 tests): hard-delete
  of owned `ShareLink`/`DirectShare`; cross-user `ShareLink`-copy and
  `DirectShare`-copy survival with `sourceDishId` nulled; `ImageAsset`
  deleted + blob cleanup when only this account referenced it; `ImageAsset`
  survives (uploader nulled) when another account's copy still references
  it; no `Restrict` violation when deleting an account with a live PartLink
  to its own Part, or a GroceryList linked to its own Meal Plan.
  Correction pass, new `describe` block (3 tests): a received `PENDING`
  share is terminalized to `CANCELED`/`recipientId` null, becomes
  unpreviewable/unactionable, and releases its image's pending-share
  retention so `deleteImageAssetIfOrphaned` can free it; an already-terminal
  received share (`DECLINED`) is left untouched; another recipient's
  already-`ACCEPTED` share and copy are unaffected by a different
  recipient's deletion.
- `src/lib/account/revokeAuthSession authorization` (same integration
  file, 2 tests): rejects revoking another account's session id, and a
  nonexistent one — both resolve before touching `next/headers` (untestable
  under plain Vitest without a request context — no `test-auth.ts`-style
  fixture exists for this yet; see Limitations).
- `src/components/app/delete-account-dialog.test.tsx` (component):
  confirm-button gating on exact email match; success → sign-out + redirect;
  `needs_reauth` → reauthentication prompt, no sign-out; server-rejected
  confirmation surfaces inline.
- `src/components/app/auth-session-manager.test.tsx` (component):
  `needs_reauth` renders the prompt not the list; current session has no
  Sign-out control; per-session revoke and revoke-all-others both refresh;
  a revoke failure surfaces inline.

## Targeted commands actually run

Correction pass: `npx vitest run src/lib/account/service.test.ts
src/components/app/delete-account-dialog.test.tsx
src/components/app/auth-session-manager.test.tsx` (17/17 pass);
`npx vitest run --config vitest.integration.config.mts
src/lib/account/account.integration.test.ts` (12/12 pass, against the
already-running local Postgres container). **No command containing `tsc`,
and no broad verification (`check`, `verify:feature`, `verify:all`,
`verify:backend`/`verify:fullstack`, repo-wide lint/format/build, full
unit/integration suites, or Playwright), was run this pass** — left to the
owner in a fresh session.

## Limitations / owner-review targets

- `listAuthSessions`/`revokeSession`/`revokeOtherSessions`' actual Better
  Auth-delegated behavior (beyond the ownership-check boundary tested
  above) has no automated coverage — calling them needs a real
  `next/headers` request context carrying a legitimately Better-Auth-signed
  session cookie, which only `src/lib/auth/test-auth.ts` (Playwright-only)
  currently provides. Worth a manual click-through: sign in on a second
  browser/device, confirm it's listed, revoke it, confirm it's actually
  signed out.
- No Playwright coverage added for account deletion (destructive,
  session-ending — a real browser is genuinely the only way to observe the
  full sign-out-and-redirect behavior end to end). Manual click-through
  recommended before relying on this in production: delete a throwaway
  account that has a share accepted by a second test account, and confirm
  that second account's copy still renders correctly afterward — the exact
  Build Plan manual QA target.
- After ~24h since a real sign-in, both session management and account
  deletion require the sign-out/sign-in round trip described above — a
  genuine Better Auth default, not something this pass can shorten without
  weakening a real security property; flagged rather than silently changed.

## Owner intervention recommendation

**Brief sanity check.** After the owner's own verification run passes, open
`/profile` and confirm the Signed-in devices section and Delete account
dialog render without a runtime error, and — if practical — do the two
manual click-throughs above (second-device session revoke; account
deletion with an accepted share on another test account). No unresolved
product or design questions are pending; sharing management itself required
no changes.
