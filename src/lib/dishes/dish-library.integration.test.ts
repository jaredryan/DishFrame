import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import { initializeNewUser } from "@/lib/account/init";
import * as dishService from "@/lib/dishes/service";
import * as dishMetadata from "@/lib/dishes/dish-metadata";
import * as tagService from "@/lib/tags/service";
import * as flavorProfileService from "@/lib/flavor-profiles/service";
import { queryDishLibrary } from "@/lib/dishes/queries";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";
import type { LibraryFilters } from "@/lib/dishes/library-filters";

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
    stage: "ACTIVE",
    cuisineIds: [],
    description: null,
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    imageAssetId: null,
    sections: [
      {
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            name: "Salt",
            quantity: null,
            quantityEnd: null,
            isApproximate: false,
            unit: null,
            displayText: null,
            preparationNote: null,
            isOptional: false,
            substitute: null,
          },
        ],
        instructions: [],
        partLinks: [],
      },
    ],
    partLinks: [],
    ...overrides,
  };
}

/** Test-local helper — creates a real, owned Cuisine row (PRODUCT_SPEC.md
 * §46, owner decision 2026-09-02: Cuisine is a normalized Dish↔Cuisine
 * relation now, not a free-text `Dish.cuisine` column). */
async function createCuisine(ownerId: string, displayName: string) {
  return prisma.cuisine.create({
    data: {
      ownerId,
      normalizedName: displayName.trim().toLowerCase(),
      displayName,
      position: 0,
    },
  });
}

function defaultFilters(
  overrides: Partial<LibraryFilters> = {},
): LibraryFilters {
  return {
    search: "",
    stages: [],
    tagIds: [],
    cuisineIds: [],
    flavorProfileValueIds: [],
    rating: null,
    sort: "RECENTLY_UPDATED",
    sortDirection: "desc",
    sortIsExplicit: false,
    ...overrides,
  };
}

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

/** Reloads the persisted default Section/Ingredient (real lineageIds) so an
 * edit that only changes stable metadata (cuisine) reads as unchanged
 * cooking content — mirrors `dishes.integration.test.ts`'s own
 * `unchangedSections` helper (a fresh, lineageId-less `content()` ingredient
 * would otherwise look like a structural change requiring a versionChoice). */
async function unchangedSections(dishId: string) {
  const dish = await prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    include: {
      currentVersion: {
        include: { sections: { include: { ingredients: true } } },
      },
    },
  });
  const section = dish.currentVersion!.sections[0];
  const ingredient = section.ingredients[0];
  return [
    {
      lineageId: section.lineageId,
      name: null,
      guidanceNote: null,
      position: 0,
      ingredients: [
        {
          lineageId: ingredient.lineageId,
          name: "Salt",
          quantity: null,
          quantityEnd: null,
          isApproximate: false,
          unit: null,
          displayText: null,
          preparationNote: null,
          isOptional: false,
          substitute: null,
        },
      ],
      instructions: [],
      partLinks: [],
    },
  ];
}

/** A minimal completed session + Rating row, bypassing the full cooking
 * flow — this test suite is about library filter/sort/search behavior, not
 * cooking-session or rating domain rules (covered in reviews.integration.test.ts). */
async function rate(ownerId: string, dishId: string, value: number) {
  const versionId = await currentVersionId(dishId);
  const taster = await prisma.taster.findFirstOrThrow({
    where: { ownerId, isOwner: true },
  });
  const session = await prisma.cookingSession.create({
    data: {
      ownerId,
      dishId,
      dishVersionId: versionId,
      state: "COMPLETED",
      endedAt: new Date(),
    },
  });
  await prisma.rating.create({
    data: {
      sessionId: session.id,
      dishId,
      dishVersionId: versionId,
      dishTitleSnapshot: "snapshot",
      dishVersionLabelSnapshot: "V1.0",
      tasterId: taster.id,
      value,
    },
  });
}

