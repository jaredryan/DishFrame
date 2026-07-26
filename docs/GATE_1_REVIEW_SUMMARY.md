# Gate 1 Review Summary — What Changed and Where

**Purpose of this document:** a plain, correction-by-correction record of your Gate 1 feedback and exactly what was changed in response, so you can quickly verify each point was understood correctly and applied where you'd expect — without having to re-read the full, much longer `ARCHITECTURE_PROPOSAL.md`, `BUILD_PLAN.md`, and `PRISMA_SCHEMA_PROPOSAL.md` line by line. This document makes no new decisions of its own; it only points at where each decision now lives.

**Not yet applied:** no migration was run, no schema file was touched, no package was installed, no product UI was built, and no gate beyond Gate 1 was proceeded past — matching your explicit instructions.

---

## Confirmed owner decisions

### Share deletion behavior

Your six-point rule is now the explicit, authoritative statement in `ARCHITECTURE_PROPOSAL.md` §H.1 ("Share-link and direct-share lifecycle — authoritative, owner-confirmed"), restated verbatim in structure. Concretely:

| Your rule | Where it now lives |
|---|---|
| Editing a source doesn't affect a fixed snapshot | Unchanged from the original proposal — §H's snapshot table, footnoted to clarify this is about *content*, not link *validity* |
| Archiving doesn't revoke share links | Unchanged from the original proposal — restated explicitly in §H.1, point 2 |
| Permanently deleting a Recipe/Part revokes all its fixed and current share links | **New.** `ARCHITECTURE_PROPOSAL.md` §H (corrected table row), §I ("Permanently delete any Recipe or Part" row — the revocation step is now inside the same transaction as the delete itself), §J (Recipe/Part rows, and a new "Share revocation — triggered by source deletion" row). Schema: `ShareLink.revokedAt` — same column as owner-initiated revocation, just also set here. `BUILD_PLAN.md`: built into `deleteDish` from **Slice 3** and `deletePart` from **Slice 6**, verified by tests added in **Slice 16** (once the sharing UI exists to observe it) |
| Permanently deleting the source cancels pending direct shares | **New.** Same locations as above; `DirectShare.status → CANCELED` in the same transaction |
| Independent copies already accepted survive and remain the recipient's property | Unchanged — was already true by the deep-copy design; now stated explicitly in §H.1, point 5 |
| Account deletion removes all remaining share links and pending shares owned by that account | **Clarified as a hard delete**, distinct from the soft revoke/cancel used for single-Dish deletion. `ARCHITECTURE_PROPOSAL.md` §I (account-deletion row) and §J (account-deletion row); `BUILD_PLAN.md` Slice 19's test section now explicitly checks hard-delete, not soft-revoke |

I did **not** preserve a fixed share page after its source is permanently deleted — the public `(share)/s/[token]` route treats a `revokedAt`-set link (owner-revoked or deletion-triggered — same field) as unresolvable, full stop.

### Migration sequencing

Understood as: Tier 1 and Tier 2 are both part of the immediate build; group migrations for architectural coherence, not by Tier label or by smallest-count optimization. Result: **four migrations**, all applied together at the `BUILD_PLAN.md` Slice 2 boundary (not spread across later slices, not delayed for Tier-2-labeled tables) — grouped by domain cohesion and FK dependency order (core content/versioning → cooking/feedback → planning/grocery → sharing). Full rationale and the literal SQL in `PRISMA_SCHEMA_PROPOSAL.md` §3. `BUILD_PLAN.md` gained a new "Migration grouping" subsection right after its existing "Deviation from the prompt's suggested broad sequence" note.

---

## Required architecture corrections

