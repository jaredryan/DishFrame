import { prisma } from "@/lib/db/prisma";
import {
  setDishTags,
  setDishFlavorProfiles,
  toggleFavorite,
} from "@/lib/dishes/dish-metadata";
import { versionContentToInput } from "@/lib/dishes/mappers";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { PartFixtureIds, Services } from "./parts";
import type { RecipeFixtureIds } from "./recipes";

async function loadContent(
  getVersionContent: Services["getVersionContent"],
  versionId: string,
) {
  const version = await getVersionContent(versionId);
  return versionContentToInput(version.sections, version.partLinks);
}

async function currentVersionIdOf(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  return dish.currentVersionId!;
}

export type ExtraLibraryMetadata = {
  tagIds: { quick: string; mealPrep: string };
  flavorIds: { spicy: string; savory: string; umami: string; citrusy: string };
};

async function ensureTag(ownerId: string, displayName: string) {
  const normalizedName = displayName.toLowerCase();
  const tag = await prisma.tag.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: { ownerId, normalizedName, displayName, isFavorite: false },
  });
  return tag.id;
}

async function ensureFlavorProfile(
  ownerId: string,
  displayName: string,
  position: number,
) {
  const normalizedName = displayName.toLowerCase();
  const value = await prisma.flavorProfileValue.upsert({
    where: { ownerId_normalizedName: { ownerId, normalizedName } },
    update: {},
    create: { ownerId, normalizedName, displayName, position },
  });
  return value.id;
}

/**
 * A parent-specific PartLink multiplier change (Rice Bowl Base's Seasoning
 * link) would be `cookingChanged`, so instead this attaches a substitute to
 * a plain Ingredient — Weeknight Stir-Fry's "Bell pepper" — the one
 * grocery-list-visible way to get a real, non-fabricated "original vs.
 * selected-substitute" pair into the seeded grocery lists (Slice 12,
 * PRODUCT_SPEC.md §60.3/§62.2). `ingredientContentSignature` includes
 * `substitute`, so this is a genuine cooking-content change — auto-MINOR,
 * giving Stir-Fry a second historical Version as a side benefit (major/
 * minor Version-history diversity for a Recipe, not just the existing
 * Parts).
 */
async function addStirFrySubstitute(
  { editDish, getVersionContent }: Services,
  ownerId: string,
  recipes: RecipeFixtureIds,
): Promise<void> {
  const versionId = await currentVersionIdOf(recipes.stirfry.dishId);
  const loaded = await loadContent(getVersionContent, versionId);
  const prepSection = loaded.sections.find(
    (s) => s.name === "Prepare vegetables",
  )!;
  const content: DishContentInput = {
    title: "[QA] Weeknight Stir-Fry",
    stage: "ACTIVE",
    cuisine: "Asian Fusion",
    description: "A weeknight stir-fry built around rice and peanut sauce.",
    yieldQuantity: 4,
    yieldUnit: "servings",
    prepTimeMinutes: 15,
    cookTimeMinutes: 15,
    difficulty: "Moderate",
    imageAssetId: null,
    sections: loaded.sections.map((section) =>
      section.lineageId === prepSection.lineageId
        ? {
            ...section,
            ingredients: section.ingredients.map((ingredient) =>
              ingredient.name === "Bell pepper"
                ? {
                    ...ingredient,
                    substitute: {
                      name: "Poblano pepper",
                      quantity: 1,
                      quantityEnd: null,
                      isApproximate: false,
                      unit: "each",
                      displayText: null,
                      preparationNote: null,
                    },
                  }
                : ingredient,
            ),
          }
        : section,
    ),
    partLinks: loaded.partLinks,
  };
  await editDish(
    ownerId,
    recipes.stirfry.dishId,
    versionId,
    content,
    "MINOR",
    "RECIPE",
  );
}

/**
 * Search/filter/sort diversity (PRODUCT_SPEC.md §43-50/§79): two extra Tags
 * and four Flavor profiles, attached variably across the existing compact
 * fixture set rather than duplicating it, plus Favorite toggles chosen to
 * demonstrate SLICE_15's settled recommendation rule directly — an
 * Experimental Favorite (Rice Side Dish) must never outrank a plain Active
 * Recipe when a reviewer runs "Get recommendations."
 */
export async function applyDishMetadata(
  services: Services,
  ownerId: string,
  parts: PartFixtureIds,
  recipes: RecipeFixtureIds,
): Promise<ExtraLibraryMetadata> {
  await addStirFrySubstitute(services, ownerId, recipes);

  const tagIds = {
    quick: await ensureTag(ownerId, "[QA] Quick"),
    mealPrep: await ensureTag(ownerId, "[QA] Meal Prep"),
  };
  const flavorIds = {
    spicy: await ensureFlavorProfile(ownerId, "[QA] Spicy", 0),
    savory: await ensureFlavorProfile(ownerId, "[QA] Savory", 1),
    umami: await ensureFlavorProfile(ownerId, "[QA] Umami", 2),
    citrusy: await ensureFlavorProfile(ownerId, "[QA] Citrusy", 3),
  };

  await setDishTags(ownerId, recipes.ricebowl.dishId, "RECIPE", [tagIds.quick]);
  await setDishTags(ownerId, recipes.noodlesalad.dishId, "RECIPE", [
    tagIds.quick,
  ]);
  await setDishTags(ownerId, recipes.stirfry.dishId, "RECIPE", [
    tagIds.mealPrep,
  ]);

  await setDishFlavorProfiles(ownerId, recipes.stirfry.dishId, "RECIPE", [
    flavorIds.savory,
  ]);
  await setDishFlavorProfiles(ownerId, recipes.noodlesalad.dishId, "RECIPE", [
    flavorIds.savory,
    flavorIds.citrusy,
  ]);
  await setDishFlavorProfiles(ownerId, parts.sauce.dishId, "PART", [
    flavorIds.umami,
    flavorIds.spicy,
  ]);

  // §80.3's own worked example — an Experimental Favorite must not outrank
  // a plain Active Recipe: Rice Side Dish is EXPERIMENTAL + Favorite,
  // Weeknight Stir-Fry is ACTIVE + not Favorite.
  await toggleFavorite(ownerId, recipes.ricesidedish.dishId, "RECIPE");
  await toggleFavorite(ownerId, recipes.noodlesalad.dishId, "RECIPE");
  await toggleFavorite(ownerId, parts.replacement.dishId, "PART");

  return { tagIds, flavorIds };
}

/**
 * A second, small pass for "[QA] Sunday Ramen Project" — built later in
 * `seed.ts` (after `buildRamenFixture`), so its Favorite/Tag/Flavor-profile
 * attachment can't happen inside `applyDishMetadata` above.
 */
export async function applyRamenMetadata(
  ownerId: string,
  meta: ExtraLibraryMetadata,
  ramenDishId: string,
): Promise<void> {
  await setDishTags(ownerId, ramenDishId, "RECIPE", [meta.tagIds.mealPrep]);
  await setDishFlavorProfiles(ownerId, ramenDishId, "RECIPE", [
    meta.flavorIds.umami,
    meta.flavorIds.savory,
  ]);
  await toggleFavorite(ownerId, ramenDishId, "RECIPE");
}
