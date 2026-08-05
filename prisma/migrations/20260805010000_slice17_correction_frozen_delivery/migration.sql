-- Slice 17 correction pass.

-- 1. Genuinely frozen direct delivery: the complete shareable content graph
-- captured once at Send time (schema.prisma's own doc comment on
-- `DirectShare` has the full rationale) — Accept/Preview consume this
-- instead of re-reading `dishId`/`dishVersionId` live, which DishFrame
-- permits editing in place without a new Version.
ALTER TABLE "DirectShare" ADD COLUMN     "frozenGraph" JSONB,
ADD COLUMN     "frozenImageAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 2. Database-enforced "at most one PENDING delivery per
-- sender/recipient/stable source Dish" — closes the concurrent-double-send
-- race the prior application-only pre-check could not. Scoped to `dishId`
-- (the stable source), not `dishVersionId`, so an in-place edit or a new
-- Version on the source does not open a second pending slot. Prisma cannot
-- express a partial unique index directly (docs/PRISMA_SCHEMA_PROPOSAL.md
-- §4) — hand-authored here, same pattern as `one_active_session_per_dish`.
CREATE UNIQUE INDEX "one_pending_direct_share_per_sender_recipient_dish"
  ON "DirectShare" ("senderId", "recipientId", "dishId")
  WHERE "status" = 'PENDING' AND "dishId" IS NOT NULL;
