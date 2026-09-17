-- Prisma's shadow-database diff proposed dropping several hand-authored,
-- raw-SQL protected objects (the composite-FK consistency constraints and
-- trigram search indexes added outside schema.prisma) — a known false
-- positive for any migration generated while those objects exist
-- (AGENTS.md "Database migrations": Prisma Schema Language cannot
-- represent them, so a fresh shadow DB never recreates them and the diff
-- reads their absence as "drop these"). Removed from this migration;
-- `pnpm db:scan-migrations` (CI) and `pnpm db:verify:local` confirm none of
-- them are actually touched. Only the two genuine `ADD COLUMN` blocks below
-- are real.

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "calories" DECIMAL(10,2),
ADD COLUMN     "carbs" DECIMAL(10,2),
ADD COLUMN     "fat" DECIMAL(10,2),
ADD COLUMN     "moreNutrients" JSONB,
ADD COLUMN     "protein" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "Section" ADD COLUMN     "calories" DECIMAL(10,2),
ADD COLUMN     "carbs" DECIMAL(10,2),
ADD COLUMN     "fat" DECIMAL(10,2),
ADD COLUMN     "moreNutrients" JSONB,
ADD COLUMN     "protein" DECIMAL(10,2);