| # | Your correction | What changed | Where |
|---|---|---|---|
| 1 | Persistent logical identities across Versions (Sections, Ingredients, Instructions, PartLink occurrences) | Added `lineageId` to all four models — a stable "family" identifier distinct from each row's own `id`, carried forward unchanged when content survives into a new Version, freshly generated only for genuinely new content. New `ARCHITECTURE_PROPOSAL.md` §D.-1 explains the mechanism and exactly what it unlocks (structured comparison, edit-vs-remove-and-add, reordering, per-ingredient preferences via §D.6a, occurrence-specific propagation via `PartLink.lineageId`). | `ARCHITECTURE_PROPOSAL.md` §D.-1, §D.3–D.6 (schema fields), §E (new clarifying note); `PRISMA_SCHEMA_PROPOSAL.md` §2 (literal `lineageId` columns + indexes); `BUILD_PLAN.md` Slice 4 (comparison tests now explicitly test lineage-based matching), Slice 6 (propagation now targets specific `PartLink.lineageId` occurrences) |
| 2 | Live vs. materialized `PartLink` as an explicit either/or state, enforced by a DB CHECK constraint | Added `PartLinkState { LIVE MATERIALIZED }`; made `targetDishId`/`targetDishVersionId` nullable; wrote the literal raw-SQL CHECK constraint enforcing exactly one of the two field-groups is populated | `ARCHITECTURE_PROPOSAL.md` §D.6 (full rewrite); `PRISMA_SCHEMA_PROPOSAL.md` §2 (schema) and §4.2 (the actual CHECK constraint SQL); `BUILD_PLAN.md` Slice 6 (test explicitly verifies the constraint rejects a row with both live and materialized fields set) |
| 3 | Self-contained Cooking Session history (no bare polymorphic `sourceId`) | `CookingSessionUnit` gained `label`/`sourceDishTitle`/`sourceDishVersionLabel` plus *optional, nullable* `sourceSectionLineageId`/`sourcePartLinkLineageId` for provenance-while-it-lasts; `CookingSessionChecklistItem` gained `displayText`/`displayQuantity`/`displayUnit` plus optional `sourceLineageId`, replacing the original bare `sourceId` field entirely | `ARCHITECTURE_PROPOSAL.md` §D.7 (full rewrite); `PRISMA_SCHEMA_PROPOSAL.md` §2; `BUILD_PLAN.md` Slice 7 (population described explicitly in `startCookingSession`, plus a new dedicated test: a session must still render correctly after its source is deleted) |
| 4 | Normalized grocery contributions, not a JSON breakdown | Removed `GroceryListItem.combinedFromSourceIds Json?`; added a real `GroceryItemContribution` model (source Version, Meal Plan entry, ingredient lineage, original name/quantity/unit) that source-breakdown, combination, uncombine, manual merge, and Meal-Plan sync all key off of | `ARCHITECTURE_PROPOSAL.md` §D.11 (full rewrite, with an explicit "supports every behavior" walkthrough); `PRISMA_SCHEMA_PROPOSAL.md` §2; `BUILD_PLAN.md` Slice 12 (generation/combination/uncombine descriptions updated) and Slice 15 (Meal-Plan resync now matches by `ingredientLineageId` + `mealPlanEntryId`) |
| 5 | Nutrition immutability — no third exception | Clarified explicitly (no schema change needed beyond what already existed): nutrition fields are ordinary immutable `DishVersion` content, governed by the same rule as everything else; "detach" against an already-saved Version is an ordinary `createSmallUpdate`/`createNewVersion` call, never an in-place mutation | `ARCHITECTURE_PROPOSAL.md` §D.2 (new explanatory paragraph directly under the field list), §L (nutrition row rewritten); `BUILD_PLAN.md` Slice 13 (`detachNutritionSource` description rewritten; new dedicated test: detaching against a saved Version creates a new Version, never mutates the existing row) |
| 6 | Ingredient-specific preferred-unit presentation, not one blanket per-Dish setting | Removed `Dish.preferredUnits Json?`; added `PreferredUnitOverride` targeting a specific `ingredientLineageId`. `UserPreference.measurementSystem` remains as the broad fallback; the override is the specific, opt-in exception | `ARCHITECTURE_PROPOSAL.md` §D.1 (field removed), new §D.6a (the override model + rationale, with your exact "16 tbsp → 1 cup while 2 tbsp elsewhere stays unchanged" example restated); `PRISMA_SCHEMA_PROPOSAL.md` §2; `BUILD_PLAN.md` Slice 5 (new `savePreferredUnitOverride` action + a dedicated test that one ingredient's override doesn't leak onto another) |
| 7 | Reference-aware image cleanup | Replaced `DishVersion.imageUrl`/`imageStorageKey` with `DishVersion.imageAssetId` pointing at a new `ImageAsset` model. Recommended and adopted: **query-based** reference counting (`COUNT(*)` of referencing `DishVersion` rows at delete/replace time), not a maintained counter column — deliberately, to avoid a second piece of state that could drift out of sync with the FK reality it summarizes. Account deletion deduplicates `storageKey`s before issuing Blob-delete calls | `ARCHITECTURE_PROPOSAL.md` new §D.2a (model + full rationale for the query-based-vs-counter choice you asked me to recommend), §F.8/§J/§I updated to reference it; `PRISMA_SCHEMA_PROPOSAL.md` §2; `BUILD_PLAN.md` Slice 5 (image tests now explicitly check an `ImageAsset` survives while any Version still references it) |
| 8 | Share-token hashing (SHA-256, not plaintext) | `ShareLink.token` → `ShareLink.tokenHash` (unique). Plaintext token generated at creation, returned once, never persisted; public resolve hashes the incoming token and looks up by `tokenHash` | `ARCHITECTURE_PROPOSAL.md` §D.13, §M (rewritten with the reasoning for why plaintext was under-protective), §C.9; `PRISMA_SCHEMA_PROPOSAL.md` §2; `BUILD_PLAN.md` Slice 16 (creation/lookup flow rewritten around `tokenHash`) |
| 9 | Schema-level corrections (six sub-items) | See the dedicated breakdown immediately below — each sub-item handled individually | Various — see below |
| 10 | Database adapters and CI | `@prisma/adapter-neon` for deployed/Neon, `@prisma/adapter-pg` for local/CI; CI uses a disposable Postgres service container in GitHub Actions (not Neon branch-per-run); `docker-compose.yml` offered as optional local convenience only | `ARCHITECTURE_PROPOSAL.md` new §K.10a, §O (updated), §P.2 (item 3 marked resolved); `PRISMA_SCHEMA_PROPOSAL.md` §5 |
| 11 | Image storage: private Vercel Blob, access authorized through a DishFrame route | Confirmed as the recommendation (was already Vercel Blob in the original proposal; the **private** requirement and the **route-authorized-access-not-raw-URL** requirement are both new). Dependencies/packages are **not** installed at this Gate 1 step, per your instruction — only the schema (`ImageAsset`) reflects it | `ARCHITECTURE_PROPOSAL.md` §L (rewritten), §M (new paragraph on read-side privacy), §P.2 (item 1 marked resolved); `BUILD_PLAN.md` Slice 5 (new `/api/images/[assetId]` route with dual owner-or-share-token authorization) |
| 12 | USDA FoodData Central — key registration, server-only env var | Confirmed: not implemented at Gate 1. Env var name standardized as `FDC_API_KEY` throughout, matching what you've already registered and configured in both `.env.local` and Vercel | `ARCHITECTURE_PROPOSAL.md` §L, §P.2 (item 2 marked resolved); `BUILD_PLAN.md` Slice 13 (dependency line updated to reflect the key is already in place — no owner action remains before that slice) |

