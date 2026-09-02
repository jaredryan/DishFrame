-- Cuisine redesign (owner decision, 2026-09-02 — supersedes the former
-- PRODUCT_SPEC.md §46 "one primary, free-text Cuisine" design): Cuisine
-- becomes a normalized, user-owned classification — same shape as
-- FlavorProfileValue/DishFlavorProfile — so a Recipe/Part can carry zero,
-- one, or several Cuisines instead of one free-text string. Create-only per
-- AGENTS.md "Database migrations": not applied, no database verification
-- run, by this pass.
--
-- Review carefully before applying — this DROPs "Dish"."cuisine" only after
-- backfilling every non-empty value into the new Cuisine/DishCuisine
-- relationship below, deduplicated per owner by normalized name
-- (LOWER(TRIM(...)), matching src/lib/account/defaults.ts's normalizeName).

-- CreateTable
CREATE TABLE "Cuisine" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Cuisine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishCuisine" (
    "dishId" TEXT NOT NULL,
    "cuisineId" TEXT NOT NULL,

    CONSTRAINT "DishCuisine_pkey" PRIMARY KEY ("dishId","cuisineId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cuisine_ownerId_normalizedName_key" ON "Cuisine"("ownerId", "normalizedName");

-- CreateIndex
CREATE INDEX "DishCuisine_cuisineId_idx" ON "DishCuisine"("cuisineId");

-- AddForeignKey
ALTER TABLE "Cuisine" ADD CONSTRAINT "Cuisine_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishCuisine" ADD CONSTRAINT "DishCuisine_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishCuisine" ADD CONSTRAINT "DishCuisine_cuisineId_fkey" FOREIGN KEY ("cuisineId") REFERENCES "Cuisine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one Cuisine row per (ownerId, normalized cuisine text), position
-- assigned in first-seen order per owner.
INSERT INTO "Cuisine" ("id", "ownerId", "normalizedName", "displayName", "position")
SELECT
    gen_random_uuid()::text,
    "ownerId",
    "normalizedName",
    "displayName",
    ROW_NUMBER() OVER (PARTITION BY "ownerId" ORDER BY "normalizedName" ASC) - 1
FROM (
    SELECT DISTINCT ON ("ownerId", LOWER(TRIM("cuisine")))
        "ownerId",
        LOWER(TRIM("cuisine")) AS "normalizedName",
        TRIM("cuisine") AS "displayName"
    FROM "Dish"
    WHERE "cuisine" IS NOT NULL AND TRIM("cuisine") <> ''
    ORDER BY "ownerId", LOWER(TRIM("cuisine")), "createdAt" ASC
) AS distinct_values;

-- Backfill: attach each existing Dish to its backfilled Cuisine row.
INSERT INTO "DishCuisine" ("dishId", "cuisineId")
SELECT "Dish"."id", "Cuisine"."id"
FROM "Dish"
JOIN "Cuisine"
  ON "Cuisine"."ownerId" = "Dish"."ownerId"
 AND "Cuisine"."normalizedName" = LOWER(TRIM("Dish"."cuisine"))
WHERE "Dish"."cuisine" IS NOT NULL AND TRIM("Dish"."cuisine") <> '';

-- AlterTable: the old free-text field is fully superseded by the relation
-- above — every read/write/editor/filter/search/suggestion path is migrated
-- in this same pass (see docs/SLICE_*.md handoff for the file list).
ALTER TABLE "Dish" DROP COLUMN "cuisine";
