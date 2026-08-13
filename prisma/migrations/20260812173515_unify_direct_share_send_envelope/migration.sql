-- Send-unification pass: every Send (Recipe and/or Part, to an existing
-- account or a not-yet-registered email) now creates a DirectShareCollection
-- with one or more DirectShare children -- there is no more ungrouped
-- single-item send path, so collectionId is no longer optional.
--
-- Spurious DROP CONSTRAINT/DROP INDEX lines Prisma's shadow-database diff
-- proposed for pre-existing hand-authored raw-SQL objects it cannot see
-- (dish_current_version_ownership, ingredient_section_version_consistency,
-- instruction_section_version_consistency, part_link_section_container_consistency,
-- and the three dish_*_trgm_idx trigram indexes) have been removed from
-- this file per AGENTS.md -- none of those objects are touched by this
-- migration.

-- This is a dev-stage product with no production data to preserve (see the
-- send-unification product decision) -- any pre-unification ungrouped
-- DirectShare row (collectionId IS NULL) is removed rather than backfilled
-- into a synthetic collection.
DELETE FROM "DirectShare" WHERE "collectionId" IS NULL;

-- AlterTable
ALTER TABLE "DirectShare" ALTER COLUMN "collectionId" SET NOT NULL;

-- The recipientId-keyed dedup index only ever protected ungrouped sends,
-- which no longer exist -- every row is now covered by the
-- recipientLookup-keyed index below. Intentional removal, not a stray drop.
-- migration-safety-allow-drop: one_pending_direct_share_per_sender_recipient_dish
DROP INDEX "one_pending_direct_share_per_sender_recipient_dish";

-- Recreate the recipientLookup-keyed dedup index without the now-redundant
-- "collectionId IS NOT NULL" clause -- collectionId is NOT NULL on every
-- row now, so the clause was only ever true. Intentional drop-and-recreate,
-- not a stray drop.
-- migration-safety-allow-drop: one_pending_direct_share_per_sender_dish_recipient_email
DROP INDEX "one_pending_direct_share_per_sender_dish_recipient_email";
CREATE UNIQUE INDEX "one_pending_direct_share_per_sender_dish_recipient_email"
  ON "DirectShare" ("senderId", "dishId", "recipientLookup")
  WHERE "status" = 'PENDING';
