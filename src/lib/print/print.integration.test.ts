import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { deleteDish } from "@/lib/dishes/service";
import type { DishContentInput } from "@/lib/dishes/schema";
import { NotFoundError } from "@/lib/errors";
import { resolveOwnerPrintContent } from "@/lib/print/service";

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
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

async function currentVersionId(dishId: string): Promise<string> {
  const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
  return dish.currentVersionId!;
}

describe("print: resolveOwnerPrintContent", () => {
  let userIds: string[] = [];

  afterEach(async () => {
    for (const id of userIds) {
      await deleteTestUser(id);
    }
    userIds = [];
  });

  async function newUser() {
    const user = await createTestUser();
    userIds.push(user.id);
    return user;
  }

  it("resolves the current Version for an owned Recipe", async () => {
    const owner = await newUser();
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({ title: "Ginger Soy Bowl" }),
    );

    const result = await resolveOwnerPrintContent(owner.id, dishId, "RECIPE");
    expect(result.isCurrent).toBe(true);
    expect(result.content.title).toBe("Ginger Soy Bowl");
    expect(result.content.dishKind).toBe("RECIPE");
    expect(result.content.sections[0].ingredients[0].name).toBe("Salt");
  });

  it("resolves the current Version for an owned Part", async () => {
    const owner = await newUser();
    const dishId = await dishService.createDish(
      owner.id,
      "PART",
      content({ title: "Nuoc Cham" }),
    );

    const result = await resolveOwnerPrintContent(owner.id, dishId, "PART");
    expect(result.content.dishKind).toBe("PART");
    expect(result.content.title).toBe("Nuoc Cham");
  });

  it("rejects an unrelated user, and a mismatched kind, with NotFoundError", async () => {
    const owner = await newUser();
    const other = await newUser();
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());

    await expect(
      resolveOwnerPrintContent(other.id, dishId, "RECIPE"),
    ).rejects.toThrow(NotFoundError);
    await expect(
      resolveOwnerPrintContent(owner.id, dishId, "PART"),
    ).rejects.toThrow(NotFoundError);
  });

  it("a historical Version resolves that exact Version's content, never the current one", async () => {
    const owner = await newUser();
    // Title is stable Dish identity, not per-Version content (PRODUCT_SPEC.md
    // §7.1) — every historical print shows the Dish's one current title, so
    // this test asserts on genuinely Version-scoped content (the Ingredient
    // name) instead.
    const dishId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({
        title: "Ginger Soy Bowl",
        sections: [
          {
            name: null,
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: "Original Ingredient",
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
    );
    const historicalVersionId = await currentVersionId(dishId);

    await dishService.editDish(
      owner.id,
      dishId,
      historicalVersionId,
      content({
        title: "Ginger Soy Bowl",
        sections: [
          {
            name: null,
            guidanceNote: null,
            position: 0,
            ingredients: [
              {
                name: "Edited Ingredient",
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
      "MINOR",
    );

    const historical = await resolveOwnerPrintContent(
      owner.id,
      dishId,
      "RECIPE",
      historicalVersionId,
    );
    expect(historical.isCurrent).toBe(false);
    expect(historical.content.sections[0].ingredients[0].name).toBe(
      "Original Ingredient",
    );

    const current = await resolveOwnerPrintContent(owner.id, dishId, "RECIPE");
    expect(current.isCurrent).toBe(true);
    expect(current.content.sections[0].ingredients[0].name).toBe(
      "Edited Ingredient",
    );
  });

  it("a versionId belonging to a different Dish is rejected, even for the same owner", async () => {
    const owner = await newUser();
    const dishAId = await dishService.createDish(owner.id, "RECIPE", content());
    const dishBId = await dishService.createDish(owner.id, "RECIPE", content());
    const dishBVersionId = await currentVersionId(dishBId);

    await expect(
      resolveOwnerPrintContent(owner.id, dishAId, "RECIPE", dishBVersionId),
    ).rejects.toThrow(NotFoundError);
  });

  it("includes nested linked Part content in authored position", async () => {
    const owner = await newUser();
    const partId = await dishService.createDish(
      owner.id,
      "PART",
      content({ title: "Nuoc Cham" }),
    );
    const partVersionId = await currentVersionId(partId);

    const recipeId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({
        title: "Spring Rolls",
        partLinks: [
          {
            targetDishId: partId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 1,
          },
        ],
      }),
    );

    const result = await resolveOwnerPrintContent(owner.id, recipeId, "RECIPE");
    expect(result.content.topLevelPartLinks).toHaveLength(1);
    expect(result.content.topLevelPartLinks[0].title).toBe("Nuoc Cham");
    expect(
      result.content.topLevelPartLinks[0].sections[0].ingredients[0].name,
    ).toBe("Salt");
  });

  it("a historical Version's MATERIALIZED occurrence (source Part since deleted) still renders", async () => {
    const owner = await newUser();
    const partId = await dishService.createDish(
      owner.id,
      "PART",
      content({ title: "Nuoc Cham" }),
    );
    const partVersionId = await currentVersionId(partId);

    const recipeId = await dishService.createDish(
      owner.id,
      "RECIPE",
      content({
        title: "Spring Rolls",
        partLinks: [
          {
            targetDishId: partId,
            targetDishVersionId: partVersionId,
            position: 0,
            multiplier: 1,
          },
        ],
      }),
    );
    const historicalVersionId = await currentVersionId(recipeId);

    // Move current off the Part, then delete it — materializes the still-
    // LIVE historical PartLink in place (same setup as
    // sharing.integration.test.ts's MATERIALIZED coverage).
    await dishService.editDish(
      owner.id,
      recipeId,
      historicalVersionId,
      content({ title: "Spring Rolls", partLinks: [] }),
      "MAJOR",
    );
    await deleteDish(owner.id, partId, "PART");

    const result = await resolveOwnerPrintContent(
      owner.id,
      recipeId,
      "RECIPE",
      historicalVersionId,
    );
    expect(result.content.topLevelPartLinks).toHaveLength(1);
    expect(result.content.topLevelPartLinks[0].title).toBe("Nuoc Cham");
    expect(
      result.content.topLevelPartLinks[0].sections[0].ingredients[0].name,
    ).toBe("Salt");
  });

  it("excludes Taster identity and Cooking notes even though the owner can otherwise see them", async () => {
    const owner = await newUser();
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    const versionId = await currentVersionId(dishId);

    const taster = await prisma.taster.create({
      data: {
        ownerId: owner.id,
        name: "Secret Taster Name",
        isOwner: false,
        position: 0,
      },
    });
    const session = await prisma.cookingSession.create({
      data: {
        ownerId: owner.id,
        dishId,
        dishVersionId: versionId,
        state: "COMPLETED",
        startedAt: new Date(),
        endedAt: new Date(),
        cookingNotes: "Secret cooking notes nobody printed should see",
      },
    });
    await prisma.rating.create({
      data: {
        dishId,
        dishVersionId: versionId,
        sessionId: session.id,
        tasterId: taster.id,
        dishTitleSnapshot: "Ginger Soy Bowl",
        dishVersionLabelSnapshot: "V1.0",
        value: 5,
      },
    });

    const result = await resolveOwnerPrintContent(owner.id, dishId, "RECIPE");
    const serialized = JSON.stringify(result.content);

    expect(serialized).not.toContain("Secret Taster Name");
    expect(serialized).not.toContain("Secret cooking notes");
    // The whitelist DTO exposes only the dish-wide aggregate — never per-
    // Taster/session evidence (PRODUCT_SPEC.md §87's "restrained" allowance).
    expect(result.content.aggregateRating).toBe(5);
    expect(result.content.ratingCount).toBe(1);

    // Poison-field guard: the resolved shape carries only the known
    // print-safe keys — a future field added to `ShareGraphNode` without
    // also being added to `PublicShareContent`'s explicit mapping would
    // fail this the moment it's plumbed through, rather than silently
    // leaking through an unreviewed passthrough.
    expect(Object.keys(result.content).sort()).toEqual(
      [
        "aggregateRating",
        "cookTimeMinutes",
        "cuisines",
        "description",
        "difficulty",
        "dishKind",
        "flavorProfiles",
        "imageAssetId",
        "nutrition",
        "prepTimeMinutes",
        "ratingCount",
        "sections",
        "tags",
        "title",
        "topLevelPartLinks",
        "versionLabel",
        "yieldQuantity",
        "yieldUnit",
      ].sort(),
    );
  });
});
