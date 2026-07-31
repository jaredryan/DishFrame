# Review Gate 4 — Cooking Session persistence

## Verdict

**Approved**

## Confirmed architecture

- **Transient Cooking Setup.** No DB writes occur before "Start cooking" — confirmed by the absence of any draft/setup table in `schema.prisma` and by Build Plan Slice 7's own route note ("transient client state, no persistence until submit"). Selection, ordering, inclusion, and proposed scaling live only in client state; canceling therefore leaves zero residue by construction, not by an explicit cleanup step. Historical Versions enter the same flow via §22.3's "Prepare to cook this version," which never mutates Stage or currentVersionId. This matches PRODUCT_SPEC §21.2/§21.3.

- **Start-session transaction.** One transaction inserting `CookingSession` + all `CookingSessionUnit`/`CookingSessionChecklistItem` rows (Arch §I) is sufficient and already schema-supported: `CookingSession.dishId`/`dishVersionId` pin exact source identity (composite FK to `DishVersion`); `CookingSessionUnit.label`/`sourceDishTitle`/`sourceDishVersionLabel` and `CookingSessionChecklistItem.displayText`/`displayQuantity`/`displayUnit` are the Correction-3 display snapshot; `position` carries user ordering; `scaleFactor` on both `CookingSession` and `CookingSessionUnit` carries whole-session and per-unit scale; nullable `sourceSectionLineageId`/`sourcePartLinkLineageId`/`sourceLineageId` are the allowed-to-dangle lineage pointers for "jump back to source" navigation only. Nested Parts selected independently (§23.4) need no special-case schema — they're simply another `CookingSessionUnit` row under the same session. No schema or migration changes are needed for Slice 7, matching Build Plan's own "Migrations: None."

