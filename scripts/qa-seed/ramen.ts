import { prisma } from "@/lib/db/prisma";
import { versionContentToInput } from "@/lib/dishes/mappers";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { PartFixtureIds, Services } from "./parts";
import { section } from "./parts";
import { attachSeedTag } from "./owner";
import type { GarnishFixture } from "./materialized-fixture";

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

export type RamenFixture = {
  dishId: string;
  currentVersionId: string;
  v2_0Id: string;
  garnishOccurrenceLineageId: string;
  description: string | null;
};

/**
 * Builds "[QA] Sunday Ramen Project"'s full 8-step version timeline — the
 * Version-comparison fixture. Each step below implements one bullet from
 * the task's requirements: Section addition/removal, Ingredient/
 * Instruction change, Part attachment/removal, pinned Part Version change,
 * PartLink multiplier change, top-level reorder, and a stable-metadata
 * edit that does NOT create a new Version. Step 4 also attaches the
 * throwaway Garnish Part occurrence that Task 8 later converts into the
 * already-materialized snapshot fixture.
 *
 * IMPORTANT: `editDish` returns the DISH id, not the new Version's id
 * (confirmed against dishes.integration.test.ts's own `newDishId`
 * variable naming for this exact call — createDish/editDish/
 * promoteHistoricalVersion/duplicateDish all return a Dish id; only
 * propagatePartUpdate/resolvePartUsageOccurrence return a real Version id,
 * in a structured result). Every step below re-fetches the real new
 * Version id via `currentVersionIdOf(dishId)` afterward — safe here
 * because every edit in this timeline stays on the current line, so
 * `becomesCurrent` is always true.
 */
