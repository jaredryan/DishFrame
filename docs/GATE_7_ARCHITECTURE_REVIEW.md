# Gate 7 — Sharing Architecture Review

**Status:** Owner/product architecture review complete; Claude technical preflight pending  
**Applies to:** Slice 16 read-only sharing and independent copies, plus Slice 17 direct sharing  
**Purpose:** Preserve settled sharing decisions and give Claude one bounded, code-aware review to perform before Slice 16 implementation.

---

## 1. Gate outcome

The owner-facing portion of Gate 7 is complete.

The settled architecture is:

> One share acceptance creates one complete, independent, recipient-owned content graph. Stable Parts retain their identity within that graph, every exact referenced Part Version remains distinct, private history stays private, image media reuses DishFrame's existing shared immutable `ImageAsset`/Blob model rather than being duplicated per copy, and nothing in the accepted copy depends on the sender afterward.

Claude's remaining task is a focused technical preflight against the repository as it exists immediately before Slice 16.

This file contains both:

1. the settled product and architecture decisions; and
2. Claude's instructions for the remaining technical review.

The technical preflight is **not** Slice 16 implementation.

---

## 2. Settled sharing decisions

These decisions are final unless Claude finds a concrete repository constraint that makes one infeasible or unsafe.

### 2.1 Share modes

DishFrame supports two unlisted-link modes:

- **Fixed snapshot**
  - Default.
  - Freezes the selected Recipe or Part Version and its intentionally shareable metadata.
  - Later source edits do not change the public representation.
- **Current**
  - Explicit alternative.
  - Resolves to the source Dish's current Version while the share remains active.

Archiving a source does not revoke either mode.

Permanent source deletion revokes all fixed and current links. A revoked link no longer resolves publicly, even when a fixed snapshot remains stored internally for management or audit purposes.

### 2.2 Public-data boundary

A public share exposes only an explicitly whitelisted Recipe/Part representation needed to understand and copy the shared content.

It must exclude private account evidence and workflow data, including:

- Tasters and Taster identities;
- individual ratings;
- Reviews;
- Cooking notes;
- Cooking Sessions and session evidence;
- grocery lists;
- Meal Plans;
- private organization/activity data;
- unrelated historical Versions not intentionally included in the shared graph.

Use an explicit public DTO or snapshot shape. Do not serialize a broad internal model and remove fields afterward.

### 2.3 Creator identity

For unlisted links:

- creator identity is hidden by default;
- the owner may explicitly enable **Show my name**;
- otherwise the page uses generic DishFrame attribution or no personal creator attribution.

For direct account-to-account sharing:

- the intended recipient sees the sender's identity;
- the sender relationship must not remain a required live dependency after acceptance.

### 2.4 Independent accepted copy

Accepting shared content creates a fully independent recipient-owned graph.

After acceptance:

- sender edits do not update the recipient's copy;
- recipient edits do not affect the sender;
- source archive, revocation, deletion, or account deletion does not break an accepted copy;
- the recipient owns all copied Dishes, Versions, and Part links;
- an accepted `DishVersion` may reference the same shared immutable `ImageAsset`/Blob as its source (see §2.5) — this is storage-level deduplication, not a live sender-recipient dependency, and does not violate independence;
- no accepted Recipe or Part retains a private cross-account PartLink or other live sender-owned data dependency.

Slice 17 must reuse this same independent-copy engine rather than introduce another ownership model.

### 2.5 Images and media

Accepted copies own their copied Dish, DishVersion, Part, and PartLink graph. Image bytes follow DishFrame's existing shared immutable `ImageAsset` model (Arch §D.2a, round-3 Correction 7) instead of being duplicated per copy:

- an accepted `DishVersion` may reuse the exact same immutable `ImageAsset` row and underlying Blob bytes as the source;
- do not duplicate, re-upload, or transfer ownership of image bytes merely because content was duplicated or accepted from a share;
- shared immutable media is storage-level deduplication, not a live sender-recipient content dependency;
- replacing or removing the image on the sender's Version must not affect an accepted copy or an active fixed snapshot that still references the old asset (a new Version inherits `imageAssetId` by default rather than mutating the prior asset in place, per Arch §D.2a/§F.8);
- source archive, share revocation, permanent source deletion, and sender account deletion must not break an image still referenced by an accepted copy or an active fixed snapshot;
- Blob cleanup may occur only after no protected `DishVersion`, fixed snapshot, accepted copy, or other valid reference still needs the asset — preserve the existing reference-aware, count-based cleanup and `DishVersion.imageAsset`'s `onDelete: Restrict` (Arch §D.2a, round-3 Correction 7);
- authorization for reading an image comes through access to recipient-owned copied content (the accepted `DishVersion` referencing the asset), not through ownership of the `ImageAsset` row — consistent with `PRODUCT_SPEC.md` §90.2's existing reuse-across-accounts authorization model.

