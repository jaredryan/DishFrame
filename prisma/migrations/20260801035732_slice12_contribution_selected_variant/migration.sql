-- CreateEnum
CREATE TYPE "GroceryContributionVariant" AS ENUM ('PRIMARY', 'SUBSTITUTE');

-- AlterTable
ALTER TABLE "GroceryItemContribution" ADD COLUMN     "selectedVariant" "GroceryContributionVariant" NOT NULL DEFAULT 'PRIMARY';
