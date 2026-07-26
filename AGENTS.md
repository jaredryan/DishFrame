<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Workflow rules

- Run verification (lint, typecheck, unit tests, build, e2e, etc.) once at
  the end of a task, in a single pass — not incrementally after every
  change.
- Never `git commit` or `git push` unless the user explicitly asks for it
  in that turn. Leave changes staged/unstaged for the user to review and
  commit themselves.

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