A fixed share must also remain visually fixed after ordinary source-image replacement or removal while the share remains active. Claude must verify how this holds under the current Blob and `ImageAsset` model.

### 2.6 Recursive Part-copy identity

The copy engine preserves stable Part identity inside the recipient graph.

For each stable source Part encountered anywhere in the shared graph:

- create exactly one recipient-owned Part;
- import every distinct source Part Version actually referenced by the graph;
- do not import unrelated historical Versions;
- repeated references to the same exact source Part Version reuse one copied Version;
- references to different Versions of the same source Part point to different copied Versions within the same copied Part.

Required conceptual mappings:

```text
sourcePartId -> recipientPartId
sourceVersionId -> recipientVersionId
```

Example:

- Sauce V1.0 is referenced twice.
- Sauce V2.0 is referenced once.

The recipient receives one Sauce Part with two copied Versions. Both V1.0 references reuse the first copied Version, and the V2.0 reference points to the second.

The traversal must remain cycle-safe even though authored Part cycles should already be prohibited.

### 2.7 Local Version numbering and provenance

Copied Dishes and Parts receive fresh local Version numbering.

For a copied Part with multiple referenced source Versions:

- the earliest copied local Version begins at V1.0;
- later copied Versions receive sequential local labels in a deterministic order;
- exact source-to-copy mapping is preserved by IDs, not by assuming labels remain equal;
- provenance may retain the original source Version label and source identity where appropriate;
- provenance must not create a live dependency on the sender's profile or source rows.

A copied Part must not begin at an unexplained V3.0 merely because the graph referenced the sender's V3.0.

### 2.8 One acceptance per recipient per share

A recipient may accept a given share only once.

Required behavior:

- acceptance is durably idempotent;
- retries, refreshes, duplicate submissions, and double-clicks return the already-created copy;
- after acceptance, the UI shows that the share has already been saved and links to the recipient-owned copy;
- there is no **Save another copy** action for the same share;
- another personal copy is created through DishFrame's ordinary Duplicate flow from the already-imported content.

This also applies to current-Version links. Later sender changes do not permit the same recipient to accept the same share again. Another independent delivery requires a new share or direct-share record.

### 2.9 Revocation, deletion, and survival

Settled behavior:

- **Source edit**
  - fixed share remains resolvable and unchanged;
  - current share reflects the current source.
- **Source archive**
  - active fixed/current shares remain resolvable.
- **Explicit share revocation**
  - public access ends;
  - previously accepted copies survive.
- **Permanent source deletion**
  - all active fixed/current links are revoked;
  - pending direct shares are cancelled;
  - public links no longer resolve;
  - previously accepted copies survive.
- **Sender account deletion**
  - remaining share/direct-share records are removed or revoked according to canonical deletion rules;
  - accepted recipient-owned copies survive;
  - those copies do not require a live identifying sender relationship.

Correct any stale test or documentation language suggesting that a fixed public link remains resolvable after permanent source deletion.

### 2.10 Fixed snapshots and current shares

A fixed snapshot remains unchanged after normal source edits and archiving.

A current share may change as the source's current Version changes, but it still exposes only the public whitelist.

Acceptance copies the exact graph visible through the share when the idempotent acceptance operation begins. It never establishes future synchronization.

---

## 3. Claude technical preflight instructions

Perform this section shortly before implementing Slice 16.

### 3.1 Read only

Read:

- `CLAUDE.md`
- `AGENTS.md`
- this file
- Slice 16 and directly referenced sections in `docs/BUILD_PLAN.md`
- directly referenced sharing/privacy/deletion sections in canonical product and architecture docs
- the applied Prisma sharing, Dish, DishVersion, PartLink, ownership, image, session, and deletion models
- current duplication/copy utilities
- current Vercel Blob and `ImageAsset` creation/deletion/compensation paths
- directly relevant tests