- **Source integrity.** Verified end-to-end: `DishVersion` is never independently deletable (only cascades from a full `Dish` delete, which also cascades away that Dish's own Cooking Sessions per Arch §J) — so a live session's `dishVersion` relation is guaranteed to resolve for the session's entire lifetime, making it safe to read `yieldQuantity`/`yieldUnit` live off `DishVersion` at render time (e.g., for "Makes" display) without denormalizing it again. Section/Ingredient/Instruction/PartLink edits or a *referenced Part's* deletion cannot corrupt a session's meaning because the checklist/unit rows never hold a live FK into that content — only the Correction-3 snapshot plus dangling-safe lineage strings. **One genuine documentation contradiction found and corrected during this gate:** Arch §H's cross-cutting snapshot-strategy table still described Cooking Session content as "normalized FK references... into the immutable DishVersion graph," which is the pre-Correction-3 design and directly contradicts §D.7 and the applied Prisma schema. Fixed in place (see Documentation updates below).

- **Concurrency/index.** The partial unique index (`CREATE UNIQUE INDEX "one_active_session_per_dish" ON "CookingSession" ("dishId") WHERE "state" = 'IN_PROGRESS'`) is **already applied**, in `prisma/migrations/20260726050345_cooking_and_feedback_loop/migration.sql`. `dishId` alone is the correct scope: a `Dish` row belongs to exactly one owner, so the index is implicitly owner-scoped without needing `ownerId` in the predicate, and because a Recipe and a nested Part it uses are two distinct `Dish` rows with distinct `dishId`s, a Recipe session and a standalone session for a Part it contains never collide (§26.4). Simultaneous "Start cooking" calls are guaranteed one success/one Postgres `unique_violation` by the database itself, not an app-level pre-check. The repo already has a proven idiom for turning that into a friendly domain error — `grocery/service.ts`'s `isUniqueConstraintViolation` (P2002) → `ConflictError` — directly reusable for `startCookingSession`.

- **Lifecycle.** `IN_PROGRESS → COMPLETED | ENDED_EARLY` matches PRODUCT_SPEC §25/§30 exactly; no Paused state exists in the schema's `SessionState` enum. `startedAt`/`endedAt`/`rawElapsedSeconds`/`adjustedDurationSeconds` are all present and match §38's duration-ownership split (raw computed at end time, adjusted reserved for Review-time correction, Slice 9).

- **Active-plan editing.** Schema already supports add (new `CookingSessionUnit` rows), remove (`removedAt`), evidence-preserving remove-after-progress (`removedAfterProgress`), restore (clear `removedAt`), and reorder (`position`) without any new columns. The final-unit guard (§27.4) is correctly a service-layer read-then-decide check, not a database constraint — a `COUNT(active units) >= 1` invariant isn't expressible as a Postgres row-level CHECK.

- **Slice 7 vs Slice 8 boundary.** Clean: Slice 7 persists lifecycle + initial scale + plan editing; Slice 8 owns interactive mid-session scale changes, the scale-conflict flag, Timer actions, and the focused Cooking Mode UI. `Timer` is already modeled (`unitId` FK, `targetEndAt`/`remainingSeconds`/`state`) so Slice 7 needs to do nothing beyond leaving those relationships intact.

## Required amendments before implementation

None. The one substantive issue found (the §H snapshot-table contradiction) was a documentation-accuracy gap, not a gap in the actual schema or transaction design, and has already been corrected as part of this gate (see Documentation updates).

## Genuine owner decisions

None. Every question in the review areas was resolvable from `PRODUCT_SPEC.md`, `ARCHITECTURE_PROPOSAL.md`, the applied migration history, and existing repository patterns (`grocery/service.ts`'s conflict-mapping idiom, `dishes/queries.ts`'s `getOwnedXOrThrow` pattern).

## Authorized Slice 7 scope

As defined in `BUILD_PLAN.md`'s Slice 7 section — routes `/recipes/[dishId]/cook`, `/parts/[dishId]/cook`, `/cook`, `/cook/[sessionId]` (minimal shell); `cooking/actions.ts` with `startCookingSession`, `editActiveSessionPlan`, `endCookingSession`; the one-active-session conflict mapping; the final-unit guard; and the tests Slice 7 already lists (concurrent-start race, removed-after-progress evidence, source-deleted-still-renders, and the setup→start→edit→end-early e2e journey). No schema or migration work is required.

## Explicitly deferred to Slice 8 or later

- Interactive mid-session scale changes and the scale-conflict flag (§24.4/§24.5) — Slice 8.
- **Forward note for Slice 8 planning:** §24.4 requires DishFrame to "preserve enough context to distinguish the original scale, later scale adjustments, and the final scale used," but `CookingSession.scaleFactor`/`CookingSessionUnit.scaleFactor` are single mutable fields with no original-value or change-history column. This is not a Slice 7 gap (Slice 7 only ever writes these fields once, at creation), but Slice 8 will likely need either an `originalScaleFactor` column or a small change-log, and should treat that as a design question at Slice 8's own kickoff rather than discovering it mid-implementation.
- Timer create/start/pause/resume/reset/adjust actions and UI — Slice 8.
- Checkoff toggling UI, `completeUnit`, unit-focus panel, and the dedicated Cooking Mode layout — Slice 8.
- Session Review/ratings/notes UI — Slice 9 (schema already exists, untouched by Slice 7).

## Verification expectations

**High-value automated (per the Test-value policy):**
- Integration: genuine concurrent `startCookingSession` race — two near-simultaneous calls for the same `dishId`, asserting one succeeds and one surfaces `ConflictError`, not merely two sequential calls.
- Integration: canceled Setup creates zero `CookingSession`/`CookingSessionUnit` rows (a negative assertion justified here because it's a real data-integrity invariant, not a presentation snapshot).
- Integration: exact source-Version and nested-Part-selection preservation, including after the source Section/Part/Dish is later edited or deleted (Build Plan's own listed test).
- Integration: add/remove/restore/reorder plan editing, with explicit assertion that `removedAfterProgress` evidence survives and remains queryable after being hidden from the active view.
- Unit or integration: final-unit guard offers Delete/Keep-editing rather than silently emptying the plan.
- Integration: Finish vs. End early set the correct `state`/`endedAt`, and both preserve checklist/timer state.
- Integration: authorization — every new action rejects a non-owner `sessionId`/`dishId`.
- One e2e journey: setup → start → edit-while-active → end-early (already scoped in Build Plan; no additional E2E journeys needed for Slice 7).

**Manual:** a brief sanity check specifically on the two-concurrent-tab "Start cooking" conflict prompt (Resume/End/Cancel) is worth a few minutes given it's the one behavior automated tests can assert correctness of but not *feel* — the standard owner-run `verify:all` plus a glance at that one flow is enough; no broader design review is warranted for this persistence-focused slice.

## Documentation updates

- `ARCHITECTURE_PROPOSAL.md` §H: corrected the "Cooking Session content selection" table row from the stale pre-Correction-3 "normalized FK reference" description to the actual denormalized-snapshot design already documented in §D.7 and already reflected in the applied Prisma schema.
- `ARCHITECTURE_PROPOSAL.md` §I: added a missing "Edit an active Cooking Session's plan" row to the mutations/transactions table (previously only "Begin" and "End" were listed), stating the transaction boundary and confirming the final-unit guard is a service-layer check, not a DB constraint.

Both are documentation-accuracy fixes reconciling `ARCHITECTURE_PROPOSAL.md` with `PRODUCT_SPEC.md`, the Prisma schema, and applied migrations — no product behavior changed.

## No implementation

No application source code, Prisma schema, migrations, dependencies, or tests were modified. Slice 7 implementation has not begun.
