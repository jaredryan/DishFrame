-- CreateEnum
CREATE TYPE "ShareLinkMode" AS ENUM ('FIXED_SNAPSHOT', 'CURRENT');

-- CreateEnum
CREATE TYPE "DirectShareStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELED');

-- NOTE (migration-generation issue, documented in docs/SLICE_2.md): same
-- spurious "unmanaged object" DROP statements Prisma proposed in Migrations 2
-- and 3, for the same reason. Removed from this file; those
-- constraints/indexes are untouched by this migration.

-- CreateTable
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mode" "ShareLinkMode" NOT NULL DEFAULT 'FIXED_SNAPSHOT',
    "tokenId" TEXT NOT NULL,
    "currentDishId" TEXT,
    "fixedDishId" TEXT,
    "fixedDishVersionId" TEXT,
    "frozenSnapshot" JSONB,
    "dishTitleSnapshot" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectShare" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientLookup" TEXT NOT NULL,
    "dishId" TEXT,
    "dishVersionId" TEXT,
    "dishTitleSnapshot" TEXT NOT NULL,
    "note" TEXT,
    "status" "DirectShareStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_tokenId_key" ON "ShareLink"("tokenId");

-- CreateIndex
CREATE INDEX "ShareLink_ownerId_idx" ON "ShareLink"("ownerId");

-- CreateIndex
CREATE INDEX "ShareLink_currentDishId_idx" ON "ShareLink"("currentDishId");

-- CreateIndex
CREATE INDEX "ShareLink_fixedDishId_idx" ON "ShareLink"("fixedDishId");

-- CreateIndex
CREATE INDEX "DirectShare_senderId_idx" ON "DirectShare"("senderId");

-- CreateIndex
CREATE INDEX "DirectShare_recipientId_idx" ON "DirectShare"("recipientId");

-- CreateIndex
CREATE INDEX "DirectShare_dishId_status_idx" ON "DirectShare"("dishId", "status");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_currentDishId_fkey" FOREIGN KEY ("currentDishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_fixedDishId_fixedDishVersionId_fkey" FOREIGN KEY ("fixedDishId", "fixedDishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectShare" ADD CONSTRAINT "DirectShare_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectShare" ADD CONSTRAINT "DirectShare_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectShare" ADD CONSTRAINT "DirectShare_dishId_dishVersionId_fkey" FOREIGN KEY ("dishId", "dishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Hand-added raw SQL, per docs/PRISMA_SCHEMA_PROPOSAL.md §4 (Migration 4).
-- ============================================================================

-- Round-3 Correction 3 — revised to reflect ShareLink's redesigned fields (currentDishId /
-- fixedDishId / fixedDishVersionId, replacing the single dishId/dishVersionId pair from
-- round 2) and to explicitly allow a revoked link's source references to be cleared:
ALTER TABLE "ShareLink"
  ADD CONSTRAINT "share_link_mode_consistency"
  CHECK (
    -- the fixed pair is always either both-null or both-set, regardless of mode/revocation:
    (
      ("fixedDishId" IS NULL AND "fixedDishVersionId" IS NULL)
      OR
      ("fixedDishId" IS NOT NULL AND "fixedDishVersionId" IS NOT NULL)
    )
    AND
    (
      "revokedAt" IS NOT NULL
      OR
      (
        "mode" = 'CURRENT'
        AND "currentDishId" IS NOT NULL
        AND "fixedDishId" IS NULL
        AND "fixedDishVersionId" IS NULL
        AND "frozenSnapshot" IS NULL
      )
      OR
      (
        "mode" = 'FIXED_SNAPSHOT'
        AND "currentDishId" IS NULL
        AND "fixedDishId" IS NOT NULL
        AND "fixedDishVersionId" IS NOT NULL
        AND "frozenSnapshot" IS NOT NULL
      )
    )
  );

-- Round-3 Correction 4 — same pair-consistency pattern as Rating/GroceryListSource/MealPlanEntry:
ALTER TABLE "DirectShare"
  ADD CONSTRAINT "direct_share_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );
