-- Note: Prisma's shadow-DB diff proposed dropping several hand-authored,
-- raw-SQL objects it doesn't track (protected CHECK constraints and
-- trigram indexes from earlier migrations — see AGENTS.md "Database
-- migrations"). Those DROP statements were removed here; this migration
-- only adds the two new tables below.

-- CreateTable
CREATE TABLE "GroceryListMealPlanEntryExclusion" (
    "id" TEXT NOT NULL,
    "groceryListId" TEXT NOT NULL,
    "mealPlanEntryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryListMealPlanEntryExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroceryListRemovedContribution" (
    "id" TEXT NOT NULL,
    "groceryListId" TEXT NOT NULL,
    "mealPlanEntryId" TEXT NOT NULL,
    "ingredientLineageId" TEXT NOT NULL,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroceryListRemovedContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroceryListMealPlanEntryExclusion_groceryListId_idx" ON "GroceryListMealPlanEntryExclusion"("groceryListId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryListMealPlanEntryExclusion_groceryListId_mealPlanEnt_key" ON "GroceryListMealPlanEntryExclusion"("groceryListId", "mealPlanEntryId");

-- CreateIndex
CREATE INDEX "GroceryListRemovedContribution_groceryListId_idx" ON "GroceryListRemovedContribution"("groceryListId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryListRemovedContribution_groceryListId_mealPlanEntryI_key" ON "GroceryListRemovedContribution"("groceryListId", "mealPlanEntryId", "ingredientLineageId");

-- AddForeignKey
ALTER TABLE "GroceryListMealPlanEntryExclusion" ADD CONSTRAINT "GroceryListMealPlanEntryExclusion_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryListRemovedContribution" ADD CONSTRAINT "GroceryListRemovedContribution_groceryListId_fkey" FOREIGN KEY ("groceryListId") REFERENCES "GroceryList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
