-- CreateEnum
CREATE TYPE "GroceryListMode" AS ENUM ('STANDALONE', 'MEAL_PLAN_LINKED');

-- CreateEnum
CREATE TYPE "GroceryItemSyncFlag" AS ENUM ('UNCHANGED', 'CHANGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "GroceryContributionState" AS ENUM ('ACTIVE', 'CHANGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MealPlanEntryStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COOKED', 'SKIPPED');

-- NOTE (migration-generation issue, documented in docs/SLICE_2.md): same
-- spurious "unmanaged object" DROP statements Prisma proposed in Migration 2,
-- for the same reason (raw-SQL objects from Migration 1 aren't represented in
-- schema.prisma, so the shadow-database diff sees them as extraneous). Removed
-- from this file; those constraints/indexes are untouched by this migration.

-- CreateTable
CREATE TABLE "GroceryList" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "GroceryListMode" NOT NULL DEFAULT 'STANDALONE',
    "linkedMealPlanId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListSource" (
    "id" TEXT NOT NULL,
    "groceryListId" TEXT NOT NULL,
    "dishId" TEXT,
    "dishVersionId" TEXT,
    "scaleFactor" DECIMAL(8,4),
    "sourceDishTitleSnapshot" TEXT NOT NULL,
    "sourceDishKindSnapshot" "DishKind" NOT NULL,
    "sourceDishVersionLabelSnapshot" TEXT NOT NULL,

    CONSTRAINT "GroceryListSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListItem" (
    "id" TEXT NOT NULL,
    "groceryListId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "quantityText" TEXT,
    "quantityDecimal" DECIMAL(12,3),
    "unit" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3),
    "syncFlag" "GroceryItemSyncFlag" NOT NULL DEFAULT 'UNCHANGED',
    "flagAcknowledgedAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL,

    CONSTRAINT "GroceryListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryItemContribution" (
    "id" TEXT NOT NULL,
    "groceryListItemId" TEXT NOT NULL,
    "groceryListSourceId" TEXT,
    "mealPlanEntryId" TEXT,
    "ingredientLineageId" TEXT,
    "originalName" TEXT NOT NULL,
    "quantityDecimal" DECIMAL(12,3),
    "quantityText" TEXT,
    "unit" TEXT,
    "state" "GroceryContributionState" NOT NULL DEFAULT 'ACTIVE',
    "previousQuantityDecimal" DECIMAL(12,3),
    "previousQuantityText" TEXT,
    "previousUnit" TEXT,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "GroceryItemContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealPlanEntry" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "dishId" TEXT,
    "dishVersionId" TEXT,
    "cookDate" TIMESTAMP(3) NOT NULL,
    "targetYieldQuantity" DECIMAL(12,3),
    "targetYieldUnit" TEXT,
    "note" TEXT,
    "status" "MealPlanEntryStatus" NOT NULL DEFAULT 'PLANNED',
    "linkedSessionId" TEXT,
    "sourceDishTitleSnapshot" TEXT NOT NULL,
    "sourceDishKindSnapshot" "DishKind" NOT NULL,
    "sourceDishVersionLabelSnapshot" TEXT NOT NULL,

    CONSTRAINT "MealPlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "servings" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "PlannedMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientCategoryMemory" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "normalizedIngredientName" TEXT NOT NULL,
    "groceryCategoryId" TEXT NOT NULL,

    CONSTRAINT "IngredientCategoryMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroceryList_ownerId_idx" ON "GroceryList"("ownerId");

-- CreateIndex
CREATE INDEX "GroceryList_linkedMealPlanId_idx" ON "GroceryList"("linkedMealPlanId");

-- CreateIndex
CREATE INDEX "GroceryListSource_groceryListId_idx" ON "GroceryListSource"("groceryListId");

-- CreateIndex
CREATE INDEX "GroceryListSource_dishId_idx" ON "GroceryListSource"("dishId");

-- CreateIndex
CREATE INDEX "GroceryListItem_groceryListId_categoryId_idx" ON "GroceryListItem"("groceryListId", "categoryId");

-- CreateIndex
CREATE INDEX "GroceryItemContribution_groceryListItemId_idx" ON "GroceryItemContribution"("groceryListItemId");

-- CreateIndex
CREATE INDEX "GroceryItemContribution_ingredientLineageId_idx" ON "GroceryItemContribution"("ingredientLineageId");

-- CreateIndex
CREATE INDEX "GroceryItemContribution_mealPlanEntryId_idx" ON "GroceryItemContribution"("mealPlanEntryId");

-- CreateIndex
CREATE INDEX "MealPlan_ownerId_idx" ON "MealPlan"("ownerId");

-- CreateIndex
CREATE INDEX "MealPlanEntry_mealPlanId_cookDate_idx" ON "MealPlanEntry"("mealPlanId", "cookDate");

-- CreateIndex
CREATE INDEX "MealPlanEntry_linkedSessionId_idx" ON "MealPlanEntry"("linkedSessionId");

-- CreateIndex
CREATE INDEX "MealPlanEntry_dishId_idx" ON "MealPlanEntry"("dishId");

-- CreateIndex
CREATE INDEX "PlannedMeal_entryId_idx" ON "PlannedMeal"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientCategoryMemory_ownerId_normalizedIngredientName_key" ON "IngredientCategoryMemory"("ownerId", "normalizedIngredientName");

-- AddForeignKey
ALTER TABLE "GroceryList" ADD CONSTRAINT "GroceryList_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryList" ADD CONSTRAINT "GroceryList_linkedMealPlanId_fkey" FOREIGN KEY ("linkedMealPlanId") REFERENCES "MealPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListSource" ADD CONSTRAINT "GroceryListSource_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListSource" ADD CONSTRAINT "GroceryListSource_dishId_dishVersionId_fkey" FOREIGN KEY ("dishId", "dishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListItem" ADD CONSTRAINT "GroceryListItem_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListItem" ADD CONSTRAINT "GroceryListItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroceryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItemContribution" ADD CONSTRAINT "GroceryItemContribution_groceryListItemId_fkey" FOREIGN KEY ("groceryListItemId") REFERENCES "GroceryListItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItemContribution" ADD CONSTRAINT "GroceryItemContribution_groceryListSourceId_fkey" FOREIGN KEY ("groceryListSourceId") REFERENCES "GroceryListSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryItemContribution" ADD CONSTRAINT "GroceryItemContribution_mealPlanEntryId_fkey" FOREIGN KEY ("mealPlanEntryId") REFERENCES "MealPlanEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_dishId_dishVersionId_fkey" FOREIGN KEY ("dishId", "dishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlanEntry" ADD CONSTRAINT "MealPlanEntry_linkedSessionId_fkey" FOREIGN KEY ("linkedSessionId") REFERENCES "CookingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "MealPlanEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientCategoryMemory" ADD CONSTRAINT "IngredientCategoryMemory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientCategoryMemory" ADD CONSTRAINT "IngredientCategoryMemory_groceryCategoryId_fkey" FOREIGN KEY ("groceryCategoryId") REFERENCES "GroceryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Hand-added raw SQL, per docs/PRISMA_SCHEMA_PROPOSAL.md §4 (Migration 3).
-- ============================================================================

ALTER TABLE "GroceryList"
  ADD CONSTRAINT "grocery_list_mode_consistency"
  CHECK (
    ("mode" = 'MEAL_PLAN_LINKED' AND "linkedMealPlanId" IS NOT NULL)
    OR
    ("mode" = 'STANDALONE' AND "linkedMealPlanId" IS NULL)
  );

ALTER TABLE "MealPlan"
  ADD CONSTRAINT "meal_plan_date_order"
  CHECK ("endDate" >= "startDate");

-- Round-3 Correction 4 — same pair-consistency pattern as Rating, above:
ALTER TABLE "GroceryListSource"
  ADD CONSTRAINT "grocery_list_source_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );

ALTER TABLE "MealPlanEntry"
  ADD CONSTRAINT "meal_plan_entry_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );

-- Slice 2 follow-up: the protected fallback Grocery Category (behaviorally
-- identified, not by name — see prisma/schema.prisma's GroceryCategory
-- comment). Added here, in the planning/grocery migration, rather than
-- Migration 1 (where the GroceryCategory table itself was created),
-- because this behavior belongs conceptually to grocery-list management.
ALTER TABLE "GroceryCategory" ADD COLUMN "isFallback" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "one_fallback_category_per_user"
  ON "GroceryCategory" ("ownerId")
  WHERE "isFallback" = true;