### Correction 9 sub-items, individually

| Sub-item | What changed | Where |
|---|---|---|
| Add `CookingSession.updatedAt` | Added, `@updatedAt`, backing the existing `@@index([ownerId, state, updatedAt])` | `ARCHITECTURE_PROPOSAL.md` §D.7; `PRISMA_SCHEMA_PROPOSAL.md` §2 |
| Implement one-active-session-per-Dish as a real partial unique index in raw migration SQL | Done — literal SQL provided, no longer described as "realized as" without the actual statement | `PRISMA_SCHEMA_PROPOSAL.md` §4.4 |
| Normalized, owner-scoped uniqueness for Flavor Profiles and Grocery Categories | Both gained `normalizedName`/`displayName` (mirroring `Tag`'s existing pattern) and `@@unique([ownerId, normalizedName])` — previously neither had any uniqueness constraint at all | `ARCHITECTURE_PROPOSAL.md` §D.10/§D.11; `PRISMA_SCHEMA_PROPOSAL.md` §2 |
| `Stage = ARCHIVED` / `archivedAt` cannot drift into contradictory states | Handled two ways: kept-in-sync by the service layer (one call site sets both together) **and** a database CHECK constraint as defense in depth, per your "atomically... cannot drift" phrasing | `PRISMA_SCHEMA_PROPOSAL.md` §4.3 (the constraint itself, called out as newly added beyond what the original pseudo-schema had) |
| Rename away from anything containing "draft" | `saveEditorDraftAsFirstVersion` → `createDishWithInitialVersion` | `BUILD_PLAN.md` Slice 3 |
| No placeholder Version-comparison rows for unimplemented features | Slice 4's comparison view description rewritten: it simply omits the linked-Parts group when there's nothing to diff yet, rather than showing a labeled "coming soon" placeholder row | `BUILD_PLAN.md` Slice 4 |

---

## Testing cadence during implementation

Your revision is now the governing principle at the top of `BUILD_PLAN.md` §A, as its own named subsection ("Testing cadence during implementation (owner-directed revision)"), restating each of your bullets: build a slice coherently first, one focused verification pass at its boundary, `pnpm check` once per slice boundary (not continuously), one focused Playwright path per new UI flow, focused domain tests for the specific invariant just built, broad regression reserved for the eight Review Gates and Tier completion. High-risk correctness areas (deletion, versioning, authorization, cycle prevention, snapshots, transactions) keep their required dedicated coverage — what changed is *when* the broader suite runs, never *whether* the risky-path tests exist. I did not rewrite every individual slice's list of *what* to test (those lists were already reasonably scoped, not "run everything constantly"); I added the cadence principle once, prominently, so it governs every slice below it.

---

## Gate 1 deliverables checklist

1. ✅ `ARCHITECTURE_PROPOSAL.md` and `BUILD_PLAN.md` updated in place to reflect every confirmed decision and correction above.
2. ✅ Complete proposed Prisma schema drafted — `PRISMA_SCHEMA_PROPOSAL.md` §2.
3. ✅ Raw migration SQL drafted — `PRISMA_SCHEMA_PROPOSAL.md` §4 (pg_trgm extension, `PartLink` CHECK constraint, `Dish` archived-state CHECK constraint, partial unique index).
4. ✅ Migration grouping explained — `PRISMA_SCHEMA_PROPOSAL.md` §3.
5. ✅ Concise correction-by-correction mapping — this document.
6. ✅ Remaining owner questions identified — none; see `PRISMA_SCHEMA_PROPOSAL.md` §6 and `ARCHITECTURE_PROPOSAL.md`'s corrected §P.2 (all three original items resolved: private Blob confirmed, FDC key registered and configured, CI strategy settled).

**Not done, per your explicit instructions:** no migration applied, no production database touched, no product UI built, no package installed, no gate beyond Gate 1 proceeded past.

---

## If anything above doesn't match what you intended

Everything in this document is a pointer, not a new decision — if any mapping here looks like it missed the point of your feedback, the fix is almost certainly in the corresponding section of `ARCHITECTURE_PROPOSAL.md`, `BUILD_PLAN.md`, or `PRISMA_SCHEMA_PROPOSAL.md` referenced next to it, and I'd rather revise that section directly than leave a mismatch between what you asked for and what's written.

*End of `GATE_1_REVIEW_SUMMARY.md`.*
