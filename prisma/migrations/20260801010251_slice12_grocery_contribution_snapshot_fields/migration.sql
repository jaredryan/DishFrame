-- AlterTable
ALTER TABLE "GroceryItemContribution" ADD COLUMN     "isOptional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "substituteIngredientLineageId" TEXT,
ADD COLUMN     "substituteName" TEXT,
ADD COLUMN     "substituteQuantityDecimal" DECIMAL(12,3),
ADD COLUMN     "substituteQuantityText" TEXT,
ADD COLUMN     "substituteUnit" TEXT;
