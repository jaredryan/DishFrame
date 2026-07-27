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
- does **not** run those tests, broad verification, typechecking,
  linting, builds, or Playwright during a normal implementation pass;
- may run a failing subcommand only when the owner explicitly returns a
  failure and asks for a debugging pass.

The owner:

- runs the broad completion command after the implementation pass;
- returns failures to the implementation agent for targeted debugging;
- performs Git inspection, commits, and pushes.

Do not treat tests as having passed until the owner reports the
verification result.

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