Do not reread unrelated slices or broad repository history.

### 3.2 Verify the repository against the settled design

Determine:

1. Whether the applied sharing schema can represent:
   - fixed and current shares;
   - opt-in creator attribution;
   - one acceptance per recipient/share;
   - a durable link from an acceptance to the created recipient copy;
   - revocation and deletion status.

2. Whether existing duplication utilities can be safely generalized for:
   - one recipient Part per stable source Part;
   - multiple referenced Versions within that Part;
   - exact source-Version-to-copy mapping;
   - nested Parts;
   - cycle-safe traversal;
   - all-or-nothing database behavior.

3. Whether the current image/Blob architecture already satisfies the shared immutable-asset model:
   - immutable `ImageAsset` reuse across accounts (an accepted copy referencing the same row as its source, Arch §D.2a, Correction 7);
   - fixed-snapshot image stability while the share remains active;
   - accepted-copy image survival after source archive, revocation, permanent source deletion, and sender account deletion;
   - reference-aware, count-based Blob cleanup;
   - `DishVersion.imageAsset`'s `onDelete: Restrict`;
   - image replacement/removal behavior on the sender's Version leaving prior-referencing copies/snapshots unaffected;
   - authorization for reading an image via access to recipient-owned copied content, not `ImageAsset` ownership.

4. Whether current source-deletion and account-deletion services already:
   - revoke links;
   - cancel pending direct shares;
   - preserve accepted independent copies;
   - avoid retaining prohibited identifying relationships.

5. Whether canonical docs/tests contain contradictions, especially stale language claiming a fixed link survives permanent source deletion.

6. Whether fresh local Version numbering can be implemented deterministically without importing unrelated source history.

### 3.3 Stop conditions

Stop and ask the owner only when the code-aware review finds a concrete conflict that requires a product decision, such as:

- the current schema cannot provide durable idempotency without choosing between materially different user behaviors;
- the existing shared-reference `ImageAsset`/Blob model cannot guarantee that an accepted copy's or fixed snapshot's referenced image survives source edits, archive, revocation, deletion, or account deletion, or cannot guarantee safe reference-aware cleanup;
- the deletion model cannot preserve accepted copies without retaining a prohibited live dependency;
- fresh local Version numbering creates a genuine domain conflict not covered above.

Do not stop for ordinary implementation choices that can be resolved locally.

Do not reopen settled questions merely because another architecture is possible.

### 3.4 Proceed conditions

When no blocking conflict exists:

- update this file's **Technical Preflight Result** section;
- reconcile narrow canonical contradictions discovered during review;
- report that Gate 7 is technically cleared;
- then wait for the separate Slice 16 implementation instruction.

Do not implement Slice 16 during the preflight unless the owner's prompt explicitly combines preflight and implementation.

### 3.5 Verification policy

For the preflight:

- do not modify production code unless a tiny documentation-only correction is explicitly required;
- do not run broad verification;
- do not run `tsc --noEmit`;
- do not run repository-wide lint, formatting, build, `verify:*`, Playwright, or full suites;
- use only narrow schema/code inspection and, if essential, the smallest relevant existing test.

---

## 4. Technical Preflight Result

**Status:** Complete — technically cleared, no owner decision required.

