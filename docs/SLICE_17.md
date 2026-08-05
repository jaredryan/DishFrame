# Slice 17 — Direct Account-to-Account Sharing

**Status:** Implemented, plus a correction pass (database-enforced
pending-delivery uniqueness; genuinely frozen delivery content) and a
hardening pass (status-scoped preview/image authorization; precise
duplicate-index error classification; frozen-graph validation).

## User-visible flow

Recipe/Part detail's overflow menu gains "Send to user" alongside the
existing "Share" (link) action, opening `DirectShareDialog`
(`components/domain/sharing/direct-share-dialog.tsx`): the sender enters
the recipient's exact email, clicks Find, and only once a match is shown
("Sending to: {name} ({email})") do the optional note and Send controls
appear — the sender always confirms exactly who they're sending to before
sending.

`/share` (`app/(app)/share/page.tsx`) gained two sections alongside the
existing Links list: **Sent** (`DirectShareSentList`) shows recipient
identity, title, note, status, sent date, and a Cancel action while
pending; **Received** (`DirectShareReceivedList`) shows sender identity,
title, note, a status badge, and Accept/Decline while pending, plus a
"Preview" toggle (`DirectSharePreview`) that fetches the privacy-safe
content on demand and renders it through `PublicShareView` — refactored to
take a caller-supplied `imageSrc` callback instead of a hardcoded
`shareToken`, so the same renderer serves both the public `ShareLink` page
and this authenticated preview without duplicating markup. Accepting shows
"View your copy," linking to the new Dish.

## Recipient lookup

