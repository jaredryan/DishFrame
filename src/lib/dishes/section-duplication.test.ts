import { describe, expect, it } from "vitest";
import { duplicateSectionContent } from "@/lib/dishes/section-duplication";
import type { SectionInput } from "@/lib/dishes/schema";

function section(overrides: Partial<SectionInput> = {}): SectionInput {
  return {
    lineageId: "section-1",
    name: "Sauce",
    guidanceNote: "Best made ahead",
    ingredients: [],
    instructions: [],
    partLinks: [],
    position: 0,
    ...overrides,
  };
}

describe("duplicateSectionContent", () => {
  it("copies name, guidance note, ingredients, and instructions", () => {
    const original = section({
      ingredients: [
        {
          lineageId: "ingredient-1",
          name: "Soy sauce",
          quantity: 0.25,
          quantityEnd: null,
          isApproximate: false,
          unit: "cup",
          displayText: null,
          preparationNote: null,
          isOptional: false,
          substitute: null,
        },
      ],
      instructions: [{ lineageId: "instruction-1", text: "Whisk together." }],
    });

    const duplicate = duplicateSectionContent(original);

    expect(duplicate.name).toBe("Sauce");
    expect(duplicate.guidanceNote).toBe("Best made ahead");
    expect(duplicate.ingredients.map((i) => i.name)).toEqual(["Soy sauce"]);
    expect(duplicate.instructions.map((i) => i.text)).toEqual([
      "Whisk together.",
    ]);
  });

  it("strips lineageId from the Section, its ingredients, substitutes, and instructions", () => {
    const original = section({
      ingredients: [
        {
          lineageId: "ingredient-1",
          name: "Butter",
          quantity: 1,
          quantityEnd: null,
          isApproximate: false,
          unit: "tbsp",
          displayText: null,
          preparationNote: null,
          isOptional: false,
          substitute: {
            lineageId: "substitute-1",
            name: "Margarine",
            quantity: 1,
            quantityEnd: null,
            isApproximate: false,
            unit: "tbsp",
            displayText: null,
            preparationNote: null,
          },
        },
      ],
      instructions: [{ lineageId: "instruction-1", text: "Melt it." }],
    });

    const duplicate = duplicateSectionContent(original);

    expect(duplicate.lineageId).toBeUndefined();
    expect(duplicate.ingredients[0].lineageId).toBeUndefined();
    expect(duplicate.ingredients[0].substitute?.lineageId).toBeUndefined();
    expect(duplicate.instructions[0].lineageId).toBeUndefined();
  });

  it("does not carry nested linked Parts over, avoiding a duplicate direct link on save", () => {
    const original = section({
      partLinks: [
        {
          lineageId: "link-1",
          targetDishId: "dish-1",
          targetDishVersionId: "version-1",
          position: 0,
          multiplier: 1,
        },
      ],
    });

    const duplicate = duplicateSectionContent(original);

    expect(duplicate.partLinks).toEqual([]);
  });

  it("does not mutate the original section's arrays", () => {
    const original = section({
      ingredients: [
        {
          lineageId: "ingredient-1",
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
    });

    const duplicate = duplicateSectionContent(original);
    duplicate.ingredients[0].name = "Changed";

    expect(original.ingredients[0].name).toBe("Salt");
  });
});
