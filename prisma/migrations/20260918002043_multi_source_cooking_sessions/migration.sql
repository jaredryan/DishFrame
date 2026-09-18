-- ============================================================================
-- Hand-added raw SQL, per docs/PRISMA_SCHEMA_PROPOSAL.md §4 pattern (same
-- issue as every prior migration touching these objects, e.g.
-- 20260731173746_cooking_session_part_usage): the shadow-database diff has
-- no record of raw SQL added by hand in prior migrations and proposed
-- spurious DROP statements for dish_current_version_ownership,
-- ingredient_section_version_consistency, instruction_section_version_
-- consistency, part_link_section_container_consistency, and the two dish
-- trigram indexes. Removed entirely — nothing here actually drops any
-- protected object; scripts/scan-migrations.ts and
-- scripts/verify-db-objects.ts both confirm this.
-- ============================================================================

-- CreateTable
CREATE TABLE "CookingSessionSource" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "dishId" TEXT NOT NULL,
    "dishVersionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scaleFactor" DECIMAL(8,4),
    "originalScaleFactor" DECIMAL(8,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookingSessionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingSessionUnitContribution" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceUnitKey" TEXT NOT NULL,
    "multiplier" DECIMAL(8,4),
    "contributionQuantity" DECIMAL(12,3),
    "contributionUnit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CookingSessionUnitContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CookingSessionSourceReview" (
    "sourceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "whatWentWell" TEXT,
    "whatDidNotGoWell" TEXT,
    "anythingElse" TEXT,
    "actualAmountQuantity" DECIMAL(12,3),
    "actualAmountUnit" TEXT,
    "reviewAdjustedDurationSeconds" INTEGER,
    "includedUnitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CookingSessionSourceReview_pkey" PRIMARY KEY ("sourceId")
);

-- CreateIndex
CREATE INDEX "CookingSessionSource_sessionId_position_idx" ON "CookingSessionSource"("sessionId", "position");

-- CreateIndex
CREATE INDEX "CookingSessionSource_dishId_idx" ON "CookingSessionSource"("dishId");

-- CreateIndex
CREATE INDEX "CookingSessionUnitContribution_sourceId_sourceUnitKey_idx" ON "CookingSessionUnitContribution"("sourceId", "sourceUnitKey");

-- CreateIndex
CREATE UNIQUE INDEX "CookingSessionUnitContribution_unitId_sourceId_key" ON "CookingSessionUnitContribution"("unitId", "sourceId");

-- CreateIndex
CREATE INDEX "CookingSessionSourceReview_sessionId_idx" ON "CookingSessionSourceReview"("sessionId");

-- AddForeignKey
ALTER TABLE "CookingSessionSource" ADD CONSTRAINT "CookingSessionSource_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CookingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionSource" ADD CONSTRAINT "CookingSessionSource_dishId_dishVersionId_fkey" FOREIGN KEY ("dishId", "dishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionUnitContribution" ADD CONSTRAINT "CookingSessionUnitContribution_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "CookingSessionUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionUnitContribution" ADD CONSTRAINT "CookingSessionUnitContribution_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CookingSessionSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionSourceReview" ADD CONSTRAINT "CookingSessionSourceReview_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CookingSessionSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CookingSessionSourceReview" ADD CONSTRAINT "CookingSessionSourceReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CookingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Multi-source Cooking Sessions (owner spec, 2026-09-17) — partial unique
-- index + backfill, hand-authored per docs/PRISMA_SCHEMA_PROPOSAL.md §4.
--
-- Postgres can't express a partial unique index filtered on a *joined*
-- table's column, so "one active session per source dish" is enforced
-- directly on CookingSessionSource's own denormalized `isActive` mirror —
-- the multi-source generalization of the pre-existing
-- `one_active_session_per_dish` index on CookingSession.dishId (kept below,
-- unchanged: still valid, if now redundant, for a source's own dish since
-- every source is also a row here).
-- ============================================================================

CREATE UNIQUE INDEX "one_active_session_per_dish_source"
  ON "CookingSessionSource" ("dishId")
  WHERE "isActive" = true;

-- Backfill: every existing CookingSession becomes a one-source session —
-- one CookingSessionSource row (position 0) mirroring its own
-- dishId/dishVersionId/scaleFactor/originalScaleFactor, isActive following
-- the session's current state (never true for an already-ended session, so
-- the new partial index above can never fire against historical data).
INSERT INTO "CookingSessionSource"
  ("id", "sessionId", "position", "dishId", "dishVersionId", "isActive", "scaleFactor", "originalScaleFactor", "createdAt")
SELECT
  gen_random_uuid()::text,
  "id",
  0,
  "dishId",
  "dishVersionId",
  ("state" = 'IN_PROGRESS'),
  "scaleFactor",
  "originalScaleFactor",
  "createdAt"
FROM "CookingSession";

-- Backfill: every existing CookingSessionUnit gets exactly one
-- CookingSessionUnitContribution row, attributing it wholly to the one
-- source just created above for its own session — `sourceUnitKey` mirrors
-- `sessionUnitKey()` (lib/cooking/queries.ts) exactly, and `multiplier`
-- carries the unit's own pre-existing per-unit scale forward unchanged, so
-- no historical unit's effective scale computation changes.
INSERT INTO "CookingSessionUnitContribution"
  ("id", "unitId", "sourceId", "sourceUnitKey", "multiplier")
SELECT
  gen_random_uuid()::text,
  u."id",
  s."id",
  CASE
    WHEN u."sourceSectionLineageId" IS NOT NULL
      THEN 'section:' || u."sourceSectionLineageId"
    ELSE 'part:' || u."sourcePartLinkLineageId"
  END,
  u."scaleFactor"
FROM "CookingSessionUnit" u
JOIN "CookingSessionSource" s ON s."sessionId" = u."sessionId" AND s."position" = 0;
