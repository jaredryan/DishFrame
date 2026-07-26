import { describe, expect, it } from "vitest";
import {
  removeEmptySections,
  hasMinimumContent,
  type SectionInput,
} from "@/lib/dishes/schema";

function section(overrides: Partial<SectionInput> = {}): SectionInput {
  return {
    name: null,
    guidanceNote: null,
    ingredients: [],
    instructions: [],
    ...overrides,
  };
}

function ingredient(name = "Salt") {
  return {
    name,
    quantity: null,
    quantityEnd: null,
    isApproximate: false,
    unit: null,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
  };
}

function instruction(text = "Stir.") {
  return { text };
}

describe("removeEmptySections", () => {
  it("drops a Section with no ingredients and no instructions", () => {
    const sections = [
      section({ name: "Sauce", ingredients: [ingredient()] }),
      section({ name: "Empty" }),
    ];

    const result = removeEmptySections(sections);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Sauce");
  });

  it("keeps a Section that has only an instruction and no ingredients", () => {
    const sections = [section({ instructions: [instruction()] })];

    expect(removeEmptySections(sections)).toHaveLength(1);
  });

  it("returns an empty array when every Section is empty", () => {
    expect(removeEmptySections([section(), section()])).toEqual([]);
  });
});

describe("hasMinimumContent", () => {
  it("is true when at least one Section has an ingredient", () => {
    const sections = [section({ ingredients: [ingredient()] })];
    expect(hasMinimumContent(sections)).toBe(true);
  });

  it("is true when at least one Section has an instruction", () => {
    const sections = [section({ instructions: [instruction()] })];
    expect(hasMinimumContent(sections)).toBe(true);
  });

  it("is false for a single unnamed empty default Section", () => {
    expect(hasMinimumContent([section()])).toBe(false);
  });

  it("is false for no Sections at all", () => {
    expect(hasMinimumContent([])).toBe(false);
  });
});
