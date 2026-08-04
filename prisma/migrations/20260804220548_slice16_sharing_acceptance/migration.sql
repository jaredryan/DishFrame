-- Slice 16: the shadow-database diff proposed dropping four raw-SQL CHECK/
-- FK constraints (dish_current_version_ownership,
-- ingredient_section_version_consistency,
-- instruction_section_version_consistency,
-- part_link_section_container_consistency) and three trigram indexes
-- (dish_cuisine_trgm_idx, dish_current_structural_search_text_trgm_idx,
-- dish_current_title_trgm_idx). These are pre-existing protected objects
-- added by hand-authored raw SQL in earlier migrations, not represented in
-- schema.prisma — Prisma's diff cannot see them and proposes dropping them
-- on every unrelated schema change. Removed from this migration entirely
-- per AGENTS.md's "Database migrations" section; `pnpm db:scan-migrations`
-- guards against this reappearing.

-- AlterTable
ALTER TABLE "ShareLink" ADD COLUMN     "showCreatorName" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ShareLinkAcceptance" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdDishId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLinkAcceptance_createdDishId_key" ON "ShareLinkAcceptance"("createdDishId");

-- CreateIndex
CREATE INDEX "ShareLinkAcceptance_recipientId_idx" ON "ShareLinkAcceptance"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "ShareLinkAcceptance_shareLinkId_recipientId_key" ON "ShareLinkAcceptance"("shareLinkId", "recipientId");

-- AddForeignKey
ALTER TABLE "ShareLinkAcceptance" ADD CONSTRAINT "ShareLinkAcceptance_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkAcceptance" ADD CONSTRAINT "ShareLinkAcceptance_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLinkAcceptance" ADD CONSTRAINT "ShareLinkAcceptance_createdDishId_fkey" FOREIGN KEY ("createdDishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;
