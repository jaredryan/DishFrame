-- Adds Taster.position (drag-and-drop display order in Settings, same
-- pattern as GroceryCategory.position). This migration was hand-edited:
-- the raw generated output included spurious `DROP CONSTRAINT`/`DROP
-- INDEX` statements for composite-FK/trigram-index objects this repo
-- manages via raw SQL, which the shadow-database diff does not recognize
-- as already present — see AGENTS.md "Database migrations" for why this
-- is a known trap with partial-schema-diff generation. Those statements
-- were removed; only the genuine Taster change remains, plus a backfill
-- for the 5 existing local rows a plain `NOT NULL` add cannot satisfy.

-- AlterTable: add as nullable first — existing rows need a backfilled
-- value before this can become NOT NULL.
ALTER TABLE "Taster" ADD COLUMN "position" INTEGER;

-- Backfill: preserve each owner's previous *implicit* display order
-- (isOwner desc so "You" sorted first, then archivedAt asc nulls first,
-- then createdAt asc — the exact ORDER BY listTasters() used before this
-- migration) as explicit, independently-reorderable positions.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "ownerId"
    ORDER BY "isOwner" DESC, "archivedAt" ASC NULLS FIRST, "createdAt" ASC
  ) - 1 AS "rn"
  FROM "Taster"
)
UPDATE "Taster"
SET "position" = "ranked"."rn"
FROM "ranked"
WHERE "Taster"."id" = "ranked"."id";

-- Now safe to enforce NOT NULL.
ALTER TABLE "Taster" ALTER COLUMN "position" SET NOT NULL;
