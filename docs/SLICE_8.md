# Slice 8 — Cooking-mode focus, progress, scaling, and persistent timers

## Status

Complete. Implements the scope authorized by Build Plan Slice 8 (Gate 4
already covers it — no new Review Gate), plus the two Slice 7 closeout
items requested alongside it.

## Slice 7 closeout

- **Setup scaling** (`cooking-setup.tsx`, both `.../cook/page.tsx` routes):
  the plain multiplier field is replaced by `ScaleControl` — a natural
  "Makes N {unit} → Cook for [ ]" target-output control whenever a usable
  `DishVersion.yieldQuantity`/`yieldUnit` basis exists (whole-session, off
  the container Version; per-unit, off a linked Part's own yield), with a
  plain multiplier as the documented fallback otherwise (a local Section has
  no yield basis of its own). The multiplier is always computed internally;
  the user never divides. See `docs/SLICE_8.md`'s "Owner review targets"
  for the one interaction decision worth a look.
- **Concurrent final-unit removal**: `removeSessionUnit`'s original
  read-then-write let two near-simultaneous removals of the last two units
  both read `activeCount > 1` and both commit, emptying the session. Fixed
  by moving the guard check inside a transaction that takes a
  `SELECT ... FOR UPDATE` row lock on the parent `CookingSession`, so a
  concurrent removal re-reads the active count only after acquiring the
  lock. Verified with a genuine `Promise.allSettled` race against the two
  units of a two-unit session — exactly one succeeds, the other gets
  `FinalUnitGuardError`, one unit remains active.

## Schema correction (Gate 4's forward note)

Three additive-only changes, one migration
(`20260731064750_slice8_scale_history_checklist_base_timer_duration`),
applied and verified against local Postgres:

- `CookingSession.originalScaleFactor` / `CookingSessionUnit.originalScaleFactor`
  (`Decimal(8,4)`, nullable) — captured once at creation, never written
  again. `scaleFactor` keeps mutating as the current value and simply is
  the final value once a session ends (mutations are rejected on an ended
  session). This is the minimal fix for §24.4's "distinguish original vs.
  later adjustments vs. final scale" — it doesn't log every intermediate
  adjustment, only original vs. current/final, which is what the mid-session
  scaling UI and the progress-conflict logic actually need.
- `CookingSessionChecklistItem.baseQuantity` / `.baseQuantityEnd` /
  `.isApproximate` (structured, unscaled at multiplier 1) and
  `.checkedQuantity` (the scaled quantity in effect at the moment an item
  was last checked). Mid-session scaling recalculates `displayQuantity`
  from `base*` directly — it never re-parses the formatted `displayQuantity`
  string. `checkedQuantity` is the reference value the read-time conflict
  check (`computeChecklistItemConflict`, `queries.ts`) compares a fresh
  scale against; free-text/quantity-less rows keep `baseQuantity` null and
  are never touched by a rescale, matching §24.3.
- `Timer.durationSeconds` (required `Int`) — the nominal duration Reset
  returns to and Add/Subtract time adjusts. Without it, Reset had no
  correct value to restore once a timer had ever counted down; the
  originally-modeled `targetEndAt`/`remainingSeconds` pair alone can't
  express "what the timer was originally/currently set to."

The generated migration also proposed spurious `DROP CONSTRAINT`/
`DROP INDEX` statements for raw-SQL objects from an earlier migration (the
known false-positive pattern from `docs/SLICE_2.md` §5.2) — stripped before
applying; `db:scan-migrations` and `db:verify:local` both confirm all
protected objects survived.

## Cooking Mode

**Deviation from `ARCHITECTURE_PROPOSAL.md` §C.8, corrected in place:**
§C.8 originally specified the dedicated Cooking Mode layout as a
`layout.tsx` nested inside `(app)/cook/[sessionId]/`. That's structurally
unreachable — Next.js layouts always compose with their parent, so
anything nested under `(app)` still renders `(app)/layout.tsx`'s
`SidebarNav`/`MobileTopbar`/account header no matter what a deeper layout
does, which directly contradicts §C.8's own "no sidebar" requirement.
Implemented instead as a new top-level route group, `(cook)/cook/[sessionId]/`,
sibling to `(app)`, with its own independent auth-redirect layout (the
route-group mechanism §C.9 already plans for the future `(share)` group,
used here for the first time). `(app)/cook/page.tsx` (the sessions index)
is unaffected. §C.8 has been corrected in place to describe this — see the
doc for the full note. This was implemented conservatively and flagged
here rather than raised beforehand, since the only two ways to satisfy
§C.8's explicit "no sidebar" requirement are (a) this route-group move or
(b) restructuring `(app)/layout.tsx` itself to be conditional, and (a) is
strictly smaller-blast-radius.

The old Slice 7 management shell (`cooking-session-shell.tsx`) is
deleted; its add/remove/restore/reorder logic moved into
`cooking-plan-manager.tsx`, now a bottom Sheet behind a "Manage plan"
trigger rather than the primary surface (§28.5's distinct-meanings
requirement — navigation/completion/removal/collapse read as visually
separate affordances).

`cooking-mode-shell.tsx` is the primary surface: a sticky compact top bar
(title, elapsed time or ended state, "End", "Manage plan", "Scale
session"), a persistent cross-unit timer strip (visible regardless of
which unit is focused — tapping a chip jumps focus to its unit), a
horizontal unit-switcher (one tap to refocus, thin state bar: green
complete / orange has-a-running-timer / neutral), and the focused unit's
own panel (ingredients, instructions, timers, "Mark complete"/"Reopen").
Checkoffs use a small local-override + rollback-on-error pattern for
instant feedback rather than waiting a full `router.refresh()` round trip.
Ended sessions render read-only (checkboxes/timer controls disabled, "View
source" replaces "End").

Design direction follows `BRANDING.md` §5.5/§6.4/§9/§10 as already
authored for Cooking Mode (blue navigation, green completed, orange
running-timers/active-cooking, purple absent, Manrope/Inter, tabular
numerals for timers and quantities) — no new palette introduced. The one
signature choice: unit-switcher cards use a thin colored state bar rather
than any stovetop/burner imagery, per §11's "avoid rustic/skeuomorphic."

## Mid-session scaling and progress conflicts

`updateSessionScale`/`updateUnitScale` (service.ts) recompute every active
checklist item's `displayQuantity` from `baseQuantity`/`baseQuantityEnd`/
`isApproximate` at the new effective multiplier — never the source Version.
`computeChecklistItemConflict` (queries.ts) is a pure, read-time-only
comparison of a checked item's `checkedQuantity` snapshot against what the
current scale now requires: scaling up flags "needs more" with the exact
additional amount; scaling down flags "exceeds" with the excess, and the
UI copy never implies the excess can be removed. Nothing is silently
reopened — flags are informational badges on the still-checked row.

## Timers

Multiple named timers per unit, independently RUNNING/PAUSED. `create`
starts immediately (the natural single action for "set 10 minutes");
pause/resume, reset (returns to the current nominal `durationSeconds`,
paused), add/subtract time (updates `durationSeconds` too, so a later
reset reflects the adjustment), and dismiss cover the rest. Countdown is
always derived client-side from `targetEndAt`/`remainingSeconds` via
`timer-math.ts` — no per-second writes. "Expired" is a pure derived
comparison (`RUNNING` + `targetEndAt` in the past); DishFrame never writes
a separate `EXPIRED` row (the enum value exists in the schema but is
unused by design — a documented scope decision, not an oversight). The
expired badge is `role="alert"`/`aria-live="assertive"`, paired with a
short WebAudio-synthesized ding (`timer-sound.ts`, no shipped asset) gated
on the existing `UserPreference.timerSoundEnabled`. `endCookingSession`
now also freezes every RUNNING timer into PAUSED with remaining time
snapshotted at `endedAt`, matching §30.3/§30.4's "stops active timer
countdowns; preserves timer state."

## Tests

- `cooking.integration.test.ts` — 9 new tests: the genuine two-unit
  concurrent-removal race, checkoff persistence, complete/reopen, ended-
  session rejection across every Slice 8 mutation, whole-session + per-unit
  scaling (asserting `originalScaleFactor` untouched and recalculation from
  `baseQuantity`), upward/downward conflict flagging, full Timer lifecycle
  + two simultaneous timers, timer-freeze-on-end, and non-owner rejection.
- `timer-math.test.ts` — pure countdown/expiration/formatting math.
- `scale-control.test.tsx` — target-output multiplier computation and the
  multiplier fallback, including an arbitrary output label (cookies).
- `cooking-mode-shell.test.tsx` — unit-focus switching in one tap,
  checkoff persistence call, disabled checkoffs on an ended session.
- `tests/e2e/cooking-golden-path.spec.ts` — updated for the new UI (Manage
  plan sheet, single "End" action).
- `tests/e2e/cooking-mode-timers.spec.ts` — new: two-unit session, switch
  units, two simultaneous timers, refresh, confirm both timers and both
  checkoffs persist. **Written, not run**, per policy.

## Verification

`pnpm run verify:feature` passed clean: format, lint, typecheck, build (25
routes generated, including the new `(cook)` group), frontend suite (265
tests), and backend (`db:verify:local`, `db:scan-migrations`,
`test:integration` — 180 tests, all passing).

## Owner review targets

- Cooking Mode on phone width in particular — the unit-switcher's
  horizontal scroll, the timer strip's chip layout, and touch-target sizing
  for checkboxes/timer controls.
- The progress-conflict badges (orange "needs more" / neutral "extra") —
  the spec left the exact interaction to frontend design work; worth a
  glance to confirm they read as informational, not as errors.

## Unresolved issues

None outstanding. Do not begin Slice 9.

## Correction (scaling cleanup pass)

The "blank Save resets to authored" simplification flagged above as an
owner-review target has been corrected, not kept: `ScaleControl` gained a
`currentMultiplier` prop that puts the mid-session dialogs (whole-session
and per-unit) into a "safe" mode — the field prefills with the value that
produces the current scale, blank input never changes the pending value,
and an explicit "Reset to authored amount" button shows its resulting value
before Save is clicked. Setup is unaffected (still blank-means-authored,
since it has no persisted "current" to preserve).

Separately, the per-unit target-output math was wrong whenever composed
with a non-1 whole-session scale: it divided the entered target by the
Part's *raw authored* yield, producing an absolute multiplier rather than
the intended *relative* one, so composing it with the session scale in
`updateUnitScale` silently double-counted the session's own scale. Fixed by
composing the authored yield with the current whole-session scale first
(`computeOutputBasis`, `scale-control.tsx`) before handing it to
`ScaleControl` as the basis — applied in both Cooking Setup and mid-session
scaling. The per-unit scale dialog now also shows Session/This unit/
Effective chips so the composition is visible, not just correct.
PRODUCT_SPEC.md §24.4 was updated to state the settled two-value (original +
current) scale-history rule explicitly, and to spell out the multiplicative
composition rule, rather than leaving both implicit in code.
