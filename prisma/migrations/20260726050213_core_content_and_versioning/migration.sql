-- CreateEnum
CREATE TYPE "DishKind" AS ENUM ('RECIPE', 'PART');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('IDEA', 'EXPERIMENTAL', 'PROVEN', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('NONE', 'DUPLICATE', 'ACCEPTED_SHARE', 'IMPORT');

-- CreateEnum
CREATE TYPE "NutritionBasis" AS ENUM ('WHOLE', 'PER_OUTPUT_UNIT');

-- CreateEnum
CREATE TYPE "PartLinkState" AS ENUM ('LIVE', 'MATERIALIZED');

-- CreateEnum
CREATE TYPE "MeasurementSystem" AS ENUM ('US', 'METRIC');

-- CreateEnum
CREATE TYPE "FractionOrDecimal" AS ENUM ('FRACTIONS', 'DECIMALS');

-- CreateEnum
CREATE TYPE "PrimaryRatingDisplay" AS ENUM ('GROUP_AVERAGE', 'YOUR_RATING');

-- CreateTable
CREATE TABLE "Dish" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "DishKind" NOT NULL,
    "currentVersionId" TEXT,
    "stage" "Stage" NOT NULL DEFAULT 'IDEA',
    "cuisine" TEXT,
    "archivedAt" TIMESTAMP(3),
    "defaultBatchQuantity" DECIMAL(12,3),
    "defaultBatchUnit" TEXT,
    "currentTitle" TEXT,
    "currentStructuralSearchText" TEXT,
    "sourceKind" "SourceKind" NOT NULL DEFAULT 'NONE',
    "sourceDishId" TEXT,
    "sourceDishVersionLabel" TEXT,
    "sourceTitle" TEXT,
    "sourceAggregateRating" DECIMAL(3,2),
    "sourceRatingCount" INTEGER,
    "sourceSessionCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishVersion" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "majorVersion" INTEGER NOT NULL,
    "minorVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageAssetId" TEXT,
    "yieldQuantity" DECIMAL(12,3),
    "yieldUnit" TEXT,
    "prepTimeMinutes" INTEGER,
    "cookTimeMinutes" INTEGER,
    "difficulty" TEXT,
    "calories" DECIMAL(10,2),
    "protein" DECIMAL(10,2),
    "carbs" DECIMAL(10,2),
    "fat" DECIMAL(10,2),
    "nutritionBasis" "NutritionBasis",
    "nutritionBasisQuantity" DECIMAL(12,3),
    "nutritionBasisUnit" TEXT,
    "moreNutrients" JSONB,
    "nutritionSourceProvider" TEXT,
    "nutritionSourceId" TEXT,
    "versionNote" TEXT,
    "sourceVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DishVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "dishVersionId" TEXT NOT NULL,
    "name" TEXT,
    "guidanceNote" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "dishVersionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(12,3),
    "quantityEnd" DECIMAL(12,3),
    "isApproximate" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT,
    "displayText" TEXT,
    "preparationNote" TEXT,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "originalImportedText" TEXT,
    "position" INTEGER NOT NULL,
    "substituteForIngredientId" TEXT,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instruction" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "dishVersionId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Instruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartLink" (
    "id" TEXT NOT NULL,
    "lineageId" TEXT NOT NULL,
    "containerVersionId" TEXT NOT NULL,
    "sectionId" TEXT,
    "linkState" "PartLinkState" NOT NULL DEFAULT 'LIVE',
    "position" INTEGER NOT NULL,
    "targetDishId" TEXT,
    "targetDishVersionId" TEXT,
    "materializedTitle" TEXT,
    "materializedVersionLabel" TEXT,
    "materializedContent" JSONB,

    CONSTRAINT "PartLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishTag" (
    "dishId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "DishTag_pkey" PRIMARY KEY ("dishId","tagId")
);

-- CreateTable
CREATE TABLE "FlavorProfileValue" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "FlavorProfileValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DishFlavorProfile" (
    "dishId" TEXT NOT NULL,
    "flavorProfileValueId" TEXT NOT NULL,

    CONSTRAINT "DishFlavorProfile_pkey" PRIMARY KEY ("dishId","flavorProfileValueId")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "measurementSystem" "MeasurementSystem" NOT NULL DEFAULT 'US',
    "fractionOrDecimal" "FractionOrDecimal" NOT NULL DEFAULT 'FRACTIONS',
    "primaryRatingDisplay" "PrimaryRatingDisplay" NOT NULL DEFAULT 'GROUP_AVERAGE',
    "timerSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reviewPromptEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onboardingState" JSONB,
    "defaultsInitializedAt" TIMESTAMP(3),

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
-- NOTE (Slice 2 follow-up): the "isFallback" column and its partial unique
-- index (one_fallback_category_per_user) are added later by Migration 3
-- (planning_and_grocery), which is where the fallback-category behavior
-- conceptually belongs, even though this table itself is created here.
CREATE TABLE "GroceryCategory" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "GroceryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreferredUnitOverride" (
    "id" TEXT NOT NULL,
    "dishId" TEXT NOT NULL,
    "ingredientLineageId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreferredUnitOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dish_currentVersionId_key" ON "Dish"("currentVersionId");

-- CreateIndex
CREATE INDEX "Dish_ownerId_kind_stage_idx" ON "Dish"("ownerId", "kind", "stage");

-- CreateIndex
CREATE INDEX "Dish_ownerId_kind_archivedAt_idx" ON "Dish"("ownerId", "kind", "archivedAt");

-- CreateIndex
CREATE INDEX "DishVersion_dishId_majorVersion_minorVersion_idx" ON "DishVersion"("dishId", "majorVersion" DESC, "minorVersion" DESC);

-- CreateIndex
CREATE INDEX "DishVersion_imageAssetId_idx" ON "DishVersion"("imageAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "DishVersion_dishId_majorVersion_minorVersion_key" ON "DishVersion"("dishId", "majorVersion", "minorVersion");

-- CreateIndex
CREATE UNIQUE INDEX "DishVersion_dishId_id_key" ON "DishVersion"("dishId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ImageAsset_storageKey_key" ON "ImageAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ImageAsset_uploadedByUserId_idx" ON "ImageAsset"("uploadedByUserId");

-- CreateIndex
CREATE INDEX "Section_dishVersionId_idx" ON "Section"("dishVersionId");

-- CreateIndex
CREATE INDEX "Section_lineageId_idx" ON "Section"("lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_dishVersionId_id_key" ON "Section"("dishVersionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Section_dishVersionId_lineageId_key" ON "Section"("dishVersionId", "lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_substituteForIngredientId_key" ON "Ingredient"("substituteForIngredientId");

-- CreateIndex
CREATE INDEX "Ingredient_sectionId_idx" ON "Ingredient"("sectionId");

-- CreateIndex
CREATE INDEX "Ingredient_lineageId_idx" ON "Ingredient"("lineageId");

-- CreateIndex
CREATE INDEX "Ingredient_dishVersionId_idx" ON "Ingredient"("dishVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_dishVersionId_lineageId_key" ON "Ingredient"("dishVersionId", "lineageId");

-- CreateIndex
CREATE INDEX "Instruction_sectionId_idx" ON "Instruction"("sectionId");

-- CreateIndex
CREATE INDEX "Instruction_lineageId_idx" ON "Instruction"("lineageId");

-- CreateIndex
CREATE INDEX "Instruction_dishVersionId_idx" ON "Instruction"("dishVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Instruction_dishVersionId_lineageId_key" ON "Instruction"("dishVersionId", "lineageId");

-- CreateIndex
CREATE INDEX "PartLink_lineageId_idx" ON "PartLink"("lineageId");

-- CreateIndex
CREATE INDEX "PartLink_containerVersionId_idx" ON "PartLink"("containerVersionId");

-- CreateIndex
CREATE INDEX "PartLink_sectionId_idx" ON "PartLink"("sectionId");

-- CreateIndex
CREATE INDEX "PartLink_targetDishId_idx" ON "PartLink"("targetDishId");

-- CreateIndex
CREATE INDEX "PartLink_targetDishVersionId_idx" ON "PartLink"("targetDishVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "PartLink_containerVersionId_lineageId_key" ON "PartLink"("containerVersionId", "lineageId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_ownerId_normalizedName_key" ON "Tag"("ownerId", "normalizedName");

-- CreateIndex
CREATE INDEX "DishTag_tagId_idx" ON "DishTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "FlavorProfileValue_ownerId_normalizedName_key" ON "FlavorProfileValue"("ownerId", "normalizedName");

-- CreateIndex
CREATE INDEX "DishFlavorProfile_flavorProfileValueId_idx" ON "DishFlavorProfile"("flavorProfileValueId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryCategory_ownerId_normalizedName_key" ON "GroceryCategory"("ownerId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "PreferredUnitOverride_dishId_ingredientLineageId_key" ON "PreferredUnitOverride"("dishId", "ingredientLineageId");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DishVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_sourceDishId_fkey" FOREIGN KEY ("sourceDishId") REFERENCES "Dish"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishVersion" ADD CONSTRAINT "DishVersion_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishVersion" ADD CONSTRAINT "DishVersion_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "DishVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishVersion" ADD CONSTRAINT "DishVersion_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_dishVersionId_fkey" FOREIGN KEY ("dishVersionId") REFERENCES "DishVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_substituteForIngredientId_fkey" FOREIGN KEY ("substituteForIngredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instruction" ADD CONSTRAINT "Instruction_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLink" ADD CONSTRAINT "PartLink_containerVersionId_fkey" FOREIGN KEY ("containerVersionId") REFERENCES "DishVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartLink" ADD CONSTRAINT "PartLink_targetDishId_targetDishVersionId_fkey" FOREIGN KEY ("targetDishId", "targetDishVersionId") REFERENCES "DishVersion"("dishId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTag" ADD CONSTRAINT "DishTag_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishTag" ADD CONSTRAINT "DishTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlavorProfileValue" ADD CONSTRAINT "FlavorProfileValue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishFlavorProfile" ADD CONSTRAINT "DishFlavorProfile_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DishFlavorProfile" ADD CONSTRAINT "DishFlavorProfile_flavorProfileValueId_fkey" FOREIGN KEY ("flavorProfileValueId") REFERENCES "FlavorProfileValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryCategory" ADD CONSTRAINT "GroceryCategory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreferredUnitOverride" ADD CONSTRAINT "PreferredUnitOverride_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "Dish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Hand-added raw SQL, per docs/PRISMA_SCHEMA_PROPOSAL.md §4 (Migration 1).
-- Not expressible in Prisma Schema Language — see §1 of that document for why.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "dish_current_title_trgm_idx"
  ON "Dish" USING GIN ("currentTitle" gin_trgm_ops);

CREATE INDEX "dish_current_structural_search_text_trgm_idx"
  ON "Dish" USING GIN ("currentStructuralSearchText" gin_trgm_ops);

-- Round-3 Correction 6 — cuisine is searched live (not denormalized), so it gets its own
-- trigram index directly on the column, same tolerant partial-word matching as the others:
CREATE INDEX "dish_cuisine_trgm_idx"
  ON "Dish" USING GIN ("cuisine" gin_trgm_ops);

ALTER TABLE "PartLink"
  ADD CONSTRAINT "part_link_state_consistency"
  CHECK (
    (
      "linkState" = 'LIVE'
      AND "targetDishId" IS NOT NULL
      AND "targetDishVersionId" IS NOT NULL
      AND "materializedTitle" IS NULL
      AND "materializedVersionLabel" IS NULL
      AND "materializedContent" IS NULL
    )
    OR
    (
      "linkState" = 'MATERIALIZED'
      AND "targetDishId" IS NULL
      AND "targetDishVersionId" IS NULL
      AND "materializedTitle" IS NOT NULL
      AND "materializedVersionLabel" IS NOT NULL
      AND "materializedContent" IS NOT NULL
    )
  );

-- Round-3 Correction 3 — PartLink container consistency: a PartLink's sectionId, when
-- present, must belong to a Section that itself belongs to the same containerVersionId.
-- Added as a raw composite FK rather than a second Prisma relation (§1). MATCH SIMPLE
-- (Postgres default) means this is vacuously satisfied for top-level links (sectionId NULL).
ALTER TABLE "PartLink"
  ADD CONSTRAINT "part_link_section_container_consistency"
  FOREIGN KEY ("containerVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

-- Round-3 Correction 8 — same container-consistency pattern for Ingredient and Instruction,
-- whose denormalized dishVersionId must match their own Section's actual dishVersionId.
-- Both columns are required (never null) on these tables, so these FKs always apply:
ALTER TABLE "Ingredient"
  ADD CONSTRAINT "ingredient_section_version_consistency"
  FOREIGN KEY ("dishVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

ALTER TABLE "Instruction"
  ADD CONSTRAINT "instruction_section_version_consistency"
  FOREIGN KEY ("dishVersionId", "sectionId")
  REFERENCES "Section" ("dishVersionId", "id");

-- Approved and unchanged from prior passes:
ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_archived_state_consistency"
  CHECK (
    ("stage" = 'ARCHIVED' AND "archivedAt" IS NOT NULL)
    OR
    ("stage" != 'ARCHIVED' AND "archivedAt" IS NULL)
  );

-- Round-3 Correction 5 — Dish.currentVersionId, when set, must belong to THIS Dish, not
-- merely reference any existing DishVersion row. Dish.id already participates in every
-- other relation pointing at Dish, so this cannot be modeled as a second Prisma relation
-- (§1) — added as a raw composite FK instead. MATCH SIMPLE means this is vacuously
-- satisfied whenever currentVersionId is NULL (e.g., transiently, before a Dish's first
-- Version is linked inside the creation transaction).
ALTER TABLE "Dish"
  ADD CONSTRAINT "dish_current_version_ownership"
  FOREIGN KEY ("id", "currentVersionId")
  REFERENCES "DishVersion" ("dishId", "id");

CREATE UNIQUE INDEX "one_favorite_tag_per_user"
  ON "Tag" ("ownerId")
  WHERE "isFavorite" = true;

-- Round-3 Correction 9 — nutrition basis field consistency:
ALTER TABLE "DishVersion"
  ADD CONSTRAINT "nutrition_basis_consistency"
  CHECK (
    ("nutritionBasis" IS NULL)
    OR
    (
      "nutritionBasis" = 'WHOLE'
      AND "nutritionBasisQuantity" IS NULL
      AND "nutritionBasisUnit" IS NULL
    )
    OR
    (
      "nutritionBasis" = 'PER_OUTPUT_UNIT'
      AND "nutritionBasisQuantity" IS NOT NULL
      AND "nutritionBasisUnit" IS NOT NULL
      AND "nutritionBasisQuantity" > 0
    )
  );
