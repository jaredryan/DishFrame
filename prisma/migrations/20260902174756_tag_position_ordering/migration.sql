-- Settings QA pass: persistent user-controlled ordering for Tags, matching
-- FlavorProfileValue.position/GroceryCategory.position (docs/PRODUCT_SPEC.md
-- §45.8, AGENTS.md "Database migrations" — smallest appropriate change,
-- create-only, not applied by this pass).

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- Backfill: preserve each owner's current display order (the existing
-- `orderBy: [{ isFavorite: "desc" }, { displayName: "asc" }]` in
-- src/lib/tags/queries.ts) as the initial position, rather than leaving
-- every row at the same default and letting insertion order decide it.
WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "ownerId"
      ORDER BY "isFavorite" DESC, "displayName" ASC
    ) - 1 AS "newPosition"
  FROM "Tag"
)
UPDATE "Tag"
SET "position" = ordered."newPosition"
FROM ordered
WHERE "Tag"."id" = ordered."id";