describe("dish-metadata service (Slice 10)", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("sets, replaces, and clears a Dish's tags", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(userId, "RECIPE", content());
    const tagA = await tagService.createTag(userId, "Quick");
    const tagB = await tagService.createTag(userId, "Weeknight");

    await dishMetadata.setDishTags(userId, dishId, "RECIPE", [
      tagA.id,
      tagB.id,
    ]);
    expect(
      (await prisma.dishTag.findMany({ where: { dishId } }))
        .map((r) => r.tagId)
        .sort(),
    ).toEqual([tagA.id, tagB.id].sort());

    await dishMetadata.setDishTags(userId, dishId, "RECIPE", [tagB.id]);
    expect(
      (await prisma.dishTag.findMany({ where: { dishId } })).map(
        (r) => r.tagId,
      ),
    ).toEqual([tagB.id]);

    await dishMetadata.setDishTags(userId, dishId, "RECIPE", []);
    expect(await prisma.dishTag.findMany({ where: { dishId } })).toEqual([]);
  });

  it("rejects a tag id the caller doesn't own", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    const foreignTag = await tagService.createTag(intruder.id, "Not yours");

    await expect(
      dishMetadata.setDishTags(owner.id, dishId, "RECIPE", [foreignTag.id]),
    ).rejects.toThrow(ValidationError);

    await deleteTestUser(intruder.id);
  });

  it("scopes setDishTags to the Dish's owner", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());

    await expect(
      dishMetadata.setDishTags(intruder.id, dishId, "RECIPE", []),
    ).rejects.toThrow(NotFoundError);

    await deleteTestUser(intruder.id);
  });

  it("sets and clears a Dish's Flavor profiles", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(userId, "PART", content());
    const sweet = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Sweet",
    );

    await dishMetadata.setDishFlavorProfiles(userId, dishId, "PART", [
      sweet.id,
    ]);
    expect(
      await prisma.dishFlavorProfile.findMany({ where: { dishId } }),
    ).toHaveLength(1);

    await dishMetadata.setDishFlavorProfiles(userId, dishId, "PART", []);
    expect(
      await prisma.dishFlavorProfile.findMany({ where: { dishId } }),
    ).toEqual([]);
  });

  it("toggles the Favorite tag on and off, using the account's protected Favorite tag", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const dishId = await dishService.createDish(userId, "RECIPE", content());
    const favoriteTag = await prisma.tag.findFirstOrThrow({
      where: { ownerId: userId, isFavorite: true },
    });

    const first = await dishMetadata.toggleFavorite(userId, dishId, "RECIPE");
    expect(first.isFavorite).toBe(true);
    expect(
      await prisma.dishTag.findUnique({
        where: { dishId_tagId: { dishId, tagId: favoriteTag.id } },
      }),
    ).not.toBeNull();

    const second = await dishMetadata.toggleFavorite(userId, dishId, "RECIPE");
    expect(second.isFavorite).toBe(false);
    expect(
      await prisma.dishTag.findUnique({
        where: { dishId_tagId: { dishId, tagId: favoriteTag.id } },
      }),
    ).toBeNull();
  });
});

