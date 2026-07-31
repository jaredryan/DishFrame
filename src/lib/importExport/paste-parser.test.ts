import { describe, expect, it } from "vitest";
import { parsePastedRecipe } from "@/lib/importExport/paste-parser";

describe("parsePastedRecipe", () => {
  it("recognizes a title, bulleted ingredients, and numbered steps", () => {
    const result = parsePastedRecipe(
      [
        "Grilled Cheese",
        "",
        "- 2 slices bread",
        "- 1 cup shredded cheddar",
        "",
        "1. Butter the bread.",
        "2. Cook until golden on both sides.",
      ].join("\n"),
    );

    expect(result.values.title).toBe("Grilled Cheese");
    expect(result.values.sections).toHaveLength(1);
    const section = result.values.sections[0];
    expect(
      section.ingredients.map((i) => [i.quantity, i.unit, i.name]),
    ).toEqual([
      [2, "slices", "bread"],
      [1, "cup", "shredded cheddar"],
    ]);
    expect(section.instructions.map((i) => i.text)).toEqual([
      "Butter the bread.",
      "Cook until golden on both sides.",
    ]);
    expect(result.needsReviewCount).toBe(0);
  });

  it("recognizes Ingredients:/Instructions: headings without bullets", () => {
    const result = parsePastedRecipe(
      [
        "Simple Soup",
        "Ingredients:",
        "2 cups broth",
        "1 onion",
        "Instructions:",
        "Simmer everything.",
        "Season to taste.",
      ].join("\n"),
    );

    const section = result.values.sections[0];
    expect(section.ingredients).toHaveLength(2);
    expect(section.instructions.map((i) => i.text)).toEqual([
      "Simmer everything.",
      "Season to taste.",
    ]);
  });

  it("starts a new named Section on a generic colon-terminated heading", () => {
    const result = parsePastedRecipe(
      [
        "Layered Bowl",
        "For the sauce:",
        "1 tbsp soy sauce",
        "For the rice:",
        "1 cup rice",
      ].join("\n"),
    );

    expect(result.values.sections.map((s) => s.name)).toEqual([
      "For the sauce",
      "For the rice",
    ]);
    expect(result.values.sections[0].ingredients[0].name).toBe("soy sauce");
    expect(result.values.sections[1].ingredients[0].name).toBe("rice");
  });

  it("falls back to free text when no leading quantity is recognized (§10.7)", () => {
    const result = parsePastedRecipe(
      ["Salted Snack", "Salt to taste", "1 cup nuts"].join("\n"),
    );

    const [salt, nuts] = result.values.sections[0].ingredients;
    expect(salt).toMatchObject({
      quantity: null,
      unit: null,
      name: "Salt to taste",
    });
    expect(nuts).toMatchObject({ quantity: 1, unit: "cup", name: "nuts" });
  });

  it("parses a range quantity", () => {
    const result = parsePastedRecipe(
      ["Lime Chicken", "2-3 tbsp lime juice"].join("\n"),
    );
    const ingredient = result.values.sections[0].ingredients[0];
    expect(ingredient.quantity).toBe(2);
    expect(ingredient.quantityEnd).toBe(3);
    expect(ingredient.unit).toBe("tbsp");
    expect(ingredient.name).toBe("lime juice");
  });

  it("parses an approximate quantity", () => {
    const result = parsePastedRecipe(
      ["Vinaigrette", "about 2 tbsp vinegar"].join("\n"),
    );
    const ingredient = result.values.sections[0].ingredients[0];
    expect(ingredient.isApproximate).toBe(true);
    expect(ingredient.quantity).toBe(2);
    expect(ingredient.unit).toBe("tbsp");
    expect(ingredient.name).toBe("vinegar");
  });

  it("parses fractions and mixed numbers the same way the editor's number field does", () => {
    const result = parsePastedRecipe(
      ["Broth", "1/2 cup rice", "1 1/2 cups broth"].join("\n"),
    );
    const [rice, broth] = result.values.sections[0].ingredients;
    expect(rice.quantity).toBe(0.5);
    expect(broth.quantity).toBe(1.5);
  });

  it("preserves the original source line as originalImportedText", () => {
    const result = parsePastedRecipe(
      ["Title", "- 2 Tbsp. Olive Oil"].join("\n"),
    );
    expect(result.values.sections[0].ingredients[0].originalImportedText).toBe(
      "- 2 Tbsp. Olive Oil",
    );
  });

  it("flags a long unstructured leading line as needing review instead of guessing", () => {
    const longLine =
      "This recipe was passed down from my grandmother and involves a very long story about how she used to make it every Sunday afternoon in the summer";
    const result = parsePastedRecipe(["Family Recipe", longLine].join("\n"));

    expect(result.needsReviewCount).toBe(1);
    const reviewSection = result.values.sections.at(-1)!;
    expect(reviewSection.name).toBe("Needs review");
    expect(reviewSection.instructions[0].text).toBe(longLine);
  });

  it("never invents linked Parts", () => {
    const result = parsePastedRecipe(["Title", "1 cup rice"].join("\n"));
    expect(result.values.partLinks).toEqual([]);
    for (const section of result.values.sections) {
      expect(section.partLinks).toEqual([]);
    }
  });

  it("handles empty input without throwing", () => {
    const result = parsePastedRecipe("");
    expect(result.values.title).toBe("");
    expect(result.values.sections).toHaveLength(1);
    expect(result.needsReviewCount).toBe(0);
  });
});
