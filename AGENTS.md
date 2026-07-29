<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow rules

- Write stable automated tests as part of the implementation, but do not
  run verification (lint, typecheck, unit tests, build, e2e, etc.) during
  a normal implementation pass — leave running it, and the broad
  completion command, to the owner afterward. See "Owner intervention and
  manual-review policy" below for the full workflow and the narrow
  debugging exception.
- Never `git commit` or `git push` unless the user explicitly asks for it
  in that turn. Leave changes staged/unstaged for the user to review and
  commit themselves.

# Subagent delegation and model selection

General rubric lives in the global `~/.claude/CLAUDE.md` ("Subagent
usage judgment" and "Subagent model selection"); this section only adds
DishFrame-specific examples, it doesn't restate the rubric.

- **`verify:feature` is a good Haiku-subagent candidate.** The self-run
  check (`CLAUDE.md`'s verification section) is mechanical — invoke,
  parse pass/fail, summarize — and can produce noisy lint/typecheck/
  test/build output. When a run is expected to be noisy, dispatching a
  Haiku subagent to run it and return only a pass/fail + failure summary
  keeps that log out of the main session. This changes _how_ the output
  reaches this session, not _whether_/_when_ `verify:feature` self-runs.
- **Reading canonical docs for synthesis stays a capable-model job.**
  Delegating a read of `docs/PRODUCT_SPEC.md`,
  `docs/ARCHITECTURE_PROPOSAL.md`, etc. for a conclusion (not a simple
  lookup) needs Sonnet/Opus doing the reading — a weak model misreading
  nuance here can silently corrupt a product/architecture decision.
  Delegate these only for context protection, never to save cost on
  model tier.

# Product spec authority

Slice reports (`docs/SLICE_*.md`, follow-up reports, and any other
implementation handoff document) are records of what was built and why at
the time — they are not product authority. Before changing or restating
product behavior, consult the relevant canonical documents directly, not
a prior slice report's summary of them.

**Why:** a correction pass found that product behavior had drifted from
the spec because prior sessions trusted slice-report summaries/decisions
over the actual canonical documents, silently compounding across slices
until a manual review caught it.

**Authority order** when documents conflict (highest wins):

1. Your explicit current decision (made in this conversation).
2. `docs/PRODUCT_SPEC.md` and `docs/BRANDING.md` — co-equal with each
   other: PRODUCT_SPEC governs product behavior, BRANDING governs
   visual/brand identity; neither outranks the other since they cover
   different domains and shouldn't normally conflict.
3. `docs/ARCHITECTURE_PROPOSAL.md`
4. `docs/BUILD_PLAN.md`
5. Slice reports (`docs/SLICE_*.md`, follow-ups, and other implementation
   handoff documents).
6. Existing code/tests.

`docs/PRODUCT_ROADMAP.md` is forward-looking context (what's planned),
not authority over current spec'd behavior — don't rank it against the
list above; consult it for direction, not for resolving a conflict.

**How to apply:**

- If a lower-ranked document and a higher-ranked one disagree, the
  higher-ranked one wins unless the owner has explicitly overridden it in
  this conversation.
- If the canonical documents are themselves ambiguous, silent, or
  conflict with each other at the same rank, flag the ambiguity to the
  owner rather than resolving it silently by inferring intent from a
  slice report or existing code.
- This applies whether a lower-ranked document is being read directly or
  recalled via summary (e.g., by another assistant/tool relaying prior
  session context).

**Deviating from a canonical document.** Having a good reason to deviate
from `PRODUCT_SPEC.md`, `BRANDING.md`, `ARCHITECTURE_PROPOSAL.md`, or
`BUILD_PLAN.md` is not, by itself, license to implement the deviation.
Raise it with the owner and get a decision _before_ implementing —
propose the deviation and the reasoning, don't silently build it and
report it as a fait accompli. Only if raising it first genuinely isn't
practical in the moment, implement conservatively and call out the
deviation explicitly and prominently in the report (not buried in a
changelog bullet) so the owner can reverse it easily. Silent deviation —
implementing without either asking first or flagging clearly afterward —
is the failure mode this whole section exists to prevent.

# Owner intervention and manual-review policy

The project uses layered review. The owner does not manually re-verify
every completed implementation slice, and Claude does not run automated
verification during normal implementation — each side has one job:

1. The implementation agent builds the approved scope and writes stable
   automated tests, but does not run them.
2. The owner runs the broad completion verification command, and Git
   operations, themselves after each implementation pass, to conserve
   Claude usage.
3. The implementation report is reviewed for architecture, product
   implications, unresolved decisions, and design-review needs.
4. The owner intervenes manually — via verification, and separately via
   manual UI review — only at the points this policy specifies, not
   routinely after every slice.

## Testing responsibility

The implementation agent:

- implements the approved scope;
- writes stable automated tests for domain contracts, validation,
  authorization, integrity rules, and mature workflows;
- documents which tests were added;
- does **not** run `verify:backend`, `verify:fullstack`, `verify:all`,
  Playwright, or migration/db scripts on its own initiative during a
  normal implementation pass;
- **self-initiated exception (added 2026-07-27):** after completing a
  major prompt — a slice, or a large polish/revision pass, not a small
  isolated edit — runs `pnpm run verify:feature` (see `CLAUDE.md` for the
  script's exact composition) without being asked, since it's the
  low-cost subset that excludes Playwright. If it fails, fixes the
  failure narrowly, reruns `verify:feature` to confirm, and reports both
  the original failure and the fix in the completion report. This does
  not extend to `verify:backend`/`verify:fullstack`/`verify:all`/
  Playwright themselves — those stay owner-run. If `verify:feature` fails
  because Docker Desktop itself isn't running, start it directly and wait
  for it rather than stopping to ask (see `CLAUDE.md`'s verification
  section for the exact procedure) — this is autonomous, not something to
  confirm with the owner first;
- may also run a failing subcommand narrowly when the owner explicitly
  returns a _different_ failure (e.g. from a Playwright run) and asks for
  a debugging pass — never re-running the broader suite or any Playwright
  test itself under this exception.

The owner:

- runs the broad completion command (`verify:all`) after the
  implementation pass;
- returns failures to the implementation agent for targeted debugging;
- performs Git inspection, commits, and pushes.

Do not treat tests as having passed until either the owner reports the
verification result, or (for the self-run `verify:feature` check
specifically) that check has completed and been reported.

## Manual review is separate from automated verification

Do not conflate:

1. the owner manually triggering automated verification; and
2. the owner manually navigating and evaluating the UI.

The owner is expected to run automated verification after each completed
pass. The owner should **not** be expected to perform a Playwright-like
browser walkthrough after every slice. Manual UI review should be
reserved for:

- formal Review Gates;
- meaningful design passes;
- unresolved product decisions;
- critical workflows that later slices materially depend on;
- situations where implementation reports or verification results reveal
  a specific concern.

Between those points, routine implementation may proceed based on:

- the approved specification;
- the implementation report;
- tests written by the implementation agent;
- the owner-run verification result;
- architectural and product review of the report.

## When owner input is required

Explicitly flag concrete questions when implementation exposes a
meaningful choice involving:

- product behavior or workflow;
- information architecture;
- terminology or user-facing copy;
- interaction design;
- visual hierarchy or responsive behavior;
- ambiguity between plausible interpretations of the canonical documents;
- an accepted tradeoff that may materially affect later slices;
- a critical workflow that subsequent work assumes is correct.

Do not manufacture questions merely to solicit feedback. Do not reopen
settled decisions without a concrete conflict or newly discovered
consequence.

## Owner intervention recommendation

Every completed slice or correction report should include a concise
section titled `Owner intervention recommendation`, focused on **product
and design judgment** — not on whether Claude personally ran tests.
Choose one recommendation:

- **Proceed without manual UI review** — after the owner runs
  verification successfully, no meaningful product or design judgment is
  pending.
- **Brief sanity check** — after successful verification, open only the
  named routes or interactions to ensure there is no obvious runtime or
  layout failure; defer detailed design review.
- **Focused manual review** — inspect only the listed product behaviors,
  workflows, or design questions before proceeding.
- **Full manual review required** — stop before the next slice because
  subsequent implementation materially depends on unresolved product
  behavior, design, information architecture, or workflow correctness.

For any recommendation, explicitly identify concrete product or design
questions requiring owner judgment. Do not manufacture questions and do
not recommend generic exhaustive testing.

## Review-gate precedence

A formal Review Gate in `docs/BUILD_PLAN.md` still requires its
prescribed review. This policy primarily governs slices between formal
gates.

## Testing and evolving presentation

Write automated tests for stable domain contracts, authorization,
integrity rules, calculations, and mature workflows, but do not run them
during a normal implementation pass. The owner runs the broad completion
verification afterward and returns failures for a separate targeted
debugging pass.

Do not use brittle presentation tests as a substitute for product or
design review while the UI is evolving. Detailed browser review may be
combined across related slices when the next slice does not depend on the
current presentation being settled.

# Implementation report policy

Applies the global `~/.claude/CLAUDE.md` "Token-efficient implementation
handoffs" policy to this project. `docs/SLICE_{#}.md` is a concise
operational handoff, not a comprehensive chapter — target ~80–150 lines
for a normal slice; a pre-gate architecture handoff (e.g. explaining a
transaction design ahead of a Review Gate) may run longer, but stay
concise and non-duplicative.

Include only: DishFrame-relevant deltas, decisions, tests written,
unresolved issues, and owner-review needs. Reference canonical
requirements by section number rather than restating them. Omit
exhaustive modified-file lists, command-by-command histories, and
repeated verification instructions.

Create a partial/checkpoint file only for genuine interruption risk or an
explicit pre-gate handoff; remove or mark it superseded once the final
report lands.

Review Gate documentation should focus on the actual architecture/product
questions under review, not reproduce the surrounding slice's full scope.

This does not change the owner-run testing, Git, source-of-truth, or
manual-review policies above — those stand as written.

# Database migrations

DishFrame uses custom CHECK constraints, composite foreign keys, partial
unique indexes, and trigram indexes that Prisma Schema Language cannot
fully represent (see `docs/PRISMA_SCHEMA_PROPOSAL.md` §1/§4). Always
generate migrations against local PostgreSQL with
`prisma migrate dev --create-only`. Inspect the complete generated SQL
before applying it. Reject unexpected `DROP CONSTRAINT`, `DROP INDEX`,
`ALTER TABLE ... DROP`, or equivalent removals of protected DishFrame
database objects — `pnpm db:scan-migrations` checks this automatically and
runs in CI. Review `prisma migrate diff` and run
`pnpm db:verify:local` (or the CI "Verify protected database objects" step)
after applying migrations to a fresh local database. Never generate or test
development migrations against Neon or production — ordinary development
and migration work uses the local Docker PostgreSQL (`pnpm db:docker:up`,
`pnpm db:migrate:local`), never `.env.production-access.local`.

Do not blindly apply Prisma-generated migration SQL. Temporary
partial-schema generation (staging a subset of `schema.prisma` to generate
one migration at a time) can produce erroneous `DROP` proposals for
raw-SQL objects the shadow-database diff doesn't know about — see
`docs/SLICE_2.md` §5.2 for a real instance of this. Any migration history
containing hand-authored SQL requires explicit inspection before trusting
a freshly generated file, not just a visual skim.
