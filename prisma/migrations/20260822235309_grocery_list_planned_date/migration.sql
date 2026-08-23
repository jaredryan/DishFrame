-- Add the user-facing "date" field to GroceryList (distinct from createdAt).
-- Added nullable first so existing rows can be backfilled, then enforced
-- NOT NULL — a straight required-column add fails against non-empty tables.
--
-- NOTE: The Prisma-generated draft for this migration also proposed dropping
-- several hand-authored, unrelated protected objects (dish_current_version_ownership,
-- ingredient_section_version_consistency, instruction_section_version_consistency,
-- part_link_section_container_consistency, and the dish trigram indexes) because the
-- shadow-database diff doesn't see raw-SQL objects from prior migrations. Those DROPs
-- were removed — see AGENTS.md "Database migrations".

-- AlterTable
ALTER TABLE "GroceryList" ADD COLUMN "plannedDate" DATE;

-- Backfill: existing lists get their createdAt date as the planned date.
UPDATE "GroceryList" SET "plannedDate" = "createdAt"::date WHERE "plannedDate" IS NULL;

-- AlterTable
ALTER TABLE "GroceryList" ALTER COLUMN "plannedDate" SET NOT NULL;
