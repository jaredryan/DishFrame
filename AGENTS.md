<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow rules

- Write stable automated tests as part of the implementation. The
  testing/verification workflow — what may run during implementation,
  what stays owner-run, and the fresh-session repair path — is owned by
  the global `~/.claude/CLAUDE.md` "Testing / verification policy", not
  restated here. DishFrame's own commands are `verify:feature`/
  `verify:backend`/`verify:fullstack`/`verify:all` (see `CLAUDE.md`'s
  "Verification scripts").
- Never `git commit` or `git push` unless the user explicitly asks for it
  in that turn. Leave changes staged/unstaged for the user to review and
  commit themselves.

# Usage-efficient execution (added 2026-07-30; verification bullets amended 2026-07-31)

Applies the global `~/.claude/CLAUDE.md` "Usage-efficient execution
policy" section to DishFrame. Normal DishFrame implementation passes
should:

- execute directly from the owner's prompt — do not automatically
  generate a second implementation plan or restate the prompt as an
  exhaustive plan;
- avoid Superpowers planning/execution skills (`writing-plans`,
  `executing-plans`, etc.) unless the owner explicitly requests one or
  the task is genuinely ambiguous/architecturally complex enough that a
  skill provides value direct implementation can't;
- avoid subagents by default — see "Subagent delegation and model
  selection" below, which this tightens;
- read `CLAUDE.md`, `AGENTS.md`, the relevant Build Plan section,
  targeted canonical-doc sections, the one directly relevant concise
  handoff, and the affected code — not more;
- not automatically reread every prior `docs/SLICE_*.md` file;
- write focused tests appropriate to feature maturity, and run only
  narrowly targeted commands while implementing — never `verify:feature`,
  `check`, `verify:all`, `verify:backend`/`verify:fullstack`, or
  Playwright as an end-of-pass gate (full policy in the global
  `~/.claude/CLAUDE.md`; see "Workflow rules" above);
- not dispatch a subagent merely to run routine tests;
- keep `docs/SLICE_*.md` concise and centered on current truth (see
  "Implementation report policy" below).

A test-value audit (2026-07-30) revisited existing test coverage against
this policy — see "Test-value policy" under "Owner intervention and
manual-review policy" below for the durable rule it produced.

# Subagent delegation and model selection

General rubric lives in the global `~/.claude/CLAUDE.md` ("Subagent
usage judgment" and "Subagent model selection"); this section only adds
DishFrame-specific examples, it doesn't restate the rubric.

- Broad verification, including `verify:feature`, is never run
  in-session (see "Workflow rules" above), so it's not a
  subagent-delegation candidate. Delegating a narrowly targeted command
  during implementation still follows the general two-condition test
  from the global rubric: only worth it when session context is too
  valuable to `/clear`/`/compact` mid-task and the run is expected to be
  noisy enough that isolating its output is worth the cold-start cost.
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
every completed implementation slice — each side has one job:

1. The implementation agent builds the approved scope and writes stable
   automated tests, running only narrowly targeted commands as needed
   (see "Testing responsibility" below).
2. The owner runs full verification and Git operations themselves, in a
   fresh session, after each implementation pass.
3. The implementation report is reviewed for architecture, product
   implications, unresolved decisions, and design-review needs.
4. The owner intervenes manually — via verification, and separately via
   manual UI review — only at the points this policy specifies, not
   routinely after every slice.

## Testing responsibility

Full workflow — what the implementation agent may run, what stays
owner-run, and the fresh-session repair path — is owned by the global
`~/.claude/CLAUDE.md` "Testing / verification policy"; not restated
here. DishFrame specifics:

- the owner's full completion command is `pnpm run verify:all` (see
  `CLAUDE.md`'s "Verification scripts" for the full command list);
- in a fresh repair session, read the relevant `docs/SLICE_N.md`
  current-truth handoff alongside the failing test/config and directly
  affected files;
- a repair never expands into `verify:e2e`/Playwright — the owner always
  runs that themselves, even for a single narrowly-scoped spec.

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
integrity rules, calculations, and mature workflows — see "Testing
responsibility" above for what may run during implementation vs. what
stays owner-run.

Do not use brittle presentation tests as a substitute for product or
design review while the UI is evolving. Detailed browser review may be
combined across related slices when the next slice does not depend on the
current presentation being settled.

## Test-value policy (added 2026-07-30, after the test-value audit)

A test should protect consequential behavior — user-impacting, security,
persistence, calculation, workflow, or data-integrity — not stand as a
changelog of a completed polish pass. Apply this when writing or
reviewing any DishFrame test:

- test consequential behavior, not completed polish or a frozen visual
  arrangement;
- match coverage depth to feature maturity — defer detailed coverage for
  UI/workflows still under active design iteration;
- prefer the cheapest durable layer capable of protecting a behavior
  (unit for pure calculation/validation, component for meaningful client
  state/interaction, integration for persistence/authorization/domain
  workflows, a small number of E2E journeys for critical cross-boundary
  paths);
- strongly preserve authentication/ownership boundaries, Recipe/Part
  lifecycle operations, Version classification and allocation, PartLink
  pinning/composition/cycle-prevention, propagation, two-phase Part
  deletion, historical materialization/comparison, image authorization,
  scaling/quantity calculations, and database constraints/transactions;
- avoid presentation-only assertions (CSS, spacing, exact DOM nesting,
  icon choice, tooltip styling) and avoid absence assertions unless the
  absence itself is a real invariant (authorization, private-data
  exposure, an archived/deleted item's exclusion, a validation error
  clearing) rather than a snapshot of where a control isn't shown today;
- avoid duplicating the same detailed behavior across multiple layers
  without a distinct reason to;
- simplify or remove a test once the design/copy/primitive it verified no
  longer exists, rather than leaving it as historical proof a past
  correction landed;
- require a new test to protect a plausible future regression, not merely
  to document that a change happened;
- keep Playwright/E2E limited to journeys that need a real browser,
  session, or full-stack round trip — not coverage already fully
  protected more cheaply below it.

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
