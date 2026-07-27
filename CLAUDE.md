@AGENTS.md

# Assistant workflow preference

Do not dispatch background/Agent subagents for DishFrame work — not for
research/lookups, not for implementation, foreground or background, single
or parallel. Do all reads, greps, and implementation directly in-session.
This applies to quick one-off lookups too, not just multi-step delegated
work. This also keeps total token usage lower, not higher: a spawned agent
starts cold and re-derives context (re-reading files, re-establishing task
context) that this session already has loaded, duplicating spend rather
than saving it.

# Verification and Git policy (DishFrame-specific)

Full policy lives in `AGENTS.md`'s "Owner intervention and manual-review
policy" section (@-included above — write tests, never run them or any
verification/Git command on your own initiative during a normal pass; the
owner runs everything; the only self-initiated exception is debugging an
owner-reported failure; manual UI review is separate from, and rarer
than, automated verification) and, as the cross-project default, the
global `~/.claude/CLAUDE.md` "General development preferences" section.
This section is only the DishFrame-scoped script reference.

## Verification scripts (current meanings — renamed/consolidated 2026-07-26)

- `pnpm run verify:frontend` — frontend/code-quality only: format check,
  lint, typecheck, unit/component tests, production build (alias for the
  pre-existing `check` script).
- `pnpm run verify:backend` — database, integration, and E2E checks:
  `db:verify:local`, `db:scan-migrations`, `test:integration`, then the
  full Chromium Playwright suite pinned to one worker (avoids the known
  shared-local-Postgres/dev-server parallelism flake).
- `pnpm run verify:fullstack` — `verify:frontend` then `verify:backend`.
- `pnpm run verify:all` — `format` (auto-fix) then `verify:fullstack`.

Requires Docker Desktop running with the local Postgres container up
(`pnpm run db:docker:up`) for anything touching `verify:backend`.

## When to run these

- The owner runs `pnpm run verify:all` themselves after each completed
  implementation pass. Never run any of the scripts above, or
  lint/typecheck/tests/Playwright/Prisma validate/migration scans/build
  individually, on your own initiative — not even a "narrowly targeted
  diagnostic" or a check you judge "genuinely necessary." Write tests;
  don't execute them. Report what was written and what remains for the
  owner to verify instead.
- **Debugging exception (the only one):** when the owner has already run
  verification, reports a specific failure, and explicitly asks for it to
  be debugged, run the relevant failing subcommand(s) while diagnosing,
  then run the full reported command once at the end to confirm the
  repair. This never extends to unrelated or broad suites.
- Write/update tests only for behavior stable enough not to be
  substantially redesigned soon (domain rules, service-boundary
  contracts, fixed regressions, persistence). Defer tests for UI/flows
  still under active visual design.

## Git

Never run `git status`, `git diff`, `git log`, or any other git
inspection/mutation command (commit, push, pull, branch, PR) unless the
owner explicitly asks in that turn. They manage Git state themselves.