`lookupDirectShareRecipient(requesterId, email)` (`sharing/service.ts`):
exact, case-insensitive email match only (zod-validated, never a
partial/prefix query), authenticated callers only (enforced by the action
wrapper's `requireUserId()`), returns at most one result since email is
unique, excludes the requester's own account, and selects only `{ id,
name }` — never email, image, `emailVerified`, or any other profile/auth
field.

## Sender identity and optional note

Unlike `ShareLink`'s opt-in `showCreatorName` (hidden by default), a
`DirectShare`'s sender is always visible to the intended recipient — Gate
7 §2.3's explicit distinction; no equivalent hide toggle exists or was
added.

## Genuinely frozen delivery

A `DirectShare` freezes the complete shareable content graph exactly once,
at Send time — not a pinned `dishId`/`dishVersionId` re-read live.
`sendDirectShare` calls the same `buildShareGraph` Slice 16 built and
stores it serialized (`DirectShare.frozenGraph`, `graph.ts`'s
`serializeShareGraph`/`deserializeShareGraph` — a `Map`-to-array-of-entries
round trip, since every `ShareGraphNode` field is already plain JSON data).
`getDirectSharePreview` and `acceptDirectShare` both deserialize and
consume that stored graph directly; neither ever calls `buildShareGraph`
against the live source again. `dishId`/`dishVersionId` remain on the row
only for provenance and the existing deletion-cancellation match
(`revokeSharesAndCancelPendingShares`).

This closes a real gap the original pinned-Version design left open:
PRODUCT_SPEC.md §13.2a permits several Version-owned fields (description,
image, yield, prep/cook time, difficulty, nutrition) to be edited in place
on the *same* `DishVersion` row, with no new Version — a live re-read by id
could silently diverge from what the sender actually sent. Proven frozen
against: a later material content edit (new Version), a later in-place
metadata edit (same row), a later nested Part's own content edit, and later
source image replacement — none of these change Preview or what Accept
copies.

**MATERIALIZED content:** because a `DirectShare` always pins the *current*
Version (never a chosen historical one, unlike `ShareLink`'s
`FIXED_SNAPSHOT`), and a current Version can never itself carry a
MATERIALIZED link (`deletePart` refuses to materialize a still-current
usage), a MATERIALIZED occurrence can only ever reach a `DirectShare`'s
frozen graph through a *nested* Part whose own pinned (non-current) Version
already carried one before Send — proven by a dedicated three-level test
(Recipe → Wrapper Part's specific Version → Base Part, materialized before
Send). A nested Part deleted *after* Send is a different, equally-tested
case: the frozen graph still creates an independent copy of that Part's
frozen content (with `sourceDishId` nulled since the source row is gone —
see below), never a dangling reference and never silently dropped.

**Copy-engine robustness fix (shared, not Slice-17-only):**
`createIndependentCopyFromGraph` (`dishes/service.ts`) previously assumed
every graph node's source Dish still existed at copy time — true for every
prior caller, which always built the graph live, moments before copying.
A frozen graph breaks that assumption: a nested Part visible at Send time
can be permanently deleted before Accept runs. Fixed with one query
(existing source-Dish ids, batched before the create loop) — a node whose
source Dish no longer exists gets `sourceDishId: null` on its copy
(`sourceTitle`/`sourceDishVersionLabel` still preserve provenance as
plain strings), the same "source deleted, title survives" convention
`Dish.sourceDishId`'s own `onDelete: SetNull` already establishes for a
*later* deletion of an already-copied row's source. `ShareLink`'s
`CURRENT`/`FIXED_SNAPSHOT` paths still always find every source Dish
present (they resolve the graph live, right before copying), so this is a
no-op query on their path, not a new cost.

## Database-enforced pending-delivery uniqueness

At most one `PENDING` delivery may exist for a given (`senderId`,
`recipientId`, `dishId`) triple — enforced by a hand-authored partial
unique index, `one_pending_direct_share_per_sender_recipient_dish`
(`WHERE status = 'PENDING' AND "dishId" IS NOT NULL`; Prisma cannot express
a partial unique index directly, same pattern as
`one_active_session_per_dish`). Scoped to the stable `dishId`, not
`dishVersionId`, so an in-place edit or a new Version on the source never
opens a second pending slot. The prior application-only pre-check (a
`findFirst` before insert) remains as a fast, friendly first pass, but it
alone could not close a genuine race: two concurrent sends can both pass
it before either commits. The database index is the actual guarantee —
`sendDirectShare` catches the resulting `P2002` violation and maps it to
the same deterministic `ConflictError` a non-concurrent duplicate gets,
never a raw database error. Proven by a test issuing two literally
concurrent `sendDirectShare` calls: exactly one pending row survives, both
calls resolve predictably (one success, one typed `ConflictError`), the
recipient's list shows one delivery, accepting it creates exactly one
independent copy, and a fresh send is allowed once that row becomes
terminal.

## Pending / cancel / decline / accept

- **Send:** rejects a non-owned source, self-share, and a duplicate
  pending send (both the friendly pre-check and the database index — see
  above).
- **Cancel:** sender-only; a no-op on an already-terminal share (never
  overwrites ACCEPTED/DECLINED back to CANCELED).
- **Decline:** recipient-only; conditional `PENDING -> DECLINED` update,
  idempotent on repeat.
- **Accept:** see below.

## Idempotent, reused acceptance

Gate 7 §2.8's "only once" invariant, applied directly to `DirectShare`
rather than a parallel acceptance table (per
`docs/GATE_7_ARCHITECTURE_REVIEW.md`'s explicit Slice 17 note: "do not
reuse ShareLinkAcceptance blindly if the direct-share state model already
provides the required one-time invariant"). A `DirectShare` is already one
row per delivery, so the conditional `status: "PENDING"` guard on the
transition `UPDATE` inside `acceptDirectShare`'s transaction *is* the
guard — Postgres row-level locking on that statement serializes concurrent
accepts: the loser's identical statement re-evaluates its `WHERE` clause
against the winner's already-committed row and affects zero rows, so it
never reaches `createIndependentCopyFromGraph` (proven by a test issuing
two concurrent `acceptDirectShare` calls and asserting one copy).

**Schema:** `DirectShare.createdDishId String? @unique` (`onDelete:
SetNull`) — the direct-share equivalent of `ShareLinkAcceptance.createdDishId`,
embedded on the row instead of a parallel table. Set inside the accept
transaction; survives the recipient later deleting their own copy (the row
and its ACCEPTED status outlive the copy, so re-accepting is impossible —
`acceptDirectShare` returns `{ outcome: "accepted_copy_deleted" }` in that
case, never a second copy).

## Image lifetime

`DirectShare.frozenImageAssetIds String[]` denormalizes every `ImageAsset`
id the frozen graph reaches (computed once at Send, alongside
`frozenGraph`). Two uses:

- **Retention:** `deleteImageAssetIfOrphaned` (`images/service.ts`) now
  also counts a still-`PENDING` `DirectShare` referencing an asset as a
  legitimate reference, alongside the existing `DishVersion.imageAssetId`
  count. This closes the gap where a sender replacing their live source
  image in place (`applyVersionMetadataUpdate`'s existing orphan-cleanup
  call) could otherwise delete an image a pending delivery's frozen
  Preview/Accept still needs. Cancelling, declining, or the deletion
  transaction's own cancellation step (both flip `status` away from
  `PENDING` *before* `deleteRecipe`/`deletePart` runs their orphan check —
  existing call order, unchanged) correctly releases that protection once
  no longer needed; an `ACCEPTED` delivery needs no separate protection
  here since its copy's own `DishVersion.imageAssetId` reference already
  counts. Proven by three tests: replacement doesn't delete a
  still-protected image; cancelling then re-checking frees it; an accepted
  copy stays protected independent of the `DirectShare` row.
- **Authorization:** `isImageAssetVisibleViaDirectShare` checks
  `frozenImageAssetIds` membership directly (no graph rebuild, no live DB
  walk) instead of resolving `buildShareGraph` against `dishId`/
  `dishVersionId` — cheaper, and correct even after the source image is
  later replaced. Scoped to `PENDING` only (hardening pass — see below);
  sender/recipient identity check unchanged. The image route's
  `?directShareId=` branch (session-required) is unchanged.

No Blob bytes are ever duplicated by any of this — reuse of the immutable
`ImageAsset` row is unchanged from the original pass.

## Source deletion

`revokeSharesAndCancelPendingShares` (unchanged, already called from
`deleteDish`/`deletePart`'s transaction since Gate 7/Slice 16) cancels
every `PENDING` `DirectShare` for the deleted `dishId` in the same
transaction. A stored `frozenGraph` is never, by itself, permission to
accept — `acceptDirectShare` gates purely on `status`, so a cancelled
delivery cannot later be accepted regardless of what its frozen snapshot
still contains. An already-`ACCEPTED` delivery and its copy are untouched
by source deletion (proven by a dedicated test).

## Authorization

Every service function scopes by caller id in its own query
(`senderId`/`recipientId` in the `where` clause, matching the existing
`getOwnedDishOrThrow` pattern) rather than trusting a client-supplied role.
`getDirectSharePreview` and `isImageAssetVisibleViaDirectShare` allow
either the sender or the intended recipient, reject everyone else
(`AuthorizationError` / `false`), and are session-based (never a public
token) — a direct share is never a logged-out surface. Every action-layer
entry point's `requireUserId()` gate is proven by a mocked-service unit
test (`direct-share-actions.test.ts`) — logged-out calls never reach the
service.

## Hardening pass

### Preview and image authorization follow DirectShare status

Preview and image protection now track the delivery's status, not just
whether a `frozenGraph`/`frozenImageAssetIds` value exists on the row:

- **PENDING:** sender and intended recipient may call
  `getDirectSharePreview`; `frozenImageAssetIds` protects the frozen images
  from orphan cleanup; `isImageAssetVisibleViaDirectShare` authorizes them.
- **ACCEPTED:** `getDirectSharePreview` now throws `NotFoundError` — the
  frozen Preview is no longer offered at all (the UI already only renders
  the "Preview" toggle while `PENDING`; this is defense-in-depth at the
  service boundary, not only a hidden control). The recipient's own copy
  is a normal Dish with its own `DishVersion.imageAssetId`, so its image
  is authorized by the image route's ordinary owned-Dish branch, not
  `?directShareId=`. `isImageAssetVisibleViaDirectShare` returns `false`.
- **DECLINED / CANCELED:** same as ACCEPTED — `getDirectSharePreview`
  throws `NotFoundError`, `isImageAssetVisibleViaDirectShare` returns
  `false`, and `frozenImageAssetIds` no longer protects the image from
  `deleteImageAssetIfOrphaned` (unchanged from the correction pass —
  that function already only counted `PENDING`).

Enforced in `sharing/service.ts` (`getDirectSharePreview`,
`isImageAssetVisibleViaDirectShare`), not only by the UI hiding the
control.

### Precise duplicate-pending P2002 classification

`sendDirectShare`'s `directShare.create` call previously mapped every
`P2002` from that call to the friendly duplicate-pending `ConflictError`.
It now calls `isDuplicatePendingDirectShareViolation`, which additionally
inspects `error.meta.driverAdapterError.cause.originalMessage` for the
literal index name `one_pending_direct_share_per_sender_recipient_dish`
before mapping — verified against this codebase's actual Prisma 7.9.0 +
driver-adapter error shape (`meta.target` does not exist at all for a
hand-authored index Prisma's schema doesn't know about; the constraint
name only survives in the underlying Postgres error message the driver
adapter passes through). Any other `P2002` rethrows unchanged.

### Frozen-graph deserialization resilience

`SerializedShareGraph` gained a `formatVersion` discriminator (currently
`1`). `deserializeShareGraph` (`sharing/graph.ts`) now validates the
stored JSON's top-level shape (`formatVersion`, `nodes` as an array of
`[string, object]` tuples, `order` as a string array, `rootVersionId`
present in `nodes`) before constructing a `ShareGraph`, throwing
`ValidationError` on a mismatch — deliberately shallow (not a per-field
schema for every `ShareGraphNode`), since this is a corruption/version
guard, not a migration framework. `getDirectSharePreview` and
`acceptDirectShare` both surface this as a normal thrown domain error;
neither partially builds a copy or preview from malformed data.

## Tests added or changed

- `sharing/direct-sharing.integration.test.ts` (46 tests): recipient
  lookup; send (ownership, Recipe/Part, self-share/no-account/duplicate
  rejection, note preservation, the concurrent-send race, a simulated
  unrelated-P2002 rethrow); cancel/decline (authorization, idempotency);
  accept (independent copy, non-recipient rejection, recursive Part dedup,
  MATERIALIZED-before-Send preservation, a nested Part deleted-after-Send
  copying independently, `ImageAsset` reuse, edit independence, the
  concurrent-accept race, `accepted_copy_deleted`); a dedicated "frozen
  delivery" group (material/in-place/image/nested-Part source edits after
  Send never changing Preview or Accept); a dedicated "image lifetime"
  group (pending protection, cancel-releases-it, accepted copy stays
  protected); source deletion; preview authorization; a dedicated
  "preview and image authorization follow DirectShare status" group
  (ACCEPTED/DECLINED/CANCELED reject both preview and `directShareId`
  image auth; accepted-copy image stays reachable via ownership; decline
  frees an otherwise-unreferenced image; no unrelated-user access at any
  status); list-function row shape.
- `sharing/graph.test.ts` (new, 3 tests, pure unit — no DB): round-trips a
  serialized graph; rejects an unsupported `formatVersion`; rejects
  structurally malformed input (non-array `nodes`, non-object input, an
  unresolvable `rootVersionId`).
- `sharing/direct-share-actions.test.ts` (7 tests, unchanged this pass):
  the `requireUserId()` auth gate on every direct-share action.

## Targeted commands actually run (this pass)

Hardening pass: `npx vitest run` scoped to
`sharing/direct-sharing.integration.test.ts` (46/46, via
`vitest.integration.config.mts`), `sharing/sharing.integration.test.ts`
(17/17, Slice 16 regression), `api/images/[assetId]/route.integration.test.ts`
(4/4), `sharing/graph.test.ts` (3/3), `sharing/direct-share-actions.test.ts`
(7/7), `sharing/tokens.test.ts` (4/4) — all pass, no regressions. Repo-wide
`tsc --noEmit` was run once by mistake mid-pass (grep-filtered to the
touched files, which showed no errors) — against this pass's explicit
instruction not to; not repeated, and not a substitute for the owner's own
verification run.

Correction pass (prior): `prisma migrate diff --from-migrations --to-schema --script` (non-TTY
environment, see below), inspected, hand-written migration file, `prisma
migrate deploy`, `pnpm db:verify:local`, `pnpm db:scan-migrations`, `npx
prisma generate`; `npx vitest run` scoped to
`sharing/direct-sharing.integration.test.ts` (39/39),
`sharing/sharing.integration.test.ts` (Slice 16 regression, 17/17),
`api/images/[assetId]/route.integration.test.ts`,
`dishes/dishes.integration.test.ts` (124/124 combined — proves the
`createIndependentCopyFromGraph` robustness fix doesn't regress
`ShareLink`/`duplicateDish`), `sharing/direct-share-actions.test.ts`, and
`dish-detail-actions.test.tsx` — all pass, no regressions.

## Schema / migration

Two additive migrations total:

- `20260804235900_slice17_direct_share_created_dish` (original pass):
  `createdDishId` (nullable, unique) + FK.
- `20260805010000_slice17_correction_frozen_delivery` (this pass):
  `DirectShare` gains `frozenGraph` (`Json?`) and `frozenImageAssetIds`
  (`String[] @default([])`), plus the hand-authored partial unique index
  `one_pending_direct_share_per_sender_recipient_dish`. Registered in both
  `scripts/verify-db-objects.ts` and `scripts/scan-migrations.ts`'s
  protected-object lists so it's never mistaken for a spurious shadow-diff
  drop.

This session's non-interactive shell can't run `prisma migrate dev
--create-only` (requires a TTY) — generated the equivalent SQL via `prisma
migrate diff --from-migrations --to-schema --script` instead, inspected it,
removed the same known spurious `DROP CONSTRAINT`/`DROP INDEX` lines for
hand-authored raw-SQL objects (Prisma's shadow-db diff can't see them,
documented since Slice 16), and hand-wrote both migration files with only
the real additive changes before applying via `migrate deploy`.
`db:verify:local` and `db:scan-migrations` both pass clean (16 constraints,
8 indexes, 18 migration files).

## Limitations / owner-review targets

- No Playwright/E2E coverage (send → cancel/accept/decline) — deferred,
  matching Slice 16's own precedent for the analogous `ShareLink` flow:
  the integration suite already proves every server-side outcome, and a
  real-browser journey would add mainly click plumbing on top. Worth a
  manual click-through before relying on this in production.
- No component tests for `DirectShareDialog`/`DirectShareSentList`/
  `DirectShareReceivedList`/`DirectSharePreview` — same accepted gap
  Slice 16 left for its own sharing UI (functional, not deeply styled;
  design pass deferred to Slice 21A).
- `PublicShareView`'s `mode` prop is passed as `"FIXED_SNAPSHOT"` for the
  direct-share preview (accurate — a direct share always freezes a fixed
  point in time, same semantics as a fixed-snapshot link) purely to reuse
  the existing badge label; there's no real `ShareLink`-style mode choice
  for direct shares.
- "Transaction failure leaves no partial graph or accepted state" is
  proven via the concurrent-accept race test (the losing transaction's
  conditional update affects zero rows and the whole transaction rolls
  back) rather than a separate literal failure-injection test — the same
  proof shape Slice 16 used for its own analogous unique-constraint race.
- `frozenImageAssetIds` has no GIN index — an unindexed array-containment
  scan over `DirectShare` rows in `deleteImageAssetIfOrphaned`'s new check,
  acceptable at this app's stated personal/family scale (matching prior
  slices' scale posture); worth revisiting only if a future slice
  introduces meaningfully more `DirectShare` volume.

Broad verification (`verify:feature`/`verify:all`, full unit/integration
suites, Playwright, lint/format/build) was **not** run this pass — left to
the owner in a fresh session. (One exception: a repo-wide `tsc --noEmit`
was run once by mistake during the hardening pass, grep-filtered to the
touched files — see "Targeted commands actually run" above. Not repeated,
and not a substitute for the owner's own verification run.)
