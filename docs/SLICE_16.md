# Slice 16 — Read-Only Sharing and Independent Copies

**Status:** Implemented, plus one focused correction pass (durable
acceptance after copied-Dish deletion; MATERIALIZED PartLink content
preserved in both the public DTO and accepted copies; image-token
authorization reviewed). Gate 7 technical preflight complete (no owner
decision required — see `docs/GATE_7_ARCHITECTURE_REVIEW.md` §4).

## Gate 7 preflight result

Full result recorded in `GATE_7_ARCHITECTURE_REVIEW.md` §4. Summary: schema
mostly fit as-is; two additive gaps closed (`ShareLink.showCreatorName`,
new `ShareLinkAcceptance` model for durable idempotency); existing
`revokeSharesAndCancelPendingShares` already satisfied deletion/revocation
requirements untouched; image/Blob model already satisfied the shared-
immutable-asset design, needing only the deferred image-route token
branch. No blocking conflicts.

## Share modes and public-data boundary

`ShareLink.mode` is `FIXED_SNAPSHOT` (default) or `CURRENT`. Public
resolution (`sharing/service.ts`'s `resolvePublicShare`) does zero
session-based authorization — only token verification (HMAC, constant-time
compare, `sharing/tokens.ts`) and `revokedAt`/`expiresAt` checks. Content is
built exclusively through the explicit whitelist in `sharing/public-dto.ts`
(`PublicShareContent`) — title, description, image, ingredients,
instructions, yield, time, cuisine, tags, Flavor profiles, nutrition,
aggregate rating/count, nested Part content. Never a raw Dish/DishVersion
serialization with fields stripped after the fact. A poison-field
integration test confirms Taster names and Cooking Session notes never
appear in the serialized output.

## Fixed snapshot / current link

A `FIXED_SNAPSHOT` link resolves the whole nested content tree once, at
creation time, and stores it verbatim as JSON in `ShareLink.frozenSnapshot`
(plus a flat `imageAssetIds` list for the image route's authorization
check) — never rebuilt, so it is immune to later edits, archiving, or even
the nested nested-Part's own later changes (fully denormalized). A
`CURRENT` link stores no snapshot; every view re-resolves the root Dish's
`currentVersionId` fresh. Both modes are proven distinct by an integration
test (edit-after-share leaves a fixed link's title unchanged but changes a
current link's).

## Creator attribution

`ShareLink.showCreatorName` (new field, default `false`) is read live and
combined with the live `owner.name` at render time — deliberately kept
outside the frozen snapshot, since attribution is explicitly
owner-toggleable independent of content (Gate 7 §2.3).

## Independent-copy engine

Generalizes `duplicateDish` rather than introducing a second architecture:
`sharing/graph.ts`'s `buildShareGraph` is an ownerless recursive resolver
(deduping by `versionId` in a `Map`, depth-guarded at 50) producing a
post-order node list; `dishes/service.ts`'s new `createIndependentCopyFromGraph`
consumes that graph inside a caller-supplied transaction, reusing
`insertSections`/`copyMoreNutrients`/`structuralSearchTextFor`/
`getDuplicationRatingSnapshot` — the same private helpers `duplicateDish`
already uses. One recipient Dish is created per distinct source `dishId`;
`PartLink` targets are remapped to already-created recipient ids (safe
because `graph.order` guarantees children are created before parents).

**Correction pass — MATERIALIZED content.** The original pass inherited
`dishes/queries.ts`'s `partLinkContentInclude`, which filters to `LIVE`
PartLinks only — silently dropping a `MATERIALIZED` occurrence (a
Part-deletion snapshot, ARCHITECTURE_PROPOSAL.md §H's materialization
table). That mattered: a `FIXED_SNAPSHOT` share can pin a *historical*
Version (Product Spec §83.3), and a historical Version can carry a
MATERIALIZED occurrence whose content the app's own historical-Version
view already renders — so both the public DTO and the accepted copy were
silently missing real, previously-visible content. Fixed: `sharing/graph.ts`
now queries both `linkState`s and represents each container's direct
PartLinks as a `ShareGraphPartLinkRef` union (`LIVE` | `MATERIALIZED`); a
MATERIALIZED ref's own nested PartLinks (always LIVE-shaped — materialization
never recurses) feed into the same graph traversal as ordinary children, so
their targets are copied normally. `dishes/service.ts`'s `insertPartLinks`/
`insertSections` were widened additively (a new `MaterializedPartLinkInsert`
member alongside the existing `PartLinkInput`) to write a MATERIALIZED row
directly — reusing the exact same frozen-snapshot representation the
repository already has, never a live dependency on the deleted Part, and
never a second recipient Part for content that has no live source to copy.
`sharing/public-dto.ts` renders both kinds to the same `PublicPartLinkNode`
shape (a MATERIALIZED node's description/image/prep-time/cook-time/difficulty
stay `null` — the frozen snapshot never captured those, matching
`sections/service.ts`'s own `PartLinkTree` renderer). `CURRENT`-mode shares
can never reach a MATERIALIZED occurrence by construction (`deletePart`
refuses to materialize a still-current usage), so this only affects
`FIXED_SNAPSHOT` shares of a historical Version — proven by a dedicated
integration test.

## Version mapping and provenance

Multiple distinct source Versions referenced for one Part become
sequential local majors (V1.0, V2.0, …) in ascending source-version order —
new majors, not minors, since these are independent snapshots rather than a
real edit lineage. `DishVersion.sourceVersionId` is left unset (it encodes
same-Dish lineage, Arch §F.4, which doesn't apply); provenance instead
rides the existing `Dish.sourceKind("ACCEPTED_SHARE")/sourceDishId/
sourceDishVersionLabel/sourceTitle` fields (reflecting whichever source
Version became the copy's current Version) plus a short auto-generated
`versionNote` per copied Version naming its exact source label.

## Idempotent acceptance

`ShareLinkAcceptance`: `@@unique([shareLinkId, recipientId])` is the
authoritative "only once" guard, independent of whether the resulting copy
still exists. `saveSharedCopy` wraps the graph copy **and** the
acceptance-row insert in one transaction — a lost double-submit race is
caught as a unique-constraint violation and rolls back the entire copied
graph (proven by a dedicated test simulating a concurrent winner), then
re-queries and returns the winner's copy.

**Correction pass — survival after copied-Dish deletion.** `createdDishId`
was originally `String @unique` with `onDelete: Cascade`, so deleting the
recipient's own copy deleted the `ShareLinkAcceptance` row too, silently
letting the same recipient accept the same share again — a real violation
of Gate 7 §2.8's "only once." Fixed with the smallest additive schema
change: `createdDishId` is now `String? @unique` with `onDelete: SetNull`
(migration `20260804230155_slice16_correction_acceptance_nullable`) — the
acceptance row is the durable proof of "already used," and now outlives
the copy it once pointed at. `saveSharedCopy` returns a three-way
`SaveSharedCopyResult` (`"created"` / `"already_accepted"` /
`"previously_accepted_copy_deleted"`); the last never creates a new copy.
The public share page (`(share)/s/[token]/page.tsx`) checks this state
server-side before rendering anything — a recipient who deleted their copy
sees "You previously saved this share, but that copy was deleted." and no
Save action at all, never a second chance at "Save another copy" (matching
the settled rule that another personal copy only ever comes from the
ordinary Duplicate flow, and only before deleting the existing one). A
different recipient can still accept the same share independently — proven
by a dedicated test alongside the deletion-survival one.

## Shared ImageAsset behavior and image-token security

A copied `DishVersion` reuses the source's exact `imageAssetId` — no new
`ImageAsset` row, no Blob duplication (proven by an integration test
asserting a single `ImageAsset` row survives). `/api/images/[assetId]`
gained a `?shareToken=` branch (`isImageAssetVisibleViaShareLink`) —
the one place a logged-out public viewer can read a private-Blob-backed
image, authorized by share-token membership in the frozen or live
`imageAssetIds` set, never by session or `ImageAsset` ownership.

**Correction pass — focused security review, one gap closed.** Verified
and now covered by a dedicated integration test (previously untested):
forged/mismatched-signature tokens, revoked links, and expired links are
all rejected before any asset check runs; a valid token for an unrelated
`imageAssetId` (not actually part of that share's content) is rejected; a
`CURRENT` link's authorization reflects the live source immediately (an
image removed from the current Version stops being visible). One real gap
found and fixed: the public share token lives directly in the URL path
(`/s/[token]`), unlike every other route's cookie-based session — the
site-wide `Referrer-Policy: strict-origin-when-cross-origin` already
strips the path for cross-origin destinations, but still sends the full
URL (token included) as `Referer` on same-origin navigation (e.g. clicking
"Sign in" from the share page), which could otherwise reach DishFrame's own
access logs. `next.config.ts` now adds a `no-referrer` override scoped to
`/s/:token*`, verified by a `next.config.test.ts` unit test. No logging
statement anywhere in the sharing feature prints a raw token (checked —
none exist). Image responses already used `Cache-Control: private,
max-age=3600` (never a shared/CDN cache) for both the session and
share-token paths — left unchanged, not a gap.

## Revocation / deletion / survival

No changes needed to `deleteDish`/`deletePart`'s existing
`revokeSharesAndCancelPendingShares` step — already revokes every
`ShareLink` and cancels every pending `DirectShare` for a deleted `dishId`,
in the same transaction as the delete. Proven: permanent source deletion
makes both fixed and current links unresolvable; explicit revocation does
the same; an accepted copy survives both, plus later independent edits on
either side. Account deletion isn't implemented anywhere in the repo yet
(Slice 19) — `ShareLink.owner`/`DirectShare.sender` already carry
`onDelete: Cascade`, so the correct hard-cascade behavior is already
structurally in place for when that slice builds the deletion flow.

## Schema / migration

Two additive migrations, both create-only-generated, inspected, and applied
against local Postgres:

- `20260804220548_slice16_sharing_acceptance` (original pass):
  `ShareLink.showCreatorName` column, `ShareLinkAcceptance` table/constraints.
- `20260804230155_slice16_correction_acceptance_nullable` (this pass):
  `ShareLinkAcceptance.createdDishId` → nullable, its FK →
  `onDelete: SetNull` (was `Cascade`).

Both shadow-database diffs proposed dropping pre-existing raw-SQL CHECK/FK
constraints and trigram indexes Prisma can't see (hand-authored SQL from
earlier migrations) — removed from the migration files per AGENTS.md. This
pass also found and removed an unrelated, already-*applied* stray migration
(`20260804224201_slice16`, containing only those same spurious drops and no
real schema change — not something this pass's own commands produced) by
resetting the local disposable Postgres container and replaying clean
migration history. `db:verify:local` and `db:scan-migrations` both pass
clean on the current database.

## Tests added or changed

- `sharing/tokens.test.ts` (unit): unchanged this pass.
- `(auth)/sign-in/page.test.ts` (unit): unchanged this pass.
- `next.config.test.ts` (unit, extended): the new `/s/:token*` `no-referrer`
  override.
- `sharing/sharing.integration.test.ts` (integration, grew from 12 to 17
  tests): the original 12 (fixed vs. current resolution, creator
  attribution, poison-field exclusion, revoked/expired rejection,
  deletion-revokes-links, recursive copy identity mapping, idempotent
  acceptance, ImageAsset reuse, copy survival/independence, invalid-token
  rejection, transaction-rollback-on-race — all still passing, one updated
  in place for the new three-way `saveSharedCopy` result shape) plus 5 new:
  acceptance survives copied-Dish deletion and blocks re-acceptance;
  another recipient can still accept independently; a MATERIALIZED
  occurrence in a shared historical Version renders publicly and copies
  correctly with no live cross-owner dependency; image-token authorization
  (forged/revoked/expired/unrelated-asset rejection); current-link image
  authorization reflecting a live source change.

## Targeted commands actually run

This pass: `npx prisma migrate dev --create-only` (twice — the original
schema-gap migration was already applied from the prior pass) against
local Postgres, inspected, then applied via `migrate deploy`;
`pnpm db:docker:reset` + a clean `migrate deploy` replay (to remove the
stray migration described above); `pnpm db:verify:local`;
`pnpm db:scan-migrations`; `npx prisma generate`; `npx vitest run` scoped
to `sharing/sharing.integration.test.ts`, `sharing/tokens.test.ts`,
`next.config.test.ts`, `dishes.integration.test.ts`, the image-route
integration test, `sign-in-card.test.tsx`, and `dish-detail-actions.test.tsx`
(all pass, no regressions).

**Correction on the prior handoff's own disclosure:** that report stated
`tsc --noEmit` was not run during the original implementation pass. That
was inaccurate — it was run once, early in that pass, against explicit
policy (filtered to one file's output before the policy violation was
recognized and the approach was corrected to per-file editor diagnostics
for the remainder of that pass and the entirety of this one). That single
run did not mutate any repository state — `tsc --noEmit` only type-checks
and exits, it never writes files. No further broad typecheck has been run
since, in either pass. Repository-wide lint/format/build were not run in
either pass.

## Limitations / owner-review targets

- No Playwright/E2E coverage for this slice (create-link → view logged out
  → save after sign-in) — deferred; the integration suite already proves
  the underlying service behavior, and a real-browser journey adds mainly
  session/redirect plumbing on top, per the test-value policy's "add E2E
  only where it provides value beyond service/integration tests." Worth a
  manual click-through before relying on this in production.
- No component tests for `ShareDialog`/`SaveSharedCopyButton`/
  `ShareLinkList` — UI is functional but not deeply styled (Tier 2,
  design pass deferred to Slice 21A per the roadmap).
- `/share` is not wired into `APP_NAV_ITEMS` (primary nav) — reachable via
  the per-Dish Share action and direct URL only, matching how Meal Plans
  also isn't in that list yet; nav placement is left for the design audit.
- No `use cache`/tag-based caching on the public share page — `next.config.ts`
  doesn't enable the experimental caching flag this would need; the page is
  ordinary dynamic rendering, correct but not optimized for public-scale
  traffic (not a concern at this app's personal/family scale).
- A MATERIALIZED occurrence's copy carries no description/image/prep-time/
  cook-time/difficulty — the frozen snapshot never captured those fields in
  the first place (`resolveMaterializedSnapshot` only ever stored
  Sections/Ingredients/Instructions/nested-PartLinks), matching the app's
  own historical-Version renderer. Not a gap this pass introduced or could
  close — there is no source data to preserve.
- `duplicateDish` (ordinary same-account "Duplicate," not sharing) still
  drops MATERIALIZED content — this correction pass only touched the
  sharing copy engine (`createIndependentCopyFromGraph`), per the scope
  given. Worth the owner's attention as a follow-up if "Duplicate" is
  expected to be equally faithful.

Broad verification (`verify:feature`/`verify:all`, full unit/integration
suites, Playwright, lint/format/build) is left to the owner in a fresh
session.