export async function buildRamenFixture(
  { createDish, editDish, getVersionContent }: Services,
  ownerId: string,
  tagId: string,
  parts: PartFixtureIds,
  garnish: GarnishFixture,
): Promise<RamenFixture> {
  // --- V1.0 -----------------------------------------------------------
  const v1_0Content: DishContentInput = {
    title: "[QA] Sunday Ramen Project",
    stage: "ACTIVE",
    cuisine: null,
    description: "A weekend project ramen build, from broth up.",
    yieldQuantity: 2,
    yieldUnit: "servings",
    prepTimeMinutes: 30,
    cookTimeMinutes: 45,
    difficulty: "Challenging",
    imageAssetId: null,
    sections: [
      section({
        position: 0,
        name: "Broth",
        ingredients: [
          {
            name: "Chicken stock",
            quantity: 4,
            unit: "cups",
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
            name: "Mirin",
            quantity: 1,
            unit: "tbsp",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Simmer 20 minutes." }],
      }),
    ],
    partLinks: [],
  };
  const dishId = await createDish(ownerId, "RECIPE", v1_0Content);
  await attachSeedTag(dishId, tagId);
  const v1_0Id = await currentVersionIdOf(dishId);

  // --- V1.1 (auto-MINOR: Section rename + guidance note only) ---------
  const v1_0Loaded = await loadContent(getVersionContent, v1_0Id);
  const v1_1Content: DishContentInput = {
    ...v1_0Content,
    sections: [
      {
        ...v1_0Loaded.sections[0],
        name: "Broth Base",
        guidanceNote: "Use a rich homemade stock if you have it.",
      },
    ],
    partLinks: v1_0Loaded.partLinks,
  };
  await editDish(ownerId, dishId, v1_0Id, v1_1Content, undefined, "RECIPE");
  const v1_1Id = await currentVersionIdOf(dishId);
  if (v1_1Id === v1_0Id) {
    throw new Error(
      "[qa-seed] Expected the Section-rename edit to create V1.1, but the current Version didn't change.",
    );
  }

  // --- Stable-metadata-only edit: cuisine changes, NO new Version -----
  const v1_1Loaded = await loadContent(getVersionContent, v1_1Id);
  const metadataOnlyContent: DishContentInput = {
    ...v1_1Content,
    cuisine: "Japanese",
    sections: v1_1Loaded.sections,
    partLinks: v1_1Loaded.partLinks,
  };
  await editDish(ownerId, dishId, v1_1Id, metadataOnlyContent, undefined, "RECIPE");
  const afterMetadataEditVersionId = await currentVersionIdOf(dishId);
  if (afterMetadataEditVersionId !== v1_1Id) {
    throw new Error(
      "[qa-seed] Expected the cuisine-only edit to stay on V1.1 (no new Version) but the current " +
        "Version changed — editDish's stable-field-only branch may have changed; re-check " +
        "service.ts before trusting this fixture.",
    );
  }

  // --- V2.0 (MAJOR): add a Section + attach the throwaway Garnish Part -
  const v2_0Content: DishContentInput = {
    ...metadataOnlyContent,
    sections: [
      v1_1Loaded.sections[0],
      section({
        position: 1,
        name: "Noodles",
        ingredients: [
          {
            name: "Ramen noodles",
            quantity: 8,
            unit: "oz",
            isApproximate: false,
            isOptional: false,
          },
        ],
        instructions: [{ text: "Cook per package, drain." }],
      }),
    ],
    partLinks: [
      {
        targetDishId: garnish.dishId,
        targetDishVersionId: garnish.v1Id,
        position: 2,
        multiplier: 1.5,
      },
    ],
  };
  await editDish(ownerId, dishId, v1_1Id, v2_0Content, "MAJOR", "RECIPE");
  const v2_0Id = await currentVersionIdOf(dishId);

  const v2_0Loaded = await loadContent(getVersionContent, v2_0Id);
  const garnishOccurrence = v2_0Loaded.partLinks.find(
    (link) => link.targetDishId === garnish.dishId,
  );
  if (!garnishOccurrence?.lineageId) {
    throw new Error(
      "[qa-seed] Expected the Garnish PartLink occurrence to exist (with a lineageId) after V2.0.",
    );
  }

  // --- V2.1 (MINOR): drop the Garnish occurrence, attach deleteme -----
  const v2_1Content: DishContentInput = {
    ...v2_0Content,
    sections: v2_0Loaded.sections,
    partLinks: [
      {
        targetDishId: parts.deleteme.dishId,
        targetDishVersionId: parts.deleteme.v1Id,
        position: 2,
        multiplier: 1,
      },
    ],
  };
  await editDish(ownerId, dishId, v2_0Id, v2_1Content, "MINOR", "RECIPE");
  const v2_1Id = await currentVersionIdOf(dishId);

  // --- V2.2 (MINOR): pinned Part Version change (deleteme V1.0 -> V1.1) -
  const v2_1Loaded = await loadContent(getVersionContent, v2_1Id);
  const v2_2Content: DishContentInput = {
    ...v2_1Content,
    sections: v2_1Loaded.sections,
    partLinks: v2_1Loaded.partLinks.map((link) =>
      link.targetDishId === parts.deleteme.dishId
        ? { ...link, targetDishVersionId: parts.deleteme.currentId }
        : link,
    ),
  };
  await editDish(ownerId, dishId, v2_1Id, v2_2Content, "MINOR", "RECIPE");
  const v2_2Id = await currentVersionIdOf(dishId);

  // --- V2.3 (MINOR): multiplier change 1 -> 2 --------------------------
  const v2_2Loaded = await loadContent(getVersionContent, v2_2Id);
  const v2_3Content: DishContentInput = {
    ...v2_2Content,
    sections: v2_2Loaded.sections,
    partLinks: v2_2Loaded.partLinks.map((link) =>
      link.targetDishId === parts.deleteme.dishId
        ? { ...link, multiplier: 2 }
        : link,
    ),
  };
  await editDish(ownerId, dishId, v2_2Id, v2_3Content, "MINOR", "RECIPE");
  const v2_3Id = await currentVersionIdOf(dishId);

  // --- V2.4 (MINOR): top-level reorder — deleteme moves before Noodles -
  const v2_3Loaded = await loadContent(getVersionContent, v2_3Id);
  const brothSection = v2_3Loaded.sections.find((s) => s.name === "Broth Base")!;
  const noodlesSection = v2_3Loaded.sections.find((s) => s.name === "Noodles")!;
  const deletemeLink = v2_3Loaded.partLinks.find(
    (link) => link.targetDishId === parts.deleteme.dishId,
  )!;
  const v2_4Content: DishContentInput = {
    ...v2_3Content,
    sections: [
      { ...brothSection, position: 0 },
      { ...noodlesSection, position: 2 },
    ],
    partLinks: [{ ...deletemeLink, position: 1 }],
  };
  await editDish(ownerId, dishId, v2_3Id, v2_4Content, "MINOR", "RECIPE");
  const v2_4Id = await currentVersionIdOf(dishId);

  return {
    dishId,
    currentVersionId: v2_4Id,
    v2_0Id,
    garnishOccurrenceLineageId: garnishOccurrence.lineageId,
    description: v1_0Content.description ?? null,
  };
}
