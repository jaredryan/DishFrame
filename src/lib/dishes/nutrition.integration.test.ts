import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { createTestUser, deleteTestUser } from "@/test/factories";
import * as dishService from "@/lib/dishes/service";
import { ValidationError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { getDishScopedVersionContentOrThrow } from "@/lib/dishes/queries";
import type { DishContentInput } from "@/lib/dishes/schema";

/**
 * Slice 13 metadata-classification correction pass: nutrition (like
 * description/image/yield/prep/cook/difficulty) is Version-*scoped*
 * metadata, editable in place on the selected Version — current or a
 * deliberately chosen historical one — never itself a reason to create a
 * new Version (PRODUCT_SPEC.md §54, service.ts's `editDish` module doc
 * comment). These tests exercise the server-side sanitization/validation
 * boundary (`normalizeNutritionOrThrow`) and every save path (create, edit
 * in place, duplicate, promote).
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
          nutritionSourceProvider: "USDA_FDC",
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
      expect(version.nutritionSourceProvider).toBe("USDA_FDC");
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

  describe("attribution integrity", () => {
    it("rejects a source id/name with no source provider", async () => {
      const user = await createTestUser();
      userId = user.id;

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({ nutritionSourceId: "12345" }),
        ),
      ).rejects.toThrow(ValidationError);

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({ nutritionSourceName: "Rice, white, cooked" }),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects USDA_FDC attribution missing either the id or the name", async () => {
      const user = await createTestUser();
      userId = user.id;

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({
            nutritionSourceProvider: "USDA_FDC",
            nutritionSourceName: "Rice, white, cooked",
          }),
        ),
      ).rejects.toThrow(ValidationError);

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({
            nutritionSourceProvider: "USDA_FDC",
            nutritionSourceId: "12345",
          }),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("rejects an unsupported provider value", async () => {
      const user = await createTestUser();
      userId = user.id;

      await expect(
        dishService.createDish(
          userId,
          "RECIPE",
          content({
            // @ts-expect-error — deliberately bypassing the Zod enum to
            // prove the service-level check is the authoritative backstop,
            // not just client-side/UI validation.
            nutritionSourceProvider: "SOME_OTHER_SOURCE",
            nutritionSourceId: "1",
            nutritionSourceName: "x",
          }),
        ),
      ).rejects.toThrow(ValidationError);
    });

    it("accepts valid USDA_FDC attribution, and fully manual nutrition with no attribution", async () => {
      const user = await createTestUser();
      userId = user.id;

      const withSource = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          nutritionSourceProvider: "USDA_FDC",
          nutritionSourceId: "12345",
          nutritionSourceName: "Rice, white, cooked",
        }),
      );
      const sourced = await loadDishWithVersion(withSource);
      expect(sourced.currentVersion!.nutritionSourceProvider).toBe("USDA_FDC");

      const manual = await dishService.createDish(
        userId,
        "RECIPE",
        content({ calories: 200 }),
      );
      const manualDish = await loadDishWithVersion(manual);
      expect(manualDish.currentVersion!.nutritionSourceProvider).toBeNull();
      expect(manualDish.currentVersion!.nutritionSourceId).toBeNull();
      expect(manualDish.currentVersion!.nutritionSourceName).toBeNull();
    });
  });

  describe("editDish", () => {
    it("attaching FDC attribution to a previously-manual saved Version updates it in place", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ calories: 130 }),
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
          calories: 130,
          nutritionSourceProvider: "USDA_FDC",
          nutritionSourceId: "2001",
          nutritionSourceName: "Rice, white, cooked",
        }),
        undefined,
      );

      expect(await prisma.dishVersion.count({ where: { dishId } })).toBe(1);
      const updated = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: baseVersionId },
      });
      expect(updated.nutritionSourceProvider).toBe("USDA_FDC");
      expect(updated.nutritionSourceId).toBe("2001");
      expect(updated.nutritionSourceName).toBe("Rice, white, cooked");
    });

    it("a nutrition-only change updates the selected Version in place — no new Version is created", async () => {
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
      });
      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe(baseVersionId);
      expect(decimalToNumber(versions[0].calories)).toBe(450);

      const after = await loadDishWithVersion(dishId);
      expect(after.currentVersionId).toBe(baseVersionId);
    });

    it("changing numeric sourced values while retaining valid attribution stays valid and in place", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({
          calories: 320,
          nutritionSourceProvider: "USDA_FDC",
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
          calories: 340,
          nutritionSourceProvider: "USDA_FDC",
          nutritionSourceId: "12345",
          nutritionSourceName: "Rice, white, cooked",
        }),
        undefined,
      );

      expect(await prisma.dishVersion.count({ where: { dishId } })).toBe(1);
      const updated = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: baseVersionId },
      });
      expect(decimalToNumber(updated.calories)).toBe(340);
      expect(updated.nutritionSourceProvider).toBe("USDA_FDC");
    });

    it("detaching from a source updates the selected Version in place, clearing attribution together while preserving values", async () => {
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
          nutritionSourceProvider: "USDA_FDC",
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

      expect(await prisma.dishVersion.count({ where: { dishId } })).toBe(1);
      const detached = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: baseVersionId },
      });
      expect(detached.nutritionSourceProvider).toBeNull();
      expect(detached.nutritionSourceId).toBeNull();
      expect(detached.nutritionSourceName).toBeNull();
      expect(decimalToNumber(detached.calories)).toBe(320);
      expect(decimalToNumber(detached.protein)).toBe(12);
      expect(detached.nutritionBasis).toBe("PER_OUTPUT_UNIT");
    });

    it("editing nutrition on a deliberately selected historical Version updates only that Version, never the current one", async () => {
      const user = await createTestUser();
      userId = user.id;

      const dishId = await dishService.createDish(
        userId,
        "RECIPE",
        content({ calories: 200 }),
      );
      const v1 = await loadDishWithVersion(dishId);
      const v1Id = v1.currentVersionId!;
      const v1Content = await unchangedContentFor(dishId, v1Id);

      // A material change creates V1.1, which becomes current.
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        {
          ...content({ calories: 200 }),
          sections: [
            {
              ...v1Content.sections[0],
              ingredients: [
                ...v1Content.sections[0].ingredients,
                {
                  name: "Pepper",
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
            },
          ],
        },
        "MINOR",
      );
      const afterMaterial = await loadDishWithVersion(dishId);
      const v1_1Id = afterMaterial.currentVersionId!;
      expect(v1_1Id).not.toBe(v1Id);

      // Now edit V1.0's own calories — historical, not current.
      const historicalContent = await unchangedContentFor(dishId, v1Id);
      await dishService.editDish(
        userId,
        dishId,
        v1Id,
        content({ ...historicalContent, calories: 999 }),
        undefined,
      );

      expect(await prisma.dishVersion.count({ where: { dishId } })).toBe(2);
      const v1After = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1Id },
      });
      expect(decimalToNumber(v1After.calories)).toBe(999);
      const v1_1After = await prisma.dishVersion.findUniqueOrThrow({
        where: { id: v1_1Id },
      });
      expect(decimalToNumber(v1_1After.calories)).toBe(200); // untouched
      const dishAfter = await loadDishWithVersion(dishId);
      expect(dishAfter.currentVersionId).toBe(v1_1Id); // current pointer unmoved
    });

    it("a material content change combined with a nutrition change creates a new Version carrying the submitted nutrition, leaving the old Version untouched", async () => {
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
        {
          ...content({ calories: 500 }),
          sections: [
            {
              ...unchanged.sections[0],
              ingredients: [
                ...unchanged.sections[0].ingredients,
                {
                  name: "Pepper",
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
            },
          ],
        },
        "MINOR",
      );

      const versions = await prisma.dishVersion.findMany({
        where: { dishId },
        orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
      });
      expect(versions).toHaveLength(2);
      expect(decimalToNumber(versions[0].calories)).toBe(200); // original untouched
      expect(decimalToNumber(versions[1].calories)).toBe(500); // new Version carries it
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
          nutritionSourceProvider: "USDA_FDC",
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
      expect(copy.currentVersion!.nutritionSourceProvider).toBe("USDA_FDC");
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
