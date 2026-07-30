@AGENTS.md

# Assistant workflow preference

During an implementation pass (slices and similar multi-file work), keep
turn-by-turn narration in the terminal to a minimum — don't announce each
file you're about to read/edit or list out the plan before executing it.
Work quietly through the tool calls; put the substantive record (what
changed, decisions made, what's left) in the slice report file, not in
chat output. When a pass completes, a single short completion sentence is
enough — the slice report is where the detail belongs. This is about
conversational narration specifically, not about skipping real user-facing
questions (e.g. AskUserQuestion) when one is actually needed.

Comments in new/edited code: one line max, only when the why is genuinely
non-obvious (a spec section reference is fine). Do not write multi-
paragraph doc comments even though existing DishFrame code often does —
that pre-existing density is not a pattern to match; it measurably drives
up token usage on every edit.

Default to doing DishFrame reads, greps, and implementation directly
in-session rather than dispatching Agent subagents — a fresh agent starts
cold and re-derives context (re-reading files, re-establishing task
framing) that this session already has loaded, which usually costs more
than it saves. This holds especially for quick one-off lookups.

Amended 2026-07-27 (see global `~/.claude/CLAUDE.md` "Subagent usage
judgment" for the full rule): use judgment to dispatch a subagent instead
when the session's own context is already large enough that a mid-task
`/clear` or `/compact` would be costly to lose, and the work is
self-contained enough to hand off cleanly (large isolated exploration or
a parallelizable chunk of a big task) — in that situation the subagent's
cold-start cost is worth paying to avoid further bloating irreplaceable
context. Outside that situation the default above still holds.

Once dispatching a subagent, pick its model deliberately — see
`AGENTS.md`'s "Subagent delegation and model selection" section for the
DishFrame-specific examples (e.g. running `verify:feature` in a Haiku
subagent to keep noisy output out of this session) and the global
`~/.claude/CLAUDE.md` "Subagent model selection" section for the
general two-axis rubric (intelligence fit vs. context isolation) this
project follows.

The global "Usage-efficient execution policy" (added 2026-07-30) also
applies here: work directly from the owner's implementation prompt
without automatically generating a second plan, and don't invoke
Superpowers planning/execution skills (`writing-plans`,
`executing-plans`, etc.) by default — see `AGENTS.md`'s "Usage-efficient
execution" section for the DishFrame-specific application (targeted
tests during implementation, single `verify:feature` completion check,
tightened subagent defaults).

# Verification and Git policy (DishFrame-specific)

Full policy lives in `AGENTS.md`'s "Owner intervention and manual-review
policy" section (@-included above — write tests, and don't run broad
verification or Git commands on your own initiative during a normal
pass; the owner runs `verify:all` and all Git operations; self-initiated
exceptions are (1) running `verify:feature` after every major pass and
(2) debugging an owner-reported failure narrowly; manual UI review is
separate from, and rarer than, automated verification) and, as the
cross-project default, the global `~/.claude/CLAUDE.md` "General
development preferences" section. This section is only the
DishFrame-scoped script reference.

## Verification scripts (current meanings — updated 2026-07-27 for `verify:feature`)

- `pnpm run verify:feature` — the low-cost, pre-Playwright bundle: `check`
  (format check, lint, typecheck, build) + `verify:frontend` (vitest
  unit/component tests) + `verify:backend` (`db:verify:local`,
  `db:scan-migrations`, `test:integration`). Requires local Postgres.
  Excludes Playwright entirely. **Self-run by the assistant after every
  major pass** — see "When to run these" below.
- `pnpm run verify:frontend` — `test:frontend` (vitest unit/component
  tests) only.
- `pnpm run verify:backend` — `db:docker:up` (starts/waits for the local
  Postgres container, added 2026-07-27), then `db:verify:local`,
  `db:scan-migrations`, `test:integration`. No longer includes Playwright
  (moved to `verify:e2e` below).
- `pnpm run verify:e2e` — full Chromium Playwright suite, pinned to one
  worker (avoids the known shared-local-Postgres/dev-server parallelism
  flake).
- `pnpm run verify:fullstack` — `verify:frontend` then `verify:backend`
  then `verify:e2e`.
- `pnpm run verify:all` — `check` then `verify:fullstack`.

`verify:backend` now starts the local Postgres container itself as its
first step (via `db:docker:up`), so this cascades automatically to
`verify:feature`, `verify:fullstack`, and `verify:all` too — no separate
`db:docker:up` step needed before running any of them. Docker Desktop
itself (the daemon/app) still has to be running; if it's fully quit,
`db:docker:up` fails immediately with a connection error rather than
launching Docker Desktop for you.

**If that happens during a self-run `verify:feature` (added 2026-07-27):
handle it autonomously, don't stop to ask.** Start Docker Desktop directly
(`open -a Docker` on macOS), then poll for readiness at short intervals
(e.g. retry `docker info` or just retry `pnpm run db:docker:up` every
few seconds) rather than one blind long sleep, up to a reasonable
timeout (~90s) — then continue straight into `verify:feature`. Report in
the completion report that Docker had to be started, but do not pause
for owner input to do it; this exists specifically to avoid the relay
round-trip the self-run check was introduced to eliminate.

## When to run these

- The owner runs `pnpm run verify:all` themselves after each completed
  implementation pass. Never run `verify:backend`/`verify:fullstack`/
  `verify:all`, or lint/typecheck/tests/Playwright/Prisma
  validate/migration scans/build individually, on your own initiative —
  not even a "narrowly targeted diagnostic" or a check you judge
  "genuinely necessary." (`verify:feature` is the one exception — see
  next bullet.)
- **Self-run exception — `verify:feature` after every major pass (added
  2026-07-27):** after completing a major prompt — a slice, or a large
  polish/revision pass, not a small isolated edit — run
  `pnpm run verify:feature` on your own initiative, without being asked.
  If it fails, fix the failure narrowly, rerun `verify:feature` to
  confirm the fix, and report both the original failure and the fix in
  the completion report. This exists to catch mechanical/shallow bugs
  (type errors, lint, simple test failures) before the owner finds them
  manually and has to relay them back one at a time — expensive because
  each relay round-trip resends the whole pass's accumulated context.
  This does not replace the owner's own `verify:all` run, which still
  covers Playwright/E2E and stays entirely owner-run.
- **Debugging exception:** when the owner has already run verification
  (or reviewed the `verify:feature` self-run report), reports a specific
  _further_ failure, and explicitly asks for it to be debugged, run the
  relevant failing subcommand(s) while diagnosing, then run the full
  reported command once at the end to confirm the repair. This never
  extends to unrelated or broad suites, and never to Playwright — the
  owner always runs `verify:e2e`/Playwright himself, even a single
  narrowly-scoped spec.
- Write/update tests only for behavior stable enough not to be
  substantially redesigned soon (domain rules, service-boundary
  contracts, fixed regressions, persistence). Defer tests for UI/flows
  still under active visual design.

## Git

Never run `git status`, `git diff`, `git log`, or any other git
inspection/mutation command (commit, push, pull, branch, PR) unless the
owner explicitly asks in that turn. They manage Git state themselves.

# Implementation report policy (DishFrame-specific)

The global `~/.claude/CLAUDE.md` "Token-efficient implementation
handoffs" policy applies here. DishFrame-specific details (target
length, what `docs/SLICE_*.md` should and shouldn't contain) live in
`AGENTS.md`'s "Implementation report policy" section (@-included above)
— not restated here.
