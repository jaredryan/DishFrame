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
DishFrame-specific examples and the global `~/.claude/CLAUDE.md`
"Subagent model selection" section for the general two-axis rubric
(intelligence fit vs. context isolation) this project follows.

The global "Usage-efficient execution policy" (added 2026-07-30) also
applies here: work directly from the owner's implementation prompt
without automatically generating a second plan, and don't invoke
Superpowers planning/execution skills (`writing-plans`,
`executing-plans`, etc.) by default — see `AGENTS.md`'s "Usage-efficient
execution" section for the DishFrame-specific application (targeted
commands during implementation only, no self-run completion check,
tightened subagent defaults).

# Verification and Git policy (DishFrame-specific)

Full policy lives in `AGENTS.md`'s "Owner intervention and manual-review
policy" section (@-included above) and, as the cross-project default,
the global `~/.claude/CLAUDE.md` "Testing / verification policy" and
"Git policy" sections. This section is only the DishFrame-scoped script
reference.

## Verification scripts

Script compositions (`verify:feature`, `verify:frontend`, `verify:backend`,
`verify:e2e`, `verify:fullstack`, `verify:all`) are defined in
`package.json`'s `scripts` field — read there for exactly which
sub-scripts each one runs. What's not obvious from that file:

- `verify:e2e`'s Playwright run is pinned to one worker to avoid a known
  shared-local-Postgres/dev-server parallelism flake.
- `verify:backend` starts the local Postgres container itself (via
  `db:docker:up`), which cascades to `verify:feature`/`verify:fullstack`/
  `verify:all` too — no separate `db:docker:up` step needed. Docker
  Desktop itself still has to be running; if it's fully quit,
  `db:docker:up` fails immediately with a connection error rather than
  launching Docker Desktop for you.
- All of these are owner-run only, in a fresh session — see "When to run
  these" below.

## When to run these

Full behavioral policy — what the assistant may run during
implementation, what stays owner-run, and the fresh-session repair
exception — lives in the global `~/.claude/CLAUDE.md` "Testing /
verification policy" and `AGENTS.md`'s "Testing responsibility" section.
This file only names the scripts above.

## Git

Never run `git status`, `git diff`, `git log`, or any other git
inspection/mutation command (commit, push, pull, branch, PR) unless the
owner explicitly asks in that turn. They manage Git state themselves.

# Post-implementation behavior (added 2026-08-23)

Once the requested edits are complete, stop implementation work and report
completion. Do not perform an unsolicited final consistency/review pass
after the requested changes are done.

Specifically, once the edits themselves are finished, do not:

- re-read modified files just to look for lingering diagnostics;
- inspect the final diff for general correctness;
- perform a final code-quality sweep;
- run or invoke diagnostics;
- run verification commands (also enforced mechanically — see the
  `deny-self-run-bash.sh` PreToolUse hook in the global
  `~/.claude/CLAUDE.md`-referenced hook setup, which denies typecheck,
  lint, format-check, build, diagnostics, test, Playwright, Lighthouse,
  and database/migration-verification commands, plus `check`/`verify:*`
  wrappers, at the Bash-tool level);
- perform broad post-edit searches/checks;
- do any other self-appointed final review step.

File reads/searches are still allowed when genuinely needed to implement
the requested changes — this restricts extra review _after_ the
implementation itself is complete, not the reads needed to do the work.

The intended workflow:

1. Read what is needed to implement.
2. Make the requested edits.
3. Update/add tests if the task requires maintaining coverage, but do not
   run them unless explicitly authorized.
4. Stop.
5. Give one concise completion summary.

**Why:** the owner wants the assistant to never spend time/usage on
post-implementation verification or review it didn't ask for — that
belongs to the owner's own fresh-session verification pass (see
"Verification and Git policy" above and the global `~/.claude/CLAUDE.md`
"Testing / verification policy").

**How to apply:** across all DishFrame implementation passes, layered on
top of (not replacing) the "Assistant workflow preference" section above
— that section governs chat narration during the pass; this section
governs what happens once the edits are done.

# Implementation report policy (DishFrame-specific)

The global `~/.claude/CLAUDE.md` "Token-efficient implementation
handoffs" policy applies here. DishFrame-specific details (target
length, what `docs/SLICE_*.md` should and shouldn't contain) live in
`AGENTS.md`'s "Implementation report policy" section (@-included above)
— not restated here.
