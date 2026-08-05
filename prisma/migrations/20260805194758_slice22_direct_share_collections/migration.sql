-- Slice 22: unified single-/multi-Recipe direct sharing.
--
-- Spurious DROP CONSTRAINT/DROP INDEX lines Prisma's shadow-database diff
-- proposed for pre-existing hand-authored raw-SQL objects it cannot see
-- (dish_current_version_ownership, ingredient_section_version_consistency,
-- instruction_section_version_consistency, part_link_section_container_consistency,
-- and the three dish_*_trgm_idx trigram indexes) have been removed from
-- this file per AGENTS.md — none of those objects are touched by this
-- migration.

-- AlterTable
ALTER TABLE "DirectShare" ADD COLUMN     "collectionId" TEXT;

-- CreateTable
CREATE TABLE "DirectShareCollection" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientLookup" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectShareCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DirectShareCollection_senderId_idx" ON "DirectShareCollection"("senderId");

-- CreateIndex
CREATE INDEX "DirectShareCollection_recipientId_idx" ON "DirectShareCollection"("recipientId");

-- CreateIndex
CREATE INDEX "DirectShareCollection_recipientLookup_idx" ON "DirectShareCollection"("recipientLookup");

-- CreateIndex
CREATE INDEX "DirectShare_collectionId_idx" ON "DirectShare"("collectionId");

-- AddForeignKey
ALTER TABLE "DirectShare" ADD CONSTRAINT "DirectShare_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "DirectShareCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectShareCollection" ADD CONSTRAINT "DirectShareCollection_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectShareCollection" ADD CONSTRAINT "DirectShareCollection_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database-enforced "no duplicate pending send" for grouped (Slice 22)
-- children, keyed by the normalized invitation email (`recipientLookup`)
-- rather than `recipientId` — a not-yet-registered recipient's rows all
-- have `recipientId IS NULL`, and Postgres treats every NULL as distinct,
-- so the pre-existing `one_pending_direct_share_per_sender_recipient_dish`
-- index (still relied on unchanged by ungrouped/Part sends) cannot prevent
-- duplicate pending invitations to the same not-yet-registered email.
-- Scoped to `collectionId IS NOT NULL` so it only governs Slice 22's grouped
-- rows, never the legacy ungrouped ones already covered by the index above.
-- Prisma cannot express a partial unique index directly
-- (docs/PRISMA_SCHEMA_PROPOSAL.md §4).
CREATE UNIQUE INDEX "one_pending_direct_share_per_sender_dish_recipient_email"
  ON "DirectShare" ("senderId", "dishId", "recipientLookup")
  WHERE "status" = 'PENDING' AND "collectionId" IS NOT NULL;
