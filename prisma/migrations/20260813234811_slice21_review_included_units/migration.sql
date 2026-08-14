-- AlterTable
ALTER TABLE "SessionReview" ADD COLUMN     "includedUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
