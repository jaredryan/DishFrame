-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ENDED_EARLY');

-- CreateEnum
CREATE TYPE "ChecklistItemKind" AS ENUM ('INGREDIENT', 'INSTRUCTION');

-- CreateEnum
CREATE TYPE "TimerState" AS ENUM ('RUNNING', 'PAUSED', 'EXPIRED', 'DISMISSED');

-- NOTE (migration-generation issue, documented in docs/SLICE_2.md): Prisma's
-- shadow-database diffing reconstructs "before" state by replaying prior
-- migration.sql files, including the hand-added raw-SQL constraints/indexes
-- from Migration 1 that have no Prisma-schema representation. Because those
-- objects aren't declared in schema.prisma, `prisma migrate dev --create-only`
-- proposed dropping all four of them here as spurious "unmanaged object"
-- diffs. They are intentionally permanent and are NOT touched by this
-- migration — the erroneous DROP statements Prisma generated have been
-- removed from this file.

-- CreateTable
CREATE TABLE "CookingSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "dishVersionId" TEXT NOT NULL,
    "state" "SessionState" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "rawElapsedSeconds" INTEGER,
    "adjustedDurationSeconds" INTEGER,
    "scaleFactor" DECIMAL(8,4),
    "cookingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingSessionUnit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "scaleFactor" DECIMAL(8,4),
    "completedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removedAfterProgress" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "sourceDishTitle" TEXT NOT NULL,
    "sourceDishVersionLabel" TEXT NOT NULL,
    "sourceSectionLineageId" TEXT,
    "sourcePartLinkLineageId" TEXT,

    CONSTRAINT "CookingSessionUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingSessionChecklistItem" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" "ChecklistItemKind" NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "displayText" TEXT NOT NULL,
    "displayQuantity" TEXT,
    "displayUnit" TEXT,
    "sourceLineageId" TEXT,

    CONSTRAINT "CookingSessionChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timer" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetEndAt" TIMESTAMP(3),
    "remainingSeconds" INTEGER,
    "state" "TimerState" NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "Timer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionReview" (
    "sessionId" TEXT NOT NULL,
    "whatWentWell" TEXT,
    "whatDidNotGoWell" TEXT,
    "anythingElse" TEXT,
    "actualAmountQuantity" DECIMAL(12,3),
    "actualAmountUnit" TEXT,
    "reviewAdjustedDurationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionReview_pkey" PRIMARY KEY ("sessionId")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dishId" TEXT,
    "dishVersionId" TEXT,
    "dishTitleSnapshot" TEXT NOT NULL,
    "dishVersionLabelSnapshot" TEXT NOT NULL,
    "tasterId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taster" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Taster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CookingSession_ownerId_state_updatedAt_idx" ON "CookingSession"("ownerId", "state", "updatedAt");

-- CreateIndex
CREATE INDEX "CookingSession_dishId_idx" ON "CookingSession"("dishId");

-- CreateIndex
CREATE INDEX "CookingSessionUnit_sessionId_idx" ON "CookingSessionUnit"("sessionId");

-- CreateIndex
CREATE INDEX "CookingSessionChecklistItem_unitId_idx" ON "CookingSessionChecklistItem"("unitId");

-- CreateIndex
CREATE INDEX "Timer_unitId_idx" ON "Timer"("unitId");

-- CreateIndex
CREATE INDEX "Rating_dishId_dishVersionId_idx" ON "Rating"("dishId", "dishVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_sessionId_tasterId_dishId_key" ON "Rating"("sessionId", "tasterId", "dishId");

-- CreateIndex
CREATE INDEX "Taster_ownerId_idx" ON "Taster"("ownerId");

-- AddForeignKey
ALTER TABLE "CookingSession" ADD CONSTRAINT "CookingSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSession" ADD CONSTRAINT "CookingSession_dishId_dishVersionId_fkey" FOREIGN KEY ("dishId", "dishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionUnit" ADD CONSTRAINT "CookingSessionUnit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CookingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionChecklistItem" ADD CONSTRAINT "CookingSessionChecklistItem_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "CookingSessionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timer" ADD CONSTRAINT "Timer_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "CookingSessionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReview" ADD CONSTRAINT "SessionReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CookingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CookingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_dishId_dishVersionId_fkey" FOREIGN KEY ("dishId", "dishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_tasterId_fkey" FOREIGN KEY ("tasterId") REFERENCES "Taster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taster" ADD CONSTRAINT "Taster_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Hand-added raw SQL, per docs/PRISMA_SCHEMA_PROPOSAL.md §4 (Migration 2).
-- ============================================================================

ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_value_range"
  CHECK ("value" >= 1 AND "value" <= 5);

-- Round-3 Correction 4 — Rating's nullable Dish/Version pair must be both-null or
-- both-non-null; the composite FK's MATCH SIMPLE behavior alone would silently accept a
-- half-null row (e.g., dishId set, dishVersionId null), which this closes:
ALTER TABLE "Rating"
  ADD CONSTRAINT "rating_dish_pair_consistency"
  CHECK (
    ("dishId" IS NULL AND "dishVersionId" IS NULL)
    OR
    ("dishId" IS NOT NULL AND "dishVersionId" IS NOT NULL)
  );

CREATE UNIQUE INDEX "one_owner_taster_per_user"
  ON "Taster" ("ownerId")
  WHERE "isOwner" = true;

CREATE UNIQUE INDEX "one_active_session_per_dish"
  ON "CookingSession" ("dishId")
  WHERE "state" = 'IN_PROGRESS';