describe("queryDishLibrary (Slice 10)", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  it("excludes Archived by default, includes it only via an explicit Stage=Archived filter (§43.3)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const activeId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Active Dish", stage: "ACTIVE" }),
    );
    const archivedId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Archived Dish", stage: "ARCHIVED" }),
    );

    const withoutFilter = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters(),
      "GROUP_AVERAGE",
    );
    expect(withoutFilter.map((d) => d.id)).toEqual([activeId]);

    const withArchivedFilter = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ stages: ["ARCHIVED"] }),
      "GROUP_AVERAGE",
    );
    expect(withArchivedFilter.map((d) => d.id)).toEqual([archivedId]);
  });

  it("combines categories with AND and matches tags/Flavor profiles with match-all (§47.4/§47.6/§47.7)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const highProtein = await tagService.createTag(userId, "High Protein");
    const quick = await tagService.createTag(userId, "Quick");
    const spicy = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Spicy",
    );
    const vietnamese = await createCuisine(userId, "Vietnamese");
    const thai = await createCuisine(userId, "Thai");

    const bothId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Both Tags", cuisineIds: [vietnamese.id] }),
    );
    await dishMetadata.setDishTags(userId, bothId, "RECIPE", [
      highProtein.id,
      quick.id,
    ]);
    await dishMetadata.setDishFlavorProfiles(userId, bothId, "RECIPE", [
      spicy.id,
    ]);

    const onlyOneId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "One Tag", cuisineIds: [vietnamese.id] }),
    );
    await dishMetadata.setDishTags(userId, onlyOneId, "RECIPE", [
      highProtein.id,
    ]);

    const wrongCuisineId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Wrong Cuisine", cuisineIds: [thai.id] }),
    );
    await dishMetadata.setDishTags(userId, wrongCuisineId, "RECIPE", [
      highProtein.id,
      quick.id,
    ]);

    const result = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({
        cuisineIds: [vietnamese.id],
        tagIds: [highProtein.id, quick.id],
      }),
      "GROUP_AVERAGE",
    );
    expect(result.map((d) => d.id)).toEqual([bothId]);
  });

  it("a genuine rating participates in the rating filter and Highest-rated sort", async () => {
    const user = await createTestUser();
    userId = user.id;
    await initializeNewUser(userId);
    const ratedId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Rated Dish" }),
    );
    const unratedId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Unrated Dish" }),
    );
    await rate(userId, ratedId, 5);

    const highestRated = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ sort: "RATING" }),
      "GROUP_AVERAGE",
    );
    // Unrated always sorts last (§48.4), regardless of direction.
    expect(highestRated.map((d) => d.id)).toEqual([ratedId, unratedId]);

    const fiveStarOnly = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ rating: "FIVE" }),
      "GROUP_AVERAGE",
    );
    expect(fiveStarOnly.map((d) => d.id)).toEqual([ratedId]);

    const unratedOnly = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ rating: "UNRATED" }),
      "GROUP_AVERAGE",
    );
    expect(unratedOnly.map((d) => d.id)).toEqual([unratedId]);
  });

  it("ranks an exact title match above a cuisine-only match end-to-end (Arch round-3 Correction 6)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const vietnamese = await createCuisine(userId, "Vietnamese");
    const exactTitleId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Vietnamese" }),
    );
    const cuisineOnlyId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Pho", cuisineIds: [vietnamese.id] }),
    );

    const result = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ search: "Vietnamese" }),
      "GROUP_AVERAGE",
    );
    expect(result.map((d) => d.id)).toEqual([exactTitleId, cuisineOnlyId]);
  });

  it("a cuisine edit is immediately reflected in search, with no explicit refresh step", async () => {
    const user = await createTestUser();
    userId = user.id;
    const thai = await createCuisine(userId, "Thai");
    const korean = await createCuisine(userId, "Korean");
    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Noodle Soup", cuisineIds: [thai.id] }),
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Korean" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([]);

    const versionId = await currentVersionId(dishId);
    await dishService.editDish(
      userId,
      dishId,
      versionId,
      content({
        title: "Noodle Soup",
        cuisineIds: [korean.id],
        sections: await unchangedSections(dishId),
      }),
      undefined,
      "RECIPE",
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Korean" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);
  });

  it("a tag rename is immediately reflected in search", async () => {
    const user = await createTestUser();
    userId = user.id;
    const tag = await tagService.createTag(userId, "Freezer Friendly");
    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Chili" }),
    );
    await dishMetadata.setDishTags(userId, dishId, "RECIPE", [tag.id]);

    await tagService.renameTag(userId, tag.id, "Meal Prep");

    const result = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ search: "Meal Prep" }),
      "GROUP_AVERAGE",
    );
    expect(result.map((d) => d.id)).toEqual([dishId]);
  });

  it("a Flavor profile merge is immediately reflected in search", async () => {
    const user = await createTestUser();
    userId = user.id;
    const source = await flavorProfileService.createFlavorProfileValue(
      userId,
      "Hot",
    );
    await flavorProfileService.createFlavorProfileValue(userId, "Spicy");
    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Curry" }),
    );
    await dishMetadata.setDishFlavorProfiles(userId, dishId, "RECIPE", [
      source.id,
    ]);

    await flavorProfileService.renameFlavorProfileValue(
      userId,
      source.id,
      "Spicy",
    );

    const result = await queryDishLibrary(
      userId,
      "RECIPE",
      defaultFilters({ search: "Spicy" }),
      "GROUP_AVERAGE",
    );
    expect(result.map((d) => d.id)).toEqual([dishId]);
  });

  it("a renamed Section is immediately searchable, and the old name stops matching (§44.5 structural tier)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({
        title: "Weeknight Bowl",
        sections: [
          {
            name: "Broth",
            guidanceNote: null,
            position: 0,
            ingredients: content().sections[0].ingredients,
            instructions: [],
            partLinks: [],
          },
        ],
      }),
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Broth" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);

    const dish = await prisma.dish.findUniqueOrThrow({
      where: { id: dishId },
      include: {
        currentVersion: {
          include: { sections: { include: { ingredients: true } } },
        },
      },
    });
    const section = dish.currentVersion!.sections[0];
    const ingredient = section.ingredients[0];

    await dishService.editDish(
      userId,
      dishId,
      dish.currentVersionId!,
      content({
        title: "Weeknight Bowl",
        sections: [
          {
            lineageId: section.lineageId,
            name: "Marinade",
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                lineageId: ingredient.lineageId,
                name: "Salt",
                quantity: null,
                quantityEnd: null,
                isApproximate: false,
                unit: null,
                displayText: null,
                preparationNote: null,
                isOptional: false,
                substitute: null,
              },
            ],
            instructions: [],
            partLinks: [],
          },
        ],
      }),
      undefined,
      "RECIPE",
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Broth" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([]);
    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Marinade" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);
  });

  it("a linked Part's title is searchable on the parent Recipe, stops matching once detached, and the replacement Part's title becomes searchable (structural tier 7)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Nuoc Cham" }),
    );
    const replacementPartId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Peanut Sauce" }),
    );
    const partVersionId = await currentVersionId(partId);
    const replacementVersionId = await currentVersionId(replacementPartId);

    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({
        title: "Vermicelli Bowl",
        partLinks: [
          {
            targetDishId: partId,
            targetDishVersionId: partVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Nuoc Cham" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);

    // Replace the linked Part with a different one — the same
    // classification path (`diffVersionContent`'s `cookingChanged`) any
    // ordinary PartLink retarget goes through.
    await dishService.editDish(
      userId,
      dishId,
      await currentVersionId(dishId),
      content({
        title: "Vermicelli Bowl",
        sections: await unchangedSections(dishId),
        partLinks: [
          {
            targetDishId: replacementPartId,
            targetDishVersionId: replacementVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
      "MINOR",
      "RECIPE",
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Nuoc Cham" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([]);
    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Peanut Sauce" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);
  });

  it("renaming a linked Part's stable title immediately refreshes the parent Recipe's search, with no explicit refresh step", async () => {
    const user = await createTestUser();
    userId = user.id;
    const partId = await dishService.createDish(
      userId,
      "PART",
      content({ title: "Chili Oil" }),
    );
    const partVersionId = await currentVersionId(partId);

    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({
        title: "Dumpling Plate",
        partLinks: [
          {
            targetDishId: partId,
            targetDishVersionId: partVersionId,
            position: 1,
            multiplier: 1,
          },
        ],
      }),
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Chili Oil" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);

    // A title-only change on the Part — stable Dish metadata (§7.1), so it
    // never creates a Version on either the Part or the Recipe that links
    // it, yet the Recipe's structural search text must still pick it up.
    // Sections/ingredients are reloaded with their real (persisted)
    // lineageIds so this reads as a genuine no-op on cooking content —
    // otherwise a fresh, lineageId-less section would misclassify as a
    // content change requiring a `versionChoice`.
    await dishService.editDish(
      userId,
      partId,
      partVersionId,
      content({
        title: "Spicy Chili Oil",
        sections: await unchangedSections(partId),
      }),
      undefined,
      "PART",
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Chili Oil" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);
    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Spicy Chili Oil" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);

    await dishService.editDish(
      userId,
      partId,
      await currentVersionId(partId),
      content({
        title: "Garlic Sesame Oil",
        sections: await unchangedSections(partId),
      }),
      undefined,
      "PART",
    );

    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Chili Oil" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([]);
    expect(
      (
        await queryDishLibrary(
          userId,
          "RECIPE",
          defaultFilters({ search: "Garlic Sesame Oil" }),
          "GROUP_AVERAGE",
        )
      ).map((d) => d.id),
    ).toEqual([dishId]);
  });

  it("is tolerant of ordinary punctuation differences through the full query path (§44.5)", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(
      userId,
      "RECIPE",
      content({ title: "Lemon-Garlic Chicken" }),
    );

    for (const query of ["lemon garlic", "lemon-garlic", "lemon/garlic"]) {
      expect(
        (
          await queryDishLibrary(
            userId,
            "RECIPE",
            defaultFilters({ search: query }),
            "GROUP_AVERAGE",
          )
        ).map((d) => d.id),
      ).toEqual([dishId]);
    }
  });
});
