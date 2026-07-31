# Slice 7 — Cooking Setup and Cooking Session lifecycle

## Status

Complete. Implements the full scope authorized by Review Gate 4 and
`BUILD_PLAN.md`'s Slice 7 section. No schema or migration changes — the
gate confirmed none were needed, and none were made.

## Routes and surfaces

- `/recipes/[dishId]/cook`, `/parts/[dishId]/cook` — Cooking Setup, optional
  `?versionId=` for historical Versions (§22.3).
- `/cook` — active/recent Cooking Sessions index, added to the primary nav
  (`nav-items.ts`) per §26.6's "reachable without searching the source
  Recipe/Part first."
- `/cook/[sessionId]` — the minimal session shell (source identity, active
  plan, lifecycle actions), not the Slice 8 Cooking Mode interface.
- "Cook" entry points added: `dish-detail-actions.tsx` (a prominent button,
  not an overflow item — cooking is the primary reason to open an item),
  and "Prepare to cook [this version]" on both historical-Version pages.

## Domain module (`src/lib/cooking/`)

- `queries.ts` — ownership-scoped fetches plus `buildCookableUnits`, which
  re-derives the full cookable-unit set (local Sections + top-level/
  Section-nested Parts, each with its own flattened checklist and
  estimated duration) fresh from the persisted Version every time it's
  called. Never cached, never trusted from the client.
- `service.ts` — `startCookingSession`, `addSessionUnits`,
  `removeSessionUnit`, `restoreSessionUnit`, `reorderSessionUnits`,
  `endCookingSession`, `deleteCookingSession`.
- `actions.ts` — thin Server Action wrappers (session check → Zod parse →
  service call → `revalidatePath`), matching the `dishes`/`grocery`
  pattern.

## Transient Setup → real session

Setup (`cooking-setup.tsx`) holds every selection (include/exclude, order,
whole-session and per-unit scale) as local React state — no server call
until "Start cooking." The client sends only `unitKey` identifiers, order,
and scale numbers; `startCookingSession` re-resolves each key against a
fresh `buildCookableUnits` call and derives every label/title/Version-label/
checklist value itself. A client can't inject label, quantity, or source
text (PRODUCT_SPEC.md §22.4, Gate 4's authorization requirement).

One transaction creates `CookingSession` + every `CookingSessionUnit` +
`CookingSessionChecklistItem` row. Checklist display fields reuse the
existing Slice 5 scaling utilities (`scaleIngredientQuantity`,
`formatCalculatedQuantity`) — unscaled renders in plain authored style,
any real scale renders in kitchen-fraction/decimal style, matching
`scaled-display.ts`'s established rule exactly.

## Concurrency

The partial unique index (`one_active_session_per_dish`, already applied)
is the sole guard. A duplicate "Start cooking" is caught
(`isUniqueConstraintViolation`) and re-thrown as `ActiveSessionConflictError`
carrying the existing session's id, surfaced as Resume/End/Cancel. Verified
under a genuine `Promise.allSettled` race in the integration suite, not a
sequential pre-check.

## Active-plan editing

Add re-derives eligible units from the session's pinned
`dishId`/`dishVersionId` and skips anything already present (active or
removed). Remove sets `removedAt`/`removedAfterProgress` (computed from
`completedAt`/checked checklist items/timer rows) rather than deleting.
Restore clears `removedAt`. Reorder validates the submitted id set exactly
matches the current active set before writing new positions. Each is one
transaction that also bumps `CookingSession.updatedAt`.

The final-unit guard (`FinalUnitGuardError`) is a pre-transaction
read-then-decide check — removal is never attempted if it would empty the
plan. The action layer maps it to a distinct `"final-unit-guard"` state so
the UI can offer Delete session / Keep editing; `deleteCookingSession` is
reachable only from that one dialog, not a general delete action.

## Source integrity

Every `CookingSessionUnit`/`CookingSessionChecklistItem` renders from its
own stored snapshot. Integration coverage proves this survives a later
edit to both the Recipe's own Section and a linked Part's content. Per
the architecture, permanently deleting the session's own top-level Dish
still cascades its sessions — untouched and not contradicted here.

## Scope decisions worth flagging

- **Batch scale is a plain multiplier**, not a "target Makes amount →
  computed factor" control. Simpler and unambiguous for Parts with no
  `yieldQuantity` (e.g. a sauce); §24.2's acceptance criteria are met
  (undefined/accepted/changed), but this is a UX simplification the owner
  may want revisited before/alongside Slice 8's own scaling UI.
- **A local Section with zero local ingredients/instructions is not
  offered as its own cookable unit** (only its nested Parts are) — since
  §9.5 auto-removes truly empty Sections at save time anyway, this should
  be rare in practice.
- **The Setup screen doesn't preview scaled ingredient quantities** — only
  unit labels, duration, and ingredient/step counts. §21.2's review list
  doesn't require ingredient-level preview during Setup itself.
- **"Active work called out before ending" (§30.2)** is a plain
  confirmation dialog only — Slice 7 has no real progress signal to call
  out yet (checkoff UI is Slice 8), so there's nothing meaningful to
  surface beyond the existing session content shown above the buttons.

## Tests

`src/lib/cooking/cooking.integration.test.ts` (9 tests, all passing):
cookable-unit derivation + zero-residue Setup, snapshot creation, snapshot
survival after source edits, the genuine concurrent start race, add/
remove/restore/reorder, removed-after-progress evidence, the final-unit
guard, Finish-vs-End-early (including the ended-session reopen rejection),
and non-owner rejection across every mutation.

`tests/e2e/cooking-golden-path.spec.ts` — Setup → Start cooking → remove/
restore a unit → End early, on a two-Section Recipe (avoids the final-unit
guard so the plain edit path is exercised). **Written, not run**, per
policy.

## Verification

`pnpm run verify:feature` passed clean (format, lint, typecheck, build,
frontend unit/component tests, `db:verify:local`, `db:scan-migrations`,
and the full integration suite — 171 tests including this slice's 9).

## Owner review targets

- **Focused manual review recommended**, not full: the two-tab "Start
  cooking" conflict prompt (Resume/End/Cancel) — the one behavior tests
  prove correctness of but not feel, per Gate 4's own note.
- Cooking Setup's include/exclude/reorder/scale UI and the session shell's
  active-plan editing, on mobile width in particular (reorder is up/down
  buttons, not drag-and-drop — a deliberate simplification, not a bug).
- The nested-Part-as-independent-unit visual treatment (§23.4) — current
  Setup shows it as a flat, equal-footing list item; the spec explicitly
  leaves "final visual treatment" to frontend design work.

Do not begin Slice 8.

## Correction (Slice 8 closeout)

Two issues flagged above were closed out as part of Slice 8 rather than a
separate Slice 7 pass — see `docs/SLICE_8.md`'s "Slice 7 closeout" section
for the detail:

- **Setup's plain-multiplier batch scale** is replaced by natural
  target-output scaling (`ScaleControl`) wherever a usable `Makes` basis
  exists, multiplier retained only as the documented fallback.
- **Concurrent final-unit removal** could previously empty a session under
  a genuine race (read-then-write guard); `removeSessionUnit` now holds a
  row lock for the guard check inside its transaction. Verified with an
  actual `Promise.allSettled` race, not a sequential test.
