import { describe, expect, it } from "vitest";
import { validateDishContentForPersistence } from "@/lib/dishes/validation-messages";
import type { DishContentInput } from "@/lib/dishes/schema";

const baseValues: DishContentInput = {
  title: "Family Recipe",
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
      position: 0,
    },
  ],
  partLinks: [],
};

describe("validateDishContentForPersistence", () => {
  it("passes valid content", () => {
    expect(validateDishContentForPersistence(baseValues)).toEqual({ ok: true });
  });

  // Task §9: reproduces the exact real-world failure mode — the live
  // migration's "Too big: expected string to have <=200 characters" with
  // no field context.
  it("identifies an over-length ingredient name by name and location, not a raw Zod message", () => {
    const overLength = "x".repeat(210);
    const values: DishContentInput = {
      ...baseValues,
      sections: [
        {
          ...baseValues.sections[0],
          name: "Sauce",
          ingredients: [
            { ...baseValues.sections[0].ingredients[0], name: overLength },
          ],
        },
      ],
    };

    const result = validateDishContentForPersistence(values);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.messages[0]).toContain("Ingredient name");
    expect(result.messages[0]).toContain('"Sauce"');
    expect(result.messages[0]).toContain("200 characters or fewer");
    expect(result.messages[0]).not.toContain("Too big");
  });

  it("identifies an over-length title", () => {
    const values: DishContentInput = { ...baseValues, title: "T".repeat(210) };
    const result = validateDishContentForPersistence(values);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.messages[0]).toBe("Title must be 200 characters or fewer.");
  });

  it("identifies an over-length instruction with its section", () => {
    const values: DishContentInput = {
      ...baseValues,
      sections: [
        {
          ...baseValues.sections[0],
          ingredients: [],
          instructions: [{ text: "x".repeat(2010) }],
        },
      ],
    };
    const result = validateDishContentForPersistence(values);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.messages[0]).toContain("Instruction 1");
    expect(result.messages[0]).toContain("2000 characters or fewer");
  });
});
