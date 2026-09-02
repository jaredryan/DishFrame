import { prisma } from "@/lib/db/prisma";
import type {
  createDish as CreateDish,
  editDish as EditDish,
} from "@/lib/dishes/service";
import type { getVersionContent as GetVersionContent } from "@/lib/dishes/queries";
import type { DishContentInput, SectionInput } from "@/lib/dishes/schema";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { attachSeedTag, ensureCuisine } from "./owner";

export type Services = {
  createDish: typeof CreateDish;
  editDish: typeof EditDish;
  getVersionContent: typeof GetVersionContent;
};

export function section(
  overrides: Partial<SectionInput> &
    Pick<SectionInput, "ingredients" | "instructions">,
): SectionInput {
  return {
    name: null,
    guidanceNote: null,
    partLinks: [],
    position: 0,
    ...overrides,
  };
}

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    select: { currentVersionId: true },
  });
  return dish.currentVersionId!;
}

/**
 * Fetches a Version's persisted content WITH its real lineageIds attached
 * — required before editDish can be told "this is the same
 * Section/Ingredient/Instruction/PartLink, just changed" rather than
 * "everything was removed and replaced" (diffVersionContent matches rows
 * by lineageId; a row with none is always treated as a fresh addition).
 * Every edit call in this file builds its new content by modifying the
 * result of this function, never from a bare literal, for exactly that
 * reason.
 */
async function loadContent(
  getVersionContent: Services["getVersionContent"],
  versionId: string,
) {
  const version = await getVersionContent(versionId);
  return versionContentToInput(version.sections, version.partLinks);
}

export type PartFixtureVersions = {
  dishId: string;
  v1Id: string;
  currentId: string;
};

export type PartFixtureIds = {
  rice: PartFixtureVersions;
  seasoning: PartFixtureVersions;
  sauce: PartFixtureVersions;
  replacement: PartFixtureVersions;
  deleteme: PartFixtureVersions;
  unused: PartFixtureVersions;
};

export async function buildPartFixtures(
  { createDish, editDish, getVersionContent }: Services,
  ownerId: string,
  tagId: string,
): Promise<PartFixtureIds> {
  const southeastAsianId = await ensureCuisine(ownerId, "Southeast Asian");
  const frenchId = await ensureCuisine(ownerId, "French");

  // --- Rice -----------------------------------------------------------
  const riceContent: DishContentInput = {
    title: "[QA] Steamed White Rice",
    stage: "ACTIVE",
    cuisineIds: [],
    description: "A basic pot of steamed white rice.",
    yieldQuantity: 4,
    yieldUnit: "servings",
    prepTimeMinutes: 5,
    cookTimeMinutes: 20,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "White rice",
            quantity: 2,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Water",
            quantity: 3,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Salt",
            quantity: 0.5,
            unit: "tsp",
            isApproximate: false,
            isOptional: true,
          },
        ],
        instructions: [
          { text: "Rinse rice until the water runs mostly clear." },
          { text: "Combine rice, water, and salt in a covered pot." },
          {
            text: "Bring to a boil, then reduce to a simmer, covered, 18 minutes.",
          },
          { text: "Remove from heat and rest, covered, 5 minutes." },
        ],
      }),
    ],
    partLinks: [],
  };
  const riceDishId = await createDish(ownerId, "PART", riceContent);
  await attachSeedTag(riceDishId, tagId);
  const riceV1Id = await currentVersionId(riceDishId);
  const riceV1Content = await loadContent(getVersionContent, riceV1Id);
  // editDish returns the DISH id, not the new Version's id (confirmed
  // against dishes.integration.test.ts's own `newDishId` variable naming
  // for this exact call) — the real new Version id must be re-fetched via
  // its own currentVersionId, since every edit here stays on the current
  // line (`becomesCurrent` is always true for a sequential MINOR/MAJOR
  // edit of the already-current Version).
  await editDish(
    ownerId,
    riceDishId,
    riceV1Id,
    {
      ...riceContent,
      sections: [
        {
          ...riceV1Content.sections[0],
          instructions: [
            ...riceV1Content.sections[0].instructions,
            { text: "Fluff with a fork before serving." },
          ],
        },
      ],
      partLinks: riceV1Content.partLinks,
    },
    "MINOR",
    "PART",
  );
  const riceV2Id = await currentVersionId(riceDishId);

  // --- Seasoning --------------------------------------------------------
  const seasoningContent: DishContentInput = {
    title: "[QA] All-Purpose Seasoning Blend",
    stage: "PROVEN",
    cuisineIds: [],
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Salt",
            quantity: 2,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Black pepper",
            quantity: 1,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Garlic powder",
            quantity: null,
            unit: null,
            isApproximate: true,
            displayText: "a generous sprinkle",
            isOptional: false,
          },
          {
            name: "Paprika",
            quantity: null,
            unit: null,
            isApproximate: true,
            displayText: "a generous sprinkle",
            isOptional: false,
          },
        ],
        instructions: [
          { text: "Combine all in a small jar and shake to mix." },
        ],
      }),
    ],
    partLinks: [],
  };
  const seasoningDishId = await createDish(ownerId, "PART", seasoningContent);
  await attachSeedTag(seasoningDishId, tagId);
  const seasoningV1Id = await currentVersionId(seasoningDishId);

  // --- Sauce (nests Seasoning) -------------------------------------------
  const sauceContent: DishContentInput = {
    title: "[QA] Peanut Dipping Sauce",
    stage: "ACTIVE",
    cuisineIds: [southeastAsianId],
    description: "A quick peanut sauce for dipping or drizzling.",
    yieldQuantity: 1,
    yieldUnit: "cup",
    prepTimeMinutes: 10,
    cookTimeMinutes: 0,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        position: 0,
        ingredients: [
          {
            name: "Peanut butter",
            quantity: 0.5,
            unit: "cup",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Soy sauce",
            quantity: 2,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Lime juice",
            quantity: 1,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Water",
            quantity: 3,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [
          { text: "Whisk peanut butter, soy sauce, and lime juice together." },
          { text: "Thin with water to taste." },
        ],
      }),
    ],
    partLinks: [
      {
        targetDishId: seasoningDishId,
        targetDishVersionId: seasoningV1Id,
        position: 1,
        multiplier: 0.5,
      },
    ],
  };
  const sauceDishId = await createDish(ownerId, "PART", sauceContent);
  await attachSeedTag(sauceDishId, tagId);
  const sauceV1Id = await currentVersionId(sauceDishId);
  const sauceV1Content = await loadContent(getVersionContent, sauceV1Id);
  await editDish(
    ownerId,
    sauceDishId,
    sauceV1Id,
    {
      ...sauceContent,
      sections: [
        {
          ...sauceV1Content.sections[0],
          instructions: [
            ...sauceV1Content.sections[0].instructions,
            { text: "Stir in chili flakes for heat." },
          ],
        },
      ],
      partLinks: sauceV1Content.partLinks,
    },
    "MINOR",
    "PART",
  );
  const sauceV2Id = await currentVersionId(sauceDishId);

  // --- Replacement --------------------------------------------------------
  const replacementContent: DishContentInput = {
    title: "[QA] Cauliflower Rice",
    stage: "EXPERIMENTAL",
    cuisineIds: [],
    description: "A lower-carb stand-in for steamed rice.",
    yieldQuantity: 4,
    yieldUnit: "servings",
    prepTimeMinutes: 10,
    cookTimeMinutes: 5,
    difficulty: "Easy",
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Riced cauliflower",
            quantity: 4,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Olive oil",
            quantity: 1,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Salt",
            quantity: 0.25,
            unit: "tsp",
            isApproximate: false,
            isOptional: true,
          },
        ],
        instructions: [
          {
            text: "Pulse cauliflower florets in a food processor until rice-sized.",
          },
          { text: "Sauté in olive oil over medium heat, 5 minutes." },
        ],
      }),
    ],
    partLinks: [],
  };
  const replacementDishId = await createDish(
    ownerId,
    "PART",
    replacementContent,
  );
  await attachSeedTag(replacementDishId, tagId);
  const replacementV1Id = await currentVersionId(replacementDishId);

  // --- Delete-Me (Garlic Confit) -------------------------------------------
  const deletemeContent: DishContentInput = {
    title: "[QA] Garlic Confit",
    stage: "ACTIVE",
    cuisineIds: [frenchId],
    description: "Slow-roasted garlic cloves preserved in olive oil.",
    yieldQuantity: 1,
    yieldUnit: "cup",
    prepTimeMinutes: 10,
    cookTimeMinutes: 90,
    difficulty: "Moderate",
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Garlic cloves",
            quantity: 2,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Olive oil",
            quantity: 2,
            unit: "cups",
            isApproximate: false,
            isOptional: false,
          },
          {
            name: "Fresh thyme",
            quantity: 2,
            unit: "sprigs",
            isApproximate: false,
            isOptional: true,
          },
        ],
        instructions: [
          { text: "Peel garlic cloves." },
          {
            text: "Submerge cloves and thyme in olive oil in a small baking dish.",
          },
          {
            text: "Roast low and slow, 90 minutes, until cloves are soft and golden.",
          },
        ],
      }),
    ],
    partLinks: [],
  };
  const deletemeDishId = await createDish(ownerId, "PART", deletemeContent);
  await attachSeedTag(deletemeDishId, tagId);
  const deletemeV1Id = await currentVersionId(deletemeDishId);
  const deletemeV1Content = await loadContent(getVersionContent, deletemeV1Id);
  await editDish(
    ownerId,
    deletemeDishId,
    deletemeV1Id,
    {
      ...deletemeContent,
      sections: [
        {
          ...deletemeV1Content.sections[0],
          instructions: [
            ...deletemeV1Content.sections[0].instructions,
            { text: "Store covered in the fridge up to 2 weeks." },
          ],
        },
      ],
      partLinks: deletemeV1Content.partLinks,
    },
    "MINOR",
    "PART",
  );
  const deletemeV2Id = await currentVersionId(deletemeDishId);

  // --- Unused -------------------------------------------------------------
  const unusedContent: DishContentInput = {
    title: "[QA] Toasted Sesame Oil Drizzle",
    stage: "IDEA",
    cuisineIds: [],
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      section({
        ingredients: [
          {
            name: "Toasted sesame oil",
            quantity: 1,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [
          { text: "Drizzle over the finished dish just before serving." },
        ],
      }),
    ],
    partLinks: [],
  };
  const unusedDishId = await createDish(ownerId, "PART", unusedContent);
  await attachSeedTag(unusedDishId, tagId);
  const unusedV1Id = await currentVersionId(unusedDishId);

  return {
    rice: { dishId: riceDishId, v1Id: riceV1Id, currentId: riceV2Id },
    seasoning: {
      dishId: seasoningDishId,
      v1Id: seasoningV1Id,
      currentId: seasoningV1Id,
    },
    sauce: { dishId: sauceDishId, v1Id: sauceV1Id, currentId: sauceV2Id },
    replacement: {
      dishId: replacementDishId,
      v1Id: replacementV1Id,
      currentId: replacementV1Id,
    },
    deleteme: {
      dishId: deletemeDishId,
      v1Id: deletemeV1Id,
      currentId: deletemeV2Id,
    },
    unused: { dishId: unusedDishId, v1Id: unusedV1Id, currentId: unusedV1Id },
  };
}
