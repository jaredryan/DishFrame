-- Slice 8 correction (Gate 4 forward note, PRODUCT_SPEC.md §24.4/§24.3):
-- purely additive columns. The DROP CONSTRAINT/DROP INDEX statements Prisma's
-- shadow-database diff proposed for this migration were spurious — those
-- objects are raw-SQL additions from migration 20260726050213 with no Prisma
-- Schema Language representation (docs/PRISMA_SCHEMA_PROPOSAL.md §1/§4,
-- docs/SLICE_2.md §5.2's known false-positive pattern) and are not touched
-- by this change. Verified empty `Timer` table locally, so the required
-- `durationSeconds` column needs no default/backfill.

-- AlterTable
ALTER TABLE "CookingSession" ADD COLUMN     "originalScaleFactor" DECIMAL(8,4);

-- AlterTable
ALTER TABLE "CookingSessionChecklistItem" ADD COLUMN     "baseQuantity" DECIMAL(12,3),
ADD COLUMN     "baseQuantityEnd" DECIMAL(12,3),
ADD COLUMN     "checkedQuantity" DECIMAL(12,3),
ADD COLUMN     "isApproximate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CookingSessionUnit" ADD COLUMN     "originalScaleFactor" DECIMAL(8,4);

-- AlterTable
ALTER TABLE "Timer" ADD COLUMN     "durationSeconds" INTEGER NOT NULL;
