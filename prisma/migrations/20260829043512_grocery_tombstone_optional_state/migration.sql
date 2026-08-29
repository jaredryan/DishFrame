-- Note: Prisma's shadow-DB diff again proposed dropping the same
-- hand-authored, raw-SQL objects it doesn't track (see the prior
-- 20260829040312 migration and AGENTS.md "Database migrations"). Removed
-- here; this migration only adds the new NOT NULL column below.
--
-- No default is needed: `GroceryListRemovedContribution` was introduced by
-- the prior (still-unreleased) migration, so it has no existing production
-- rows this column would otherwise need to backfill.
ALTER TABLE "GroceryListRemovedContribution" ADD COLUMN     "wasOptional" BOOLEAN NOT NULL;
