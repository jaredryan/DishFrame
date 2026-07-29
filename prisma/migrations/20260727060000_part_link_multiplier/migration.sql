-- Slice 6 post-gate (Review Gate 3): adds PartLink.multiplier, the
-- parent-specific quantity multiplier for a linked Part (default 1,
-- must be positive).
--
-- Hand-authored, NOT generated via `prisma migrate dev --create-only`:
-- this pass's owner-approved workflow explicitly withholds running any
-- Prisma/DB command (see docs/SLICE_6.md and AGENTS.md's "Database
-- migrations" section). Before applying, the owner should run
-- `prisma migrate dev --create-only` locally against a fresh diff and
-- confirm this file matches what Prisma would generate for the
-- `multiplier` column addition (watching for the known trap this repo has
-- hit before — a partial-schema diff proposing spurious `DROP
-- CONSTRAINT`/`DROP INDEX` statements for raw-SQL-managed objects, see the
-- 20260727022624_taster_position migration's own note) before trusting it
-- against real data.

ALTER TABLE "PartLink" ADD COLUMN "multiplier" DECIMAL(8,4) NOT NULL DEFAULT 1;

ALTER TABLE "PartLink"
  ADD CONSTRAINT "part_link_multiplier_positive"
  CHECK ("multiplier" > 0);
