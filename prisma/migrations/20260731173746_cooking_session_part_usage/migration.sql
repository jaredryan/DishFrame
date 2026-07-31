-- CreateEnum
CREATE TYPE "PartUsageRelation" AS ENUM ('DIRECT', 'NESTED');

-- CreateTable
CREATE TABLE "CookingSessionPartUsage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "partDishId" TEXT,
    "partVersionId" TEXT,
    "partTitleSnapshot" TEXT NOT NULL,
    "partVersionLabelSnapshot" TEXT NOT NULL,
    "relation" "PartUsageRelation" NOT NULL,
    "viaPartTitleSnapshot" TEXT,
    "pathSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookingSessionPartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CookingSessionPartUsage_sessionId_idx" ON "CookingSessionPartUsage"("sessionId");

-- CreateIndex
CREATE INDEX "CookingSessionPartUsage_unitId_idx" ON "CookingSessionPartUsage"("unitId");

-- CreateIndex
CREATE INDEX "CookingSessionPartUsage_partDishId_idx" ON "CookingSessionPartUsage"("partDishId");

-- AddForeignKey
ALTER TABLE "CookingSessionPartUsage" ADD CONSTRAINT "CookingSessionPartUsage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CookingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionPartUsage" ADD CONSTRAINT "CookingSessionPartUsage_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "CookingSessionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionPartUsage" ADD CONSTRAINT "CookingSessionPartUsage_partDishId_partVersionId_fkey" FOREIGN KEY ("partDishId", "partVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Hand-added raw SQL, per docs/PRISMA_SCHEMA_PROPOSAL.md §4 pattern.
--
-- The spurious DROP statements Prisma's shadow-database diff generated for
-- pre-existing hand-authored objects (dish_current_version_ownership,
-- ingredient/instruction/part_link_section consistency CHECKs, the trigram
-- indexes) were removed from this file entirely — same documented issue as
-- SLICE_2.md §5.2: the shadow DB replays only Prisma-managed migration
-- history, so it has no record of raw SQL added by hand in prior migrations
-- and proposes to drop it. Nothing here actually removes any protected
-- object; scripts/scan-migrations.ts and scripts/verify-db-objects.ts both
-- confirm this.
-- ============================================================================

-- SLICE_9.md correction pass — same paired-nullability rule as
-- rating_dish_pair_consistency (Rating.dishId/dishVersionId): the composite
-- FK's MATCH SIMPLE behavior alone would silently accept a half-null row.
ALTER TABLE "CookingSessionPartUsage"
  ADD CONSTRAINT "cooking_session_part_usage_pair_consistency"
  CHECK (
    ("partDishId" IS NULL AND "partVersionId" IS NULL)
    OR ("partDishId" IS NOT NULL AND "partVersionId" IS NOT NULL)
  );
