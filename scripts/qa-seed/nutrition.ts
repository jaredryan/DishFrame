import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { PartFixtureIds, Services } from "./parts";
import type { RecipeFixtureIds } from "./recipes";

/**
 * Nutrition (Slice 13, PRODUCT_SPEC.md §54) is Version-scoped but mutable
 * metadata — editing it alone updates the current Version in place and
 * never creates a new one (`docs/SLICE_13.md`'s metadata-classification
 * correction). Every call below therefore loads the dish's own current
 * content unchanged and merges in only the nutrition fields, then calls
 * `editDish` with `versionChoice: undefined` — the same "metadata-only
 * edit stays on the same Version" pattern `ramen.ts`'s cuisine-only step
 * already established.
 */
async function loadCurrentContent(
  getVersionContent: Services["getVersionContent"],
  dishId: string,
): Promise<{
  versionId: string;
  base: DishContentInput;
  kind: "RECIPE" | "PART";
}> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  const versionId = dish.currentVersionId!;
  const version = await getVersionContent(versionId);
  const { sections, partLinks } = versionContentToInput(
    version.sections,
    version.partLinks,
  );
  return {
    versionId,
    kind: dish.kind,
    base: {
      title: dish.currentTitle ?? version.title,
      stage: dish.stage,
      cuisine: dish.cuisine,
      description: version.description,
      yieldQuantity: decimalToNumber(version.yieldQuantity),
      yieldUnit: version.yieldUnit,
      prepTimeMinutes: version.prepTimeMinutes,
      cookTimeMinutes: version.cookTimeMinutes,
      difficulty: version.difficulty,
      imageAssetId: version.imageAssetId,
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      nutritionBasis: null,
      nutritionBasisQuantity: null,
      nutritionBasisUnit: null,
      moreNutrients: null,
      nutritionSourceProvider: null,
      nutritionSourceId: null,
      nutritionSourceName: null,
      sections,
      partLinks,
    },
  };
}

async function applyNutrition(
  { editDish, getVersionContent }: Services,
  ownerId: string,
  dishId: string,
  nutrition: Partial<DishContentInput>,
): Promise<void> {
  const { versionId, base, kind } = await loadCurrentContent(
    getVersionContent,
    dishId,
  );
  await editDish(
    ownerId,
    dishId,
    versionId,
    { ...base, ...nutrition },
    undefined,
    kind,
  );
}

/**
 * Six distinct nutrition states across the existing compact fixture set —
 * no dedicated nutrition-only Dishes added. "[QA] Steamed White Rice"
 * (Part) and "[QA] Simple Garden Salad" (Recipe) are left with no
 * nutrition at all (untouched by this module) as the "no nutrition"
 * baseline for each kind.
 */
export async function applyNutritionFixtures(
  services: Services,
  ownerId: string,
  parts: PartFixtureIds,
  recipes: RecipeFixtureIds,
): Promise<void> {
  // Fully manual, WHOLE basis, primary values only — no More nutrients, no
  // source attribution.
  await applyNutrition(services, ownerId, parts.seasoning.dishId, {
    calories: 15,
    protein: 0.5,
    carbs: 3,
    fat: 0.3,
    nutritionBasis: "WHOLE",
  });

  // Fully manual, PER_OUTPUT_UNIT basis (matches the Sauce's own "1 cup"
  // yield), primary values plus More nutrients.
  await applyNutrition(services, ownerId, parts.sauce.dishId, {
    calories: 380,
    protein: 14,
    carbs: 18,
    fat: 30,
    nutritionBasis: "PER_OUTPUT_UNIT",
    nutritionBasisQuantity: 1,
    nutritionBasisUnit: "cup",
    moreNutrients: [
      { key: "sodium", label: "Sodium", value: 890, unit: "mg" },
      { key: "sugar", label: "Sugar", value: 6, unit: "g" },
    ],
  });

  // Valid USDA FoodData Central attribution — a plain (non-branded)
  // Foundation-style food, WHOLE basis, primary values plus More nutrients.
  // Seeded directly and truthfully as representative fixture data (no live
  // USDA request made or implied) — a stand-in for the Slice 13 search
  // flow's applied result.
  await applyNutrition(services, ownerId, parts.replacement.dishId, {
    calories: 25,
    protein: 2,
    carbs: 5,
    fat: 0.3,
    nutritionBasis: "WHOLE",
    moreNutrients: [{ key: "fiber", label: "Fiber", value: 2, unit: "g" }],
    nutritionSourceProvider: "USDA_FDC",
    nutritionSourceId: "168409",
    nutritionSourceName: "Cauliflower, raw",
  });

  // Branded-food-style sourced nutrition — the representative post-
  // barcode-scan result (Slice 14 scanning itself is real-device-only and
  // deliberately not simulated here; this covers reviewing its outcome).
  await applyNutrition(services, ownerId, parts.deleteme.dishId, {
    calories: 90,
    protein: 1,
    carbs: 2,
    fat: 9,
    nutritionBasis: "PER_OUTPUT_UNIT",
    nutritionBasisQuantity: 1,
    nutritionBasisUnit: "tbsp",
    moreNutrients: [{ key: "sodium", label: "Sodium", value: 65, unit: "mg" }],
    nutritionSourceProvider: "USDA_FDC",
    nutritionSourceId: "0812345678901",
    nutritionSourceName: "Garlic, Roasted in Olive Oil, Deli Kitchen",
  });

  // Fully manual, WHOLE basis, primary plus More nutrients — explicitly
  // detached/no source attribution, distinct from Seasoning's simpler
  // primary-only manual case above.
  await applyNutrition(services, ownerId, recipes.stirfry.dishId, {
    calories: 410,
    protein: 28,
    carbs: 35,
    fat: 16,
    nutritionBasis: "WHOLE",
    moreNutrients: [
      { key: "sodium", label: "Sodium", value: 720, unit: "mg" },
      { key: "saturatedFat", label: "Saturated fat", value: 3, unit: "g" },
    ],
  });
}
