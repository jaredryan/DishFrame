-- Meal Plan QA redesign — Schedule day-card eaten state + per-day
-- user-defined ordering (docs/PRODUCT_SPEC.md Meal Plan section).
--
-- The Prisma-generated diff for this migration also proposed dropping four
-- protected raw-SQL objects (dish_current_version_ownership,
-- ingredient_section_version_consistency,
-- instruction_section_version_consistency,
-- part_link_section_container_consistency, and three dish_*_trgm_idx
-- indexes) that schema.prisma cannot represent — a known false-positive
-- documented in AGENTS.md's "Database migrations" section. Those DROP
-- statements were removed; only the actual intended change is applied here.

-- AlterTable
ALTER TABLE "PlannedMeal"
  ADD COLUMN "eaten" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
