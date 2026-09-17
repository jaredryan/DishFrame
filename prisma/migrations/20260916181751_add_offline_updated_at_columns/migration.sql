-- Adds `updatedAt` to MealPlan, MealPlanEntry, GroceryList, and
-- GroceryListItem so the offline sync layer can detect conflicts by
-- revision timestamp instead of last-write-wins
-- (docs/OFFLINE_IMPLEMENTATION_PLAN.md §3).
--
-- The migration Prisma generated for this schema change also proposed
-- dropping several hand-authored, unrelated raw-SQL objects
-- (dish_current_version_ownership, ingredient_section_version_consistency,
-- instruction_section_version_consistency,
-- part_link_section_container_consistency, and two trigram indexes) — a
-- known false-positive from Prisma's shadow-database diff not seeing
-- raw-SQL objects (AGENTS.md's "Database migrations" section). Those DROPs
-- were removed; this file contains only the four additive columns below.

-- AlterTable
ALTER TABLE "GroceryList" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GroceryListItem" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "MealPlan" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "MealPlanEntry" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
