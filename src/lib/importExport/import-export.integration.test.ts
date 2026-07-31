import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as importExportService from "@/lib/importExport/service";
import {
  buildDishExportDto,
  buildAccountBackupDto,
} from "@/lib/importExport/export-dto";
import { parsePastedRecipe } from "@/lib/importExport/paste-parser";
import * as dishService from "@/lib/dishes/service";
import { NotFoundError } from "@/lib/errors";
import type { DishContentInput } from "@/lib/dishes/schema";

function content(overrides: Partial<DishContentInput> = {}): DishContentInput {
  return {
    title: "Ginger Soy Bowl",
    stage: "IDEA",
    cuisine: null,
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

describe("importExport service", () => {
  let userId: string | undefined;
  let otherUserId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
    if (otherUserId) {
      await deleteTestUser(otherUserId);
      otherUserId = undefined;
    }
  });

  it("confirmImport funnels into the normal createDish pathway and tags sourceKind IMPORT", async () => {
    const user = await createTestUser();
    userId = user.id;

    const { values } = parsePastedRecipe(
      ["Weeknight Tacos", "1 lb ground beef", "1. Brown the beef."].join("\n"),
    );

    const dishId = await importExportService.confirmImport(
      userId,
      "RECIPE",
      values,
    );

    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    expect(dish.sourceKind).toBe("IMPORT");
    expect(dish.currentTitle).toBe("Weeknight Tacos");

    const version = await prisma.dishVersion.findFirstOrThrow({
      where: { dishId },
      include: { sections: { include: { ingredients: true } } },
    });
    expect(version.majorVersion).toBe(1);
    expect(version.minorVersion).toBe(0);
    const ingredient = version.sections[0].ingredients.find(
      (i) => i.name === "ground beef",
    );
    expect(ingredient?.originalImportedText).toBe("1 lb ground beef");
  });

  it("proposeImportFromPaste creates nothing — parsing is pure", async () => {
    const user = await createTestUser();
    userId = user.id;

    importExportService.proposeImportFromPaste("Anything\n1 cup flour");

    const count = await prisma.dish.count({ where: { ownerId: userId } });
    expect(count).toBe(0);
  });

  it("STANDARD export excludes Taster identity, individual ratings, and Cooking notes", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(userId, "RECIPE", content());
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const versionId = dish.currentVersionId!;

    const taster = await prisma.taster.create({
      data: { ownerId: userId, name: "Mom", position: 1 },
    });
    const session = await prisma.cookingSession.create({
      data: {
        ownerId: userId,
        dishId,
        dishVersionId: versionId,
        state: "COMPLETED",
        startedAt: new Date("2024-01-01T10:00:00Z"),
        endedAt: new Date("2024-01-01T10:30:00Z"),
        cookingNotes: "Secret family trick used here.",
      },
    });
    await prisma.rating.create({
      data: {
        sessionId: session.id,
        dishId,
        dishVersionId: versionId,
        dishTitleSnapshot: "Ginger Soy Bowl",
        dishVersionLabelSnapshot: "V1.0",
        tasterId: taster.id,
        value: 5,
      },
    });

    const standard = await buildDishExportDto(
      userId,
      dishId,
      "RECIPE",
      "STANDARD",
    );
    expect(standard.aggregateRating).toBe(5);
    expect(standard.ratingCount).toBe(1);
    const serialized = JSON.stringify(standard);
    expect(serialized).not.toContain("Mom");
    expect(serialized).not.toContain("Secret family trick");
    expect(standard).not.toHaveProperty("individualRatings");
    expect(standard).not.toHaveProperty("cookingSessions");
  });

  it("DETAILED export includes anonymized per-rating evidence but not real Taster names or Cooking notes", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(userId, "RECIPE", content());
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const versionId = dish.currentVersionId!;

    const taster = await prisma.taster.create({
      data: { ownerId: userId, name: "Mom", position: 1 },
    });
    const session = await prisma.cookingSession.create({
      data: {
        ownerId: userId,
        dishId,
        dishVersionId: versionId,
        state: "COMPLETED",
        startedAt: new Date("2024-01-01T10:00:00Z"),
        endedAt: new Date("2024-01-01T10:30:00Z"),
        cookingNotes: "Secret family trick used here.",
      },
    });
    await prisma.rating.create({
      data: {
        sessionId: session.id,
        dishId,
        dishVersionId: versionId,
        dishTitleSnapshot: "Ginger Soy Bowl",
        dishVersionLabelSnapshot: "V1.0",
        tasterId: taster.id,
        value: 4,
      },
    });

    const detailed = await buildDishExportDto(
      userId,
      dishId,
      "RECIPE",
      "DETAILED",
    );
    expect(detailed.individualRatings).toHaveLength(1);
    expect(detailed.individualRatings![0].value).toBe(4);
    expect(detailed.individualRatings![0].taster).toBe("Taster 1");
    const serialized = JSON.stringify(detailed);
    expect(serialized).not.toContain("Mom");
    expect(serialized).not.toContain("Secret family trick");
    expect(detailed).not.toHaveProperty("cookingSessions");
  });

  it("FULL_PRIVATE_HISTORY export includes real Taster names and Cooking notes with an explicit privacy tier choice", async () => {
    const user = await createTestUser();
    userId = user.id;
    const dishId = await dishService.createDish(userId, "RECIPE", content());
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const versionId = dish.currentVersionId!;

    const taster = await prisma.taster.create({
      data: { ownerId: userId, name: "Mom", position: 1 },
    });
    const session = await prisma.cookingSession.create({
      data: {
        ownerId: userId,
        dishId,
        dishVersionId: versionId,
        state: "COMPLETED",
        startedAt: new Date("2024-01-01T10:00:00Z"),
        endedAt: new Date("2024-01-01T10:30:00Z"),
        cookingNotes: "Secret family trick used here.",
      },
    });
    await prisma.sessionReview.create({
      data: { sessionId: session.id, whatWentWell: "Crispy edges" },
    });
    await prisma.rating.create({
      data: {
        sessionId: session.id,
        dishId,
        dishVersionId: versionId,
        dishTitleSnapshot: "Ginger Soy Bowl",
        dishVersionLabelSnapshot: "V1.0",
        tasterId: taster.id,
        value: 4,
      },
    });

    const full = await buildDishExportDto(
      userId,
      dishId,
      "RECIPE",
      "FULL_PRIVATE_HISTORY",
    );
    expect(full.cookingSessions).toHaveLength(1);
    expect(full.cookingSessions![0].cookingNotes).toBe(
      "Secret family trick used here.",
    );
    expect(full.cookingSessions![0].ratings[0].taster).toBe("Mom");
    expect(full.cookingSessions![0].review?.whatWentWell).toBe("Crispy edges");
  });

  it("never exports another owner's Dish", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;
    otherUserId = intruder.id;
    const dishId = await dishService.createDish(owner.id, "RECIPE", content());

    await expect(
      buildDishExportDto(intruder.id, dishId, "RECIPE", "STANDARD"),
    ).rejects.toThrow(NotFoundError);
  });

  it("buildAccountBackupDto covers Dish content, Tasters, Cooking history, and Grocery Categories, scoped to the owner", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    userId = owner.id;
    otherUserId = intruder.id;

    await dishService.createDish(
      intruder.id,
      "RECIPE",
      content({ title: "Not yours" }),
    );

    const dishId = await dishService.createDish(owner.id, "RECIPE", content());
    const dish = await prisma.dish.findUniqueOrThrow({ where: { id: dishId } });
    const versionId = dish.currentVersionId!;

    const taster = await prisma.taster.create({
      data: { ownerId: owner.id, name: "Dad", position: 1 },
    });
    const session = await prisma.cookingSession.create({
      data: {
        ownerId: owner.id,
        dishId,
        dishVersionId: versionId,
        state: "COMPLETED",
        startedAt: new Date("2024-01-01T10:00:00Z"),
        endedAt: new Date("2024-01-01T10:30:00Z"),
        cookingNotes: "Backup should include this.",
      },
    });
    await prisma.rating.create({
      data: {
        sessionId: session.id,
        dishId,
        dishVersionId: versionId,
        dishTitleSnapshot: "Ginger Soy Bowl",
        dishVersionLabelSnapshot: "V1.0",
        tasterId: taster.id,
        value: 5,
      },
    });
    const category = await prisma.groceryCategory.create({
      data: {
        ownerId: owner.id,
        normalizedName: "produce",
        displayName: "Produce",
        position: 0,
      },
    });
    await prisma.groceryList.create({
      data: {
        ownerId: owner.id,
        title: "Weekly list",
        items: {
          create: [
            {
              name: "Carrots",
              quantityText: "2",
              position: 0,
              categoryId: category.id,
            },
          ],
        },
      },
    });
    await prisma.mealPlan.create({
      data: {
        ownerId: owner.id,
        title: "This week",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-01-07"),
      },
    });

    const backup = await buildAccountBackupDto(owner.id);

    expect(backup.dishes).toHaveLength(1);
    expect(backup.dishes[0].title).toBe("Ginger Soy Bowl");
    expect(backup.tasters.map((t) => t.name)).toContain("Dad");
    expect(backup.cookingSessions).toHaveLength(1);
    expect(backup.cookingSessions[0].cookingNotes).toBe(
      "Backup should include this.",
    );
    expect(backup.groceryCategories.map((c) => c.name)).toContain("Produce");
    expect(backup.groceryLists).toHaveLength(1);
    expect(backup.groceryLists[0].items[0].name).toBe("Carrots");
    expect(backup.mealPlans).toHaveLength(1);
    expect(backup.mealPlans[0].title).toBe("This week");

    const titles = backup.dishes.map((d) => d.title);
    expect(titles).not.toContain("Not yours");

    const serialized = JSON.stringify(backup);
    expect(serialized).not.toMatch(
      /"password"|"accessToken"|"refreshToken"|"idToken"|"token"/,
    );
  });
});
