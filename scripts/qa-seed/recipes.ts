import { prisma } from "@/lib/db/prisma";
import type {
  createDish as CreateDish,
  archiveDish as ArchiveDish,
} from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { PartFixtureIds } from "./parts";
import { section } from "./parts";
import { attachSeedTag } from "./owner";

async function currentVersionIdOf(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  return dish.currentVersionId!;
}

export type Services = {
  createDish: typeof CreateDish;
  archiveDish: typeof ArchiveDish;
};

export type RecipeFixtureVersions = {
  dishId: string;
  currentVersionId: string;
};

export type RecipeFixtureIds = {
  salad: RecipeFixtureVersions;
  ricebowl: RecipeFixtureVersions;
  stirfry: RecipeFixtureVersions;
  noodlesalad: RecipeFixtureVersions;
  ricesidedish: RecipeFixtureVersions;
};

export async function buildRecipeFixtures(
  { createDish, archiveDish }: Services,
  ownerId: string,
  tagId: string,
  parts: PartFixtureIds,
): Promise<RecipeFixtureIds> {
  // --- Sections-only: Simple Garden Salad ---------------------------------
  const saladContent: DishContentInput = {
    title: "[QA] Simple Garden Salad",
    stage: "ACTIVE",
    cuisine: "Mediterranean",
    description: "A light side salad with a simple vinaigrette.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 10,
    cookTimeMinutes: 0,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        position: 0,
        name: "Salad",
        ingredients: [
          {
            name: "Mixed greens",
            quantity: 4,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Cherry tomatoes",
            quantity: 1,
            unit: "cup",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Cucumber",
            quantity: 0.5,
            unit: "cup",
            isApproximate: false,
            isOptional: true,
          },
        ],
        instructions: [{ text: "Combine greens, tomatoes, and cucumber in a bowl." }],
      }),
      section({
        position: 1,
        name: "Dressing",
        ingredients: [
          {
            name: "Olive oil",
            quantity: 3,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Red wine vinegar",
            quantity: 1,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [
          { text: "Whisk dressing ingredients together and toss with the salad." },
        ],
      }),
    ],
    partLinks: [],
  };
  const saladDishId = await createDish(ownerId, "RECIPE", saladContent);
  await attachSeedTag(saladDishId, tagId);
  await archiveDish(ownerId, saladDishId, "RECIPE");

  // --- Parts-only: Rice Bowl Base (already-current Rice parent) ----------
  const ricebowlContent: DishContentInput = {
    title: "[QA] Rice Bowl Base",
    stage: "ACTIVE",
    cuisine: null,
    description: "A simple bowl built from rice and seasoning.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 5,
    cookTimeMinutes: 0,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [],
    partLinks: [
      {
        targetDishId: parts.rice.dishId,
        targetDishVersionId: parts.rice.currentId,
        position: 0,
        multiplier: 1,
      },
      {
        targetDishId: parts.seasoning.dishId,
        targetDishVersionId: parts.seasoning.currentId,
        position: 1,
        multiplier: 2,
      },
    ],
  };
  const ricebowlDishId = await createDish(ownerId, "RECIPE", ricebowlContent);
  await attachSeedTag(ricebowlDishId, tagId);

  // --- Mixed-order: Weeknight Stir-Fry ------------------------------------
  const stirfryContent: DishContentInput = {
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
    sections: [
      section({
        position: 1,
        name: "Prepare vegetables",
        ingredients: [
          {
            name: "Bell pepper",
            quantity: 1,
            unit: "each",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Broccoli florets",
            quantity: 2,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Chop bell pepper and broccoli into bite-sized pieces." }],
      }),
      section({
        position: 2,
        name: "Cook protein",
        ingredients: [
          {
            name: "Chicken thigh",
            quantity: 1,
            unit: "lb",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Sear chicken over high heat until cooked through." }],
      }),
      section({
        position: 4,
        name: "Assemble",
        ingredients: [],
        instructions: [
          { text: "Combine vegetables, protein, rice, and sauce in the pan and toss to coat." },
        ],
      }),
    ],
    partLinks: [
      {
        targetDishId: parts.rice.dishId,
        targetDishVersionId: parts.rice.v1Id,
        position: 0,
        multiplier: 1,
      },
      {
        targetDishId: parts.sauce.dishId,
        targetDishVersionId: parts.sauce.currentId,
        position: 3,
        multiplier: 1.5,
      },
    ],
  };
  const stirfryDishId = await createDish(ownerId, "RECIPE", stirfryContent);
  await attachSeedTag(stirfryDishId, tagId);

  // --- Nested-Part: Peanut Noodle Salad (shallow-detach fixture) ---------
  const noodlesaladContent: DishContentInput = {
    title: "[QA] Peanut Noodle Salad",
    stage: "PROVEN",
    cuisine: "Southeast Asian",
    description: "Cold noodles tossed with peanut dipping sauce.",
    yieldQuantity: 3,
    yieldUnit: "servings",
    prepTimeMinutes: 15,
    cookTimeMinutes: 10,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        position: 1,
        name: "Noodles",
        ingredients: [
          {
            name: "Rice noodles",
            quantity: 8,
            unit: "oz",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [
          { text: "Cook noodles per package instructions, then rinse under cold water." },
        ],
      }),
    ],
    partLinks: [
      {
        targetDishId: parts.sauce.dishId,
        targetDishVersionId: parts.sauce.v1Id,
        position: 0,
        multiplier: 1,
      },
    ],
  };
  const noodlesaladDishId = await createDish(
    ownerId,
    "RECIPE",
    noodlesaladContent,
  );
  await attachSeedTag(noodlesaladDishId, tagId);

  // --- Propagation-test: Rice Side Dish (outdated on both Rice + Sauce) --
  const ricesidedishContent: DishContentInput = {
    title: "[QA] Rice Side Dish",
    stage: "EXPERIMENTAL",
    cuisine: null,
    description: "A quick side pairing rice with peanut sauce.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 5,
    cookTimeMinutes: 0,
    difficulty: null,
    imageAssetId: null,
    sections: [],
    partLinks: [
      {
        targetDishId: parts.rice.dishId,
        targetDishVersionId: parts.rice.v1Id,
        position: 0,
        multiplier: 1,
      },
      {
        targetDishId: parts.sauce.dishId,
        targetDishVersionId: parts.sauce.v1Id,
        position: 1,
        multiplier: 2,
      },
    ],
  };
  const ricesidedishDishId = await createDish(
    ownerId,
    "RECIPE",
    ricesidedishContent,
  );
  await attachSeedTag(ricesidedishDishId, tagId);

  return {
    salad: {
      dishId: saladDishId,
      currentVersionId: await currentVersionIdOf(saladDishId),
    },
    ricebowl: {
      dishId: ricebowlDishId,
      currentVersionId: await currentVersionIdOf(ricebowlDishId),
    },
    stirfry: {
      dishId: stirfryDishId,
      currentVersionId: await currentVersionIdOf(stirfryDishId),
    },
    noodlesalad: {
      dishId: noodlesaladDishId,
      currentVersionId: await currentVersionIdOf(noodlesaladDishId),
    },
    ricesidedish: {
      dishId: ricesidedishDishId,
      currentVersionId: await currentVersionIdOf(ricesidedishDishId),
    },
  };
}
