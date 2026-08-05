# Slice 22 — Unified Single-/Multi-Recipe Direct Sharing

**Status:** Implemented. New functional slice after Slice 21 (Slice 21's
polish/design pass is deferred, not part of this work).

## Product behavior

Direct Recipe sharing is one unified flow, not a separate "bulk share"
feature: a plain one-Recipe send from a Recipe detail page and a
multi-Recipe send from `/share` both create the same
`DirectShareCollection` grouping — even a one-Recipe send. Part sharing is
unaffected and keeps its existing single-item `DirectShareDialog`/
`sendDirectShare` flow untouched.

The sender enters an exact recipient email, selects one or more owned
Recipes with a current Version from a searchable, minimal-field selector
(title/image/Stage — never a full graph load), may Select all or deselect
individually, adds one optional note, reviews, and sends atomically (every
selected Recipe's graph is frozen and validated together; one failure
leaves no partial collection). A server-enforced 50-Recipe batch maximum
is validated both in the zod schema and defensively in the service.

## Pending-recipient model

No placeholder Better Auth `User`/`Account`/`Session` is ever created for
an unregistered email. `DirectShareCollection.recipientId` and every child
`DirectShare.recipientId` stay `null` until a real match exists —
immediately at Send time if the normalized email already has an account,
or later via claiming. `recipientLookup` (normalized, lowercase, trimmed —
`src/lib/auth/email.ts`'s `normalizeEmail`, the one shared helper) is the
durable invitation-matching key, kept in sync on every child row so every
pre-existing per-row authorization/preview/image-authorization function
(`getDirectSharePreview`, `isImageAssetVisibleViaDirectShare`, etc.) keeps
working unchanged for a grouped child — no new authorization code needed
there.

Duplicate-pending protection covers both bound and not-yet-bound
recipients: a new partial unique index,
`one_pending_direct_share_per_sender_dish_recipient_email` (`(senderId,
dishId, recipientLookup) WHERE status = 'PENDING' AND collectionId IS NOT
NULL`), closes the gap the original `recipientId`-keyed index left open —
Postgres treats every `NULL recipientId` as distinct, so it alone could
never stop unlimited duplicate invitations to the same unregistered email.
The original index is untouched and still governs Part sends and legacy
ungrouped rows.

## Claim lifecycle

`sharing/collections.ts`'s `claimPendingDirectShareCollections(userId,
email, emailVerified)` is called from `account/init.ts`'s
`initializeNewUser` — the existing new-user initialization lifecycle
(Better Auth's `user.create.after` hook, plus the `(app)` shell layout's
retry-until-`defaultsInitializedAt` recovery path), never a parallel auth
path. It:

- no-ops immediately if `emailVerified` is false;
- finds every collection with `recipientId: null`, `recipientLookup`
  matching the normalized email, and at least one still-`PENDING` child
  (a fully sender-canceled collection has none, so it is never claimable —
  Slice 19's "canceled invitations must not become claimable" extended to
  the grouped case);
- binds the collection and its still-`PENDING` children to `userId` in one
  transaction; never touches an already-`CANCELED` child;
- never accepts or copies anything — the collection simply becomes an
  ordinary pending Received collection from that point on.

Idempotent and concurrency-safe by construction: the update's own
`recipientId: null` predicate is re-evaluated at execution time, so a
retried/concurrent call (the app-shell recovery path can call
`initializeNewUser` repeatedly before `defaultsInitializedAt` is set) finds
nothing left to bind.

### `/share` reconciliation — race repair (closed)

The one-shot claim window above has a narrow gap: `account/init.ts`'s
`(app)` shell recovery path only retries `initializeNewUser` while
`defaultsInitializedAt` is still unset, so once that first run completes,
nothing re-invokes the claim for that account again. A sender's "does this
email already have an account" read racing a few milliseconds ahead of the
recipient's own row becoming visible could therefore create an unclaimed
collection (`recipientId: null`) *after* the recipient's one-shot
initialization has already run — stranding it indefinitely with no future
trigger to bind it.

Closed by `sharing/collections.ts`'s
`reconcilePendingDirectShareCollectionsForViewer(userId)`, called from
`app/(app)/share/page.tsx` on every authenticated `/share` load, awaited
before the page's Sent/Received queries run (not alongside them in the
same `Promise.all`) so a newly claimed collection is guaranteed visible to
that same request rather than racing its own read:

- reads `email`/`emailVerified` fresh from `userId`'s own row — never a
  caller-supplied argument or client input — exactly like
  `initializeNewUser` already does, so this only ever claims for an email
  DishFrame itself has verified;
- delegates entirely to the existing `claimPendingDirectShareCollections`
  — no second claim algorithm — so it inherits the same
  verified-email-only, never-auto-accepts, transactional binding;
- is naturally idempotent: repeated `/share` loads (or concurrent ones)
  re-evaluate the same `recipientId: null` predicate at execution time, so
  once a collection is bound, later loads find nothing left to claim;
- is scoped to `/share` only, not an app-wide reconciliation mutation on
  every route, since a stranded invitation can only ever surface there.

With this in place there is no longer an accepted-but-unresolved
stranding case: any authenticated visit to `/share` (not just the
first-ever visit while `defaultsInitializedAt` is unset) repairs a
stranded invitation addressed to that account's verified email.

## Schema / migration

One additive migration, `20260805194758_slice22_direct_share_collections`
(inspected; spurious `DROP CONSTRAINT`/`DROP INDEX` lines the shadow-DB
diff proposed for pre-existing hand-authored objects were removed per
AGENTS.md):

- new `DirectShareCollection` model (`senderId`, nullable `recipientId`,
  `recipientLookup`, `note`, `createdAt`) with `sender`/`recipient`
  relations mirroring `DirectShare`'s own (`Cascade`/`SetNull`);
- `DirectShare.collectionId` (nullable, `onDelete: Cascade`) — null for
  Part sends and pre-Slice-22 rows, read as virtual one-item collections
  by the UI rather than migrated;
- the new partial unique index described above.

`scripts/scan-migrations.ts` and `scripts/verify-db-objects.ts` both
updated with the new index name. `db:verify:local`/`db:scan-migrations`
pass clean.

## Unified send / review flows

- `DirectShareCollectionDialog` (`components/domain/sharing/`): the send
  flow, used both from `/share` (`SendRecipesButton`, nothing preselected)
  and from a Recipe detail page's "Send to user" action (Recipe kind only
  — Part kind still opens the old `DirectShareDialog`), with that Recipe
  preselected. Compose → Review → Sent steps; an unregistered-email path
  requires an explicit confirmation checkbox before Review is enabled.
- `DirectShareCollectionReviewDialog`: the recipient's review — defaults
  every pending Recipe to selected, reuses the existing
  `DirectSharePreview` component unchanged for a per-item frozen preview
  (works because `recipientId` stays synced), and makes the "unselected
  Recipes will be declined" consequence explicit in both copy and the
  submit button's own label.
- `/share` gained "Sent Recipe collections" / "Received Recipe
  collections" sections (`DirectShareCollectionSentList`/
  `ReceivedList`) alongside the existing per-item "Individual sends"/
  "Individual received" sections, which now exclude grouped rows
  (`listSentDirectShares`/`listReceivedDirectShares` gained a
  `collectionId: null` filter) so nothing double-counts. A pending-count
  badge sits next to the Received Recipe collections heading — the
  minimum discoverability bar; no nav badge was added since none existed
  to reuse, and a general notification framework was explicitly out of
  scope.

## Frozen-copy, duplicate, deletion, and image guarantees

All inherited unchanged from Slices 16/17, proven again at the grouped
level rather than re-implemented: `buildShareGraph`/
`createIndependentCopyFromGraph` are reused as-is (multiple children copied
inside one shared transaction per `finalizeDirectShareCollectionDecision`
call — no second copy architecture); later source edits never change a
frozen collection's preview or accepted copy; permanent source deletion
cancels only a still-`PENDING` child, never an already-`ACCEPTED` one;
`deleteImageAssetIfOrphaned`'s pending-retention check and
`isImageAssetVisibleViaDirectShare` needed zero changes, since both already
key off the `DirectShare` table's own `status`/`frozenImageAssetIds`
columns, not `collectionId`. Account deletion required **no code changes**
at all for the grouped case — `deleteAccount`'s existing "cancel PENDING
`DirectShare` rows where `recipientId` is the deleted account, before the
cascade" step already operates on those same columns.

## Files and docs changed

Schema/migration: `prisma/schema.prisma`, new migration,
`scripts/scan-migrations.ts`, `scripts/verify-db-objects.ts`. Service:
new `src/lib/sharing/collections.ts` (now also
`reconcilePendingDirectShareCollectionsForViewer`, the `/share` race-repair
wiring); `src/lib/auth/email.ts` (new, shared `normalizeEmail`);
`src/lib/sharing/schema.ts` (new zod schemas); `src/lib/sharing/service.ts`
(`collectionId: null` filter on the two list functions);
`src/lib/account/init.ts` (claim wiring, unchanged this correction pass).
Actions: `src/lib/sharing/actions.ts`. UI: new
`direct-share-collection-dialog.tsx`, `-review-dialog.tsx`,
`-sent-list.tsx`, `-received-list.tsx`, `send-recipes-button.tsx`;
`dish-detail-actions.tsx` (Recipe vs. Part dialog dispatch);
`app/(app)/share/page.tsx` (correction pass: reconciliation call added).
Seed: `scripts/qa-seed/sharing.ts` (new `buildDirectShareCollectionFixtures`,
updated `wipeSharingFixtures`), `scripts/seed.ts`,
`scripts/qa-seed/catalog.ts` — all executed this pass via
`pnpm db:seed-images` (see "Seed executed" below). Docs: this file,
`PRODUCT_SPEC.md` §85.1–85.4 (new) and §96's Sharing bullets,
`ARCHITECTURE_PROPOSAL.md` §D.13 and §H.1 addendum,
`SEED_REVIEW_GUIDE.md`, `MANUAL_QA_SEED.md`.

## Tests run

Original pass — `npx vitest run --config vitest.integration.config.mts`
scoped to `sharing/direct-share-collections.integration.test.ts` (19/19),
`sharing/direct-sharing.integration.test.ts` (46/46, regression),
`sharing/sharing.integration.test.ts` (17/17, regression),
`account/account.integration.test.ts` (12/12, regression),
`account/init.integration.test.ts` (8/8). Unit:
`sharing/direct-share-actions.test.ts` (7/7, regression),
`sharing/direct-share-collection-actions.test.ts` (7/7),
`direct-share-collection-dialog.test.tsx` (5/5),
`direct-share-collection-review-dialog.test.tsx` (4/4). All passed at the
time, no regressions.

Correction pass (this document's current revision) —
`npx vitest run --config vitest.integration.config.mts
sharing/direct-share-collections.integration.test.ts`: **26/26** (the
original 19 plus 7 new — race-repair binds a stranded invitation without
auto-accepting, race-repair idempotency under concurrent/repeated calls,
wrong-email safety, unverified-email safety, fully-canceled-collection and
partial-cancellation safety through the actual `/share` reconciliation
wiring rather than the underlying claim function alone, exact-50-Recipe
atomic send/accept-all/retry-no-duplicate, and 51-Recipe rejection with no
partial collection/children). `pnpm run db:verify:local` and
`pnpm run db:scan-migrations` both re-run clean before seeding (no schema
drift). No other test file, `tsc`, lint, build, or broad verification
command ran this pass, per the task's verification restrictions.

## Seed executed (correction pass)

`pnpm run db:seed-images` ran successfully against the local Docker
Postgres (`localhost:5432`, `assertLocalDatabaseEnv` guard passed) — first
execution of the Slice 22 fixture code. Confirmed via direct database
query afterward (see `SEED_REVIEW_GUIDE.md`'s "Direct Share Collection
fixtures" section for the exact counts): primary QA account and
counterparty both exist and `emailVerified`; the unclaimed-invitation
email (`not-yet-joined-qa@dishframe.invalid`) has zero `users` and zero
`accounts` rows; the pending collection has 3 `PENDING` children, the
partial collection has 1 `ACCEPTED` + 1 `DECLINED`, the unclaimed
collection has 1 `PENDING` child with `recipientId` null; 11 Recipes/Parts
carry an attached image. The local database is left in this
image-enabled seeded state for the owner's UX/design review.

## Deferred / not built (explicit non-goals from the prompt)

Placeholder/pre-created users; passwords/magic links; account
backup/rollback; general notifications; public email share links;
automatic acceptance before consent; org/team membership; contact
syncing; transactional invitation email delivery; collection
templates/public curated collections; bulk sharing of Meal Plans/Grocery
Lists/Sessions/Reviews/Tasters; a broad visual redesign.

## No `tsc`, broad verification, build, broad Playwright, Git, or
unauthorized external-service calls ran this pass

Confirmed: only `npx vitest run --config vitest.integration.config.mts`
scoped to the one affected integration test file,
`pnpm run db:verify:local`, `pnpm run db:scan-migrations`,
`pnpm run db:status:local`, and `pnpm run db:seed-images` (its existing,
explicitly-authorized opt-in Vercel Blob image-upload path — the only
external-service activity this pass performed) ran. No `git` inspection
or mutation command was run. No `tsc`, lint, build, `verify:feature`,
`verify:all`, or Playwright command ran.

## Deferred owner/deployed QA (not run this pass, per instruction)

The following are documented here as the owner's checklist, not exercised
automatically this pass:

**Seeded-state visual review** (local, using the state left by
`db:seed-images` above): pending multi-Recipe Sent and Received collection
presentation; partially accepted/declined collection summaries;
unclaimed-recipient email presentation; frozen Recipe titles and images;
pending-count discoverability; Recipe-detail "Send to user" launch with
the current Recipe preselected; `/share`'s `SendRecipesButton` launch with
no initial selection; Recipe search, Select all, and individual
deselection in the send dialog; existing-recipient vs.
not-yet-registered-recipient wording.

**Real two-account deployed smoke test** (two real Google accounts,
deployed environment): send a collection to an email before that
recipient has ever signed into DishFrame; confirm no placeholder
User/Account is created; sign in with that Google account for the first
time; open `/share` and confirm the collection is claimed and appears
immediately (proving the reconciliation wiring end-to-end, not just the
database-backed test above); confirm frozen previews/images are
authorized; deselect one Recipe and accept the remainder; confirm
selected Recipes become independent recipient-owned copies and the
deselected one becomes declined; reload/retry and confirm no duplicate
copies; edit the source Recipe and confirm accepted copies don't change;
permanently delete the source Recipe and confirm accepted copies remain
available and usable.

**Family-sized collection** (~12 Recipes, deployed): send, review,
accept; note send/acceptance duration; confirm all Recipes appear once in
the recipient library; confirm the review UI stays usable at this size.

**Maximum-size stress check** (50 Recipes, deployed): record approximate
send/acceptance duration; watch for a Vercel request timeout, a Neon
transaction timeout, or memory/payload failure; confirm all-or-nothing
behavior holds. This pass's own 50-Recipe coverage
(`direct-share-collections.integration.test.ts`) is functional-correctness
proof against local Postgres only — it does not and cannot establish
Vercel/Neon production timing. If 50 is not reliably safe in that
deployed check, the documented fallback is lowering the product maximum
(e.g., to 20–25) rather than weakening all-or-nothing semantics.

## Owner intervention recommendation

**Focused manual review.** After the owner's own verification run passes,
two things are outstanding beyond a brief sanity check: (1) the deployed,
two-real-account smoke test is the only way to observe the actual race
this pass closes and its reconciliation UX end-to-end (the database-backed
test proves the binding logic, not the live sign-up-then-`/share`-visit
flow); (2) the 50-Recipe maximum's real-world safety under Vercel/Neon
has never been measured — see "Maximum-size stress check" above. Everyday
review (dialog rendering, Sent/Received sections, seeded-state visuals)
can proceed as a brief sanity check per the usual policy; the two items
above need the owner's own deployed-environment pass before the 50-Recipe
limit or the claim-race fix can be considered fully verified in
production conditions.
