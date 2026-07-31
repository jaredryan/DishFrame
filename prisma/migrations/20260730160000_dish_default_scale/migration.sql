-- Slice 6A design-remediation pass: replaces Dish.defaultBatchQuantity/
-- defaultBatchUnit (a separately-authored desired output quantity/unit —
-- the rejected "default serving size" concept) with Dish.defaultScale, a
-- single positive multiplier applied to the authored Version yield ("default
-- scale"). Existing values are migrated to an equivalent multiplier
-- wherever safely derivable (a positive authored yield on the Dish's
-- current Version, in a matching unit); otherwise dropped, which falls
-- back to no saved preference (1x).
--
-- Hand-authored, following this repo's established pattern
-- (20260727060000_part_link_multiplier/migration.sql) rather than trusting
-- a raw `prisma migrate dev --create-only` diff unattended — see
-- AGENTS.md's "Database migrations" section and docs/SLICE_2.md §5.2's
-- shadow-diff trap for hand-managed raw-SQL objects. Before applying
-- against any database that matters, confirm this matches what
-- `prisma migrate dev --create-only` proposes for the same schema change
-- (watching for spurious DROP CONSTRAINT/DROP INDEX statements against
-- unrelated raw-SQL-managed objects, which is the known trap).

ALTER TABLE "Dish" ADD COLUMN "defaultScale" DECIMAL(8,4);

UPDATE "Dish" d
SET "defaultScale" = ROUND(d."defaultBatchQuantity" / v."yieldQuantity", 4)
FROM "DishVersion" v
WHERE v.id = d."currentVersionId"
  AND d."defaultBatchQuantity" IS NOT NULL
  AND v."yieldQuantity" IS NOT NULL
  AND v."yieldQuantity" > 0
  AND (
    d."defaultBatchUnit" IS NULL
    OR v."yieldUnit" IS NULL
    OR d."defaultBatchUnit" = v."yieldUnit"
  );

ALTER TABLE "Dish" DROP COLUMN "defaultBatchQuantity";
ALTER TABLE "Dish" DROP COLUMN "defaultBatchUnit";

ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_default_scale_positive"
  CHECK ("defaultScale" IS NULL OR "defaultScale" > 0);
