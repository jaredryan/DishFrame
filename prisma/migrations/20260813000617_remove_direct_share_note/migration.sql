-- Note now lives solely on the DirectShareCollection envelope
-- (sendDirectShareCollection.md product decision: one Send -> one optional
-- note, shared across every item in the Send, never per-item). Spurious
-- DROP CONSTRAINT/DROP INDEX lines Prisma's shadow-database diff proposed
-- for pre-existing hand-authored raw-SQL objects it cannot see
-- (dish_current_version_ownership, ingredient_section_version_consistency,
-- instruction_section_version_consistency, part_link_section_container_consistency,
-- and the dish_*_trgm_idx trigram indexes) have been removed from this file
-- per AGENTS.md -- none of those objects are touched by this migration.

-- AlterTable
ALTER TABLE "DirectShare" DROP COLUMN "note";
