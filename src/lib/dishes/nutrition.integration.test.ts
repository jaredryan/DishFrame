import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { getDishScopedVersionContentOrThrow } from "@/lib/dishes/queries";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Slice 13: nutrition is an ordinary Version-owned content field
 * (ARCHITECTURE_PROPOSAL.md Correction 5/§F.10) — these tests exercise the
 * server-side sanitization boundary (`normalizeNutritionOrThrow`) and prove
 * every save path (create, edit, duplicate, promote) treats it exactly like
 * yield/difficulty: never an in-place update to an already-saved row.
 */

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

async function loadDishWithVersion(dishId: string) {
  return prisma.dish.findUniqueOrThrow({
    where: { id: dishId },
    include: { currentVersion: true },
  });
}

async function unchangedContentFor(dishId: string, versionId: string) {
  const version = await getDishScopedVersionContentOrThrow(dishId, versionId);
  const section = version.sections[0];
  const ingredient = section.ingredients[0];
  return {
    sections: [
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
    ],
    partLinks: [],
  };
}

describe("nutrition", () => {
  let userId: string | undefined;

  afterEach(async () => {
    if (userId) {
      await deleteTestUser(userId);
      userId = undefined;
    }
  });

  describe("createDish", () => {
    it("persists manual nutrition, basis, More nutrients, and source attribution", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          calories: 320,
          protein: 12.5,
          carbs: 40,
          fat: 8,
          nutritionBasis: "PER_OUTPUT_UNIT",
          nutritionBasisQuantity: 1,
          nutritionBasisUnit: "serving",
          moreNutrients: [
            { key: "fiber", label: "Fiber", value: 3, unit: "g" },
            { key: "sodium", label: "Sodium", value: 450, unit: "mg" },
          ],
          nutritionSourceProvider: "fdc",
          nutritionSourceId: "12345",
          nutritionSourceName: "Rice, white, cooked",
        }),
      );

      const dish = await loadDishWithVersion(dishId);
      const version = dish.currentVersion!;

      expect(decimalToNumber(version.calories)).toBe(320);
      expect(decimalToNumber(version.protein)).toBe(12.5);
      expect(decimalToNumber(version.carbs)).toBe(40);
      expect(decimalToNumber(version.fat)).toBe(8);
      expect(version.nutritionBasis).toBe("PER_OUTPUT_UNIT");
      expect(decimalToNumber(version.nutritionBasisQuantity)).toBe(1);
      expect(version.nutritionBasisUnit).toBe("serving");
      expect(version.moreNutrients).toEqual([
        { key: "fiber", label: "Fiber", value: 3, unit: "g" },
        { key: "sodium", label: "Sodium", value: 450, unit: "mg" },
      ]);
      expect(version.nutritionSourceProvider).toBe("fdc");
      expect(version.nutritionSourceId).toBe("12345");
      expect(version.nutritionSourceName).toBe("Rice, white, cooked");
    });

    it("rejects PER_OUTPUT_UNIT basis with no basis amount/unit with a friendly ValidationError", async () => {
      const user = await createTestUser();
      userId = user.id;

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({ nutritionBasis: "PER_OUTPUT_UNIT" }),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("leaves nutrition columns null when nothing is entered", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(userId, "RECIPE", content());
      const dish = await loadDishWithVersion(dishId);

      expect(dish.currentVersion!.calories).toBeNull();
      expect(dish.currentVersion!.nutritionBasis).toBeNull();
      expect(dish.currentVersion!.moreNutrients).toBeNull();
    });
  });

  describe("editDish", () => {
    it("a nutrition-only change creates a new minor Version rather than mutating the saved row", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ calories: 200 }),
      );
      const dish = await loadDishWithVersion(dishId);
      const baseVersionId = dish.currentVersionId!;
      const unchanged = await unchangedContentFor(dishId, baseVersionId);

      await dishService.editDish(
        userId,
        dishId,
        baseVersionId,
        content({ ...unchanged, calories: 450 }),
        undefined,
      );

      const versions = await prisma.dishVersion.findMany({
        where: { dishId },
        orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
      });
      expect(versions).toHaveLength(2);
      expect(decimalToNumber(versions[0].calories)).toBe(200); // original untouched
      expect(decimalToNumber(versions[1].calories)).toBe(450); // new Version
      expect(versions[1].majorVersion).toBe(1);
      expect(versions[1].minorVersion).toBe(1);
    });

    it("detaching from a source on an already-saved Version clears attribution, preserves values, and goes through the ordinary new-Version path", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          calories: 320,
          protein: 12,
          nutritionBasis: "PER_OUTPUT_UNIT",
          nutritionBasisQuantity: 1,
          nutritionBasisUnit: "serving",
          nutritionSourceProvider: "fdc",
          nutritionSourceId: "12345",
          nutritionSourceName: "Rice, white, cooked",
        }),
      );
      const dish = await loadDishWithVersion(dishId);
      const baseVersionId = dish.currentVersionId!;
      const unchanged = await unchangedContentFor(dishId, baseVersionId);

      await dishService.editDish(
        userId,
        dishId,
        baseVersionId,
        content({
          ...unchanged,
          calories: 320,
          protein: 12,
          nutritionBasis: "PER_OUTPUT_UNIT",
          nutritionBasisQuantity: 1,
          nutritionBasisUnit: "serving",
          nutritionSourceProvider: null,
          nutritionSourceId: null,
          nutritionSourceName: null,
        }),
        undefined,
      );

      const versions = await prisma.dishVersion.findMany({
        where: { dishId },
        orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
      });
      expect(versions).toHaveLength(2);

      const original = versions[0];
      expect(original.nutritionSourceProvider).toBe("fdc");
      expect(original.nutritionSourceId).toBe("12345");
      expect(decimalToNumber(original.calories)).toBe(320);

      const detached = versions[1];
      expect(detached.nutritionSourceProvider).toBeNull();
      expect(detached.nutritionSourceId).toBeNull();
      expect(detached.nutritionSourceName).toBeNull();
      expect(decimalToNumber(detached.calories)).toBe(320);
      expect(decimalToNumber(detached.protein)).toBe(12);
      expect(detached.nutritionBasis).toBe("PER_OUTPUT_UNIT");
    });

    it("an otherwise-unchanged save with unchanged nutrition never allocates a Version", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ calories: 200, description: "Original" }),
      );
      const dish = await loadDishWithVersion(dishId);
      const baseVersionId = dish.currentVersionId!;
      const unchanged = await unchangedContentFor(dishId, baseVersionId);

      // Only description changes — Version-associated but mutable metadata
      // (§7.2) — nutrition stays exactly as saved.
      await dishService.editDish(
        userId,
        dishId,
        baseVersionId,
        content({
          ...unchanged,
          calories: 200,
          description: "Updated description",
        }),
        undefined,
      );

      const count = await prisma.dishVersion.count({ where: { dishId } });
      expect(count).toBe(1);
    });
  });

  describe("duplicateDish", () => {
    it("copies nutrition verbatim onto the new Dish's V1.0", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          calories: 300,
          nutritionBasis: "WHOLE",
          moreNutrients: [
            { key: "fiber", label: "Fiber", value: 5, unit: "g" },
          ],
          nutritionSourceProvider: "fdc",
          nutritionSourceId: "999",
          nutritionSourceName: "Test food",
        }),
      );

      const newDishId = await dishService.duplicateDish(
        userId,
        dishId,
        undefined,
      );
      const copy = await loadDishWithVersion(newDishId);

      expect(decimalToNumber(copy.currentVersion!.calories)).toBe(300);
      expect(copy.currentVersion!.nutritionBasis).toBe("WHOLE");
      expect(copy.currentVersion!.moreNutrients).toEqual([
        { key: "fiber", label: "Fiber", value: 5, unit: "g" },
      ]);
      expect(copy.currentVersion!.nutritionSourceProvider).toBe("fdc");
      expect(copy.currentVersion!.nutritionSourceName).toBe("Test food");
    });
  });

  describe("promoteHistoricalVersion", () => {
    it("copies nutrition verbatim into the promoted major Version", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ calories: 275, protein: 9 }),
      );
      const dish = await loadDishWithVersion(dishId);
      const versionId = dish.currentVersionId!;

      await dishService.promoteHistoricalVersion(userId, dishId, versionId);

      const updated = await loadDishWithVersion(dishId);
      expect(updated.currentVersion!.majorVersion).toBe(2);
      expect(decimalToNumber(updated.currentVersion!.calories)).toBe(275);
      expect(decimalToNumber(updated.currentVersion!.protein)).toBe(9);
    });
  });
});