- **Schema fit:** `ShareLink`/`DirectShare` already support fixed/current modes, the mode-consistency CHECK constraint, and revocation. Two gaps found, both ordinary additive schema work, not product conflicts: (1) no field for opt-in creator attribution — added `ShareLink.showCreatorName Boolean @default(false)`; (2) no durable per-recipient acceptance record, so idempotency and "link to the created copy" could not be satisfied — added a new `ShareLinkAcceptance` model (`shareLinkId` + `recipientId` unique pair, `createdDishId` unique, cascades away if either the share link or the created copy is later removed, which is safe since the copy's independence never depended on this row).
- **Copy-engine fit:** `duplicateDish` (`dishes/service.ts`) already establishes the right pattern (one transaction, `insertSections`/`copyNutritionColumns`/`structuralSearchTextFor`, `sourceKind`/`sourceDishId`/`sourceTitle` provenance) but only copies one Dish non-recursively. Generalized rather than replaced: a new ownerless graph resolver (`sharing/graph.ts`) walks the LIVE `PartLink` chain from any root Dish/Version (no owner scoping — reading another account's content is exactly what a share is), deduping by `versionId` so a repeated reference reuses one node and a depth guard catches any latent cycle bug. A new exported `createIndependentCopyFromGraph` in `dishes/service.ts` consumes that graph and reuses the same private helpers `duplicateDish` already uses, inside one transaction. **Correction pass (see `docs/SLICE_16.md`):** the claim below this line originally read that `MATERIALIZED` PartLinks are safely dropped, matching `duplicateDish`'s own pre-existing behavior — that was checked more carefully during the correction pass and found incomplete: a `FIXED_SNAPSHOT` share can pin a historical Version (§83.3), and a historical Version can carry a MATERIALIZED occurrence whose content the app's own historical-Version view already renders, so silently dropping it was a real, reachable content-loss gap for sharing specifically (not for `duplicateDish`, which never offers historical-Version selection). `sharing/graph.ts` now resolves both `LIVE` and `MATERIALIZED` PartLinks and the copy engine preserves the latter as a frozen, no-live-dependency snapshot on the recipient's own copied PartLink row (`docs/SLICE_16.md`'s "Independent-copy engine" section has the full design). `duplicateDish` itself is unchanged and still drops MATERIALIZED content — a separate, narrower, pre-existing limitation outside this gate's scope.
- **Image/Blob strategy:** Already satisfies the shared-immutable-asset model as designed — `ImageAsset` is not owner-scoped, `deleteImageAssetIfOrphaned` is reference-counted via `COUNT(*)` against `DishVersion.imageAssetId`, and `onDelete: Restrict` is in place. The one real gap was the deliberately-deferred piece: `/api/images/[assetId]/route.ts` had no ShareLink-token branch (its own comment flagged this as waiting for Slice 16). Added: a fixed snapshot embeds its resolved `imageAssetId`s directly in `frozenSnapshot` (denormalized, so it never depends on the source surviving); a current-mode link resolves the live graph's `imageAssetId`s on each image request.
- **Idempotency strategy:** `ShareLinkAcceptance`'s `@@unique([shareLinkId, recipientId])` is the authoritative guard — a race is caught as a unique-constraint violation, the whole losing transaction rolls back (no partial copy), and the caller re-queries and returns the winner's existing copy.
- **Deletion/revocation fit:** `revokeSharesAndCancelPendingShares` (already called from `deleteRecipe`/`deletePart`'s final transaction) already revokes every `ShareLink` and cancels every pending `DirectShare` referencing the deleted `dishId`, inside the same transaction as the delete — matches Arch §I/§H.1 exactly, nothing to add. Account deletion (Arch §H.1 point 6) is not yet implemented anywhere in the repository (it is Slice 19's scope) — `ShareLink.owner`/`DirectShare.sender` already carry `onDelete: Cascade` to `User`, so the correct hard-cascade behavior is already in place structurally for whenever Slice 19 builds the deletion flow itself; nothing for Slice 16 to add or verify beyond that.
- **Version-numbering strategy:** Copied Dishes/Parts get fresh sequential majors (V1.0, V2.0, …) in ascending source-`(majorVersion, minorVersion)` order — treated as new majors (not minors) since these are independent snapshots, not a real small-edit lineage of each other. `DishVersion.sourceVersionId` is deliberately left unset on every copied Version (it encodes real same-Dish edit lineage per Arch §F.4, none of which applies here); provenance instead rides on the existing `Dish.sourceKind/sourceDishId/sourceDishVersionLabel/sourceTitle` fields (set from the Version that becomes the copy's current Version) plus a short auto-generated `versionNote` per copied Version naming its exact source label.
- **Contradictions corrected:** none found beyond what Arch §H/§H.1 already states correctly; no stale "fixed link survives permanent source deletion" language found in current docs/tests.
- **Migration expectation:** one small additive migration (`showCreatorName` column + `ShareLinkAcceptance` table/constraints) — no drops, no data migration.
- **Blocking conflicts:** none.
- **Recommendation:** proceed directly into Slice 16 implementation.

Keep this file as the canonical Gate 7 handoff.
