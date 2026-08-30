import { describe, expect, it } from "vitest";
import {
  parsePastedRecipe,
  parseSectionFromPastedText,
} from "@/lib/importExport/paste-parser";

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

  it("recognizes trailing 'to taste'/'as needed' as the amount, not part of the name (§10.5/§10.7)", () => {
    const result = parsePastedRecipe(
      ["Salted Snack", "Salt to taste", "Oil as needed", "1 cup nuts"].join(
        "\n",
      ),
    );

    const [salt, oil, nuts] = result.values.sections[0].ingredients;
    expect(salt).toMatchObject({
      quantity: null,
      unit: null,
      displayText: "To taste",
      name: "Salt",
    });
    expect(oil).toMatchObject({
      quantity: null,
      unit: null,
      displayText: "As needed",
      name: "Oil",
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

  // Importer live-QA polish pass (task §9) — the actual root cause of the
  // real Recipe Gallery migration's "Too big: expected string to have
  // <=200 characters" failures: once a Section's mode is already
  // "INGREDIENTS" (set by a short earlier ingredient line, as in genuinely
  // messy hand-typed personal-note recipes), a later long prose line used
  // to fall straight into `parseIngredientLine` regardless of length. The
  // `UNSTRUCTURED_LINE_LENGTH_THRESHOLD` (140) guard above only ever fired
  // while the Section's mode was still "UNKNOWN".
  it("flags a long line as needing review instead of producing an over-length ingredient name, even once the Section is already in ingredient mode", () => {
    const longLine =
      "a splash of the good olive oil my aunt brought back from her trip to Sicily last summer, the one with the green label and the hand-written note";
    expect(longLine.length).toBeGreaterThan(140);
    const result = parsePastedRecipe(
      ["Family Recipe", "1 cup rice", longLine].join("\n"),
    );

    expect(result.needsReviewCount).toBe(1);
    const reviewSection = result.values.sections.at(-1)!;
    expect(reviewSection.name).toBe("Needs review");
    expect(reviewSection.instructions[0].text).toBe(longLine);
    // The short ingredient before it is unaffected.
    expect(result.values.sections[0].ingredients).toHaveLength(1);
    expect(result.values.sections[0].ingredients[0].name).toBe("rice");
  });

  // Follow-up to task §9: the 140-char heuristic only targets lines the
  // parser found no leading quantity/unit for (raw line ≈ parsed name) — a
  // long line already in "INSTRUCTIONS" mode never reaches that check at
  // all, so it isn't flagged merely for being long.
  it("keeps a legitimate instruction over 140 characters as an instruction, not Needs review", () => {
    const longInstruction =
      "Whisk the eggs and sugar together in a large bowl until pale and doubled in volume, then fold in the sifted flour a third at a time to keep the batter light.";
    expect(longInstruction.length).toBeGreaterThan(140);
    const result = parsePastedRecipe(
      ["Family Recipe", "Instructions:", longInstruction].join("\n"),
    );

    expect(result.needsReviewCount).toBe(0);
    expect(result.values.sections[0].instructions).toHaveLength(1);
    expect(result.values.sections[0].instructions[0].text).toBe(
      longInstruction,
    );
  });

  // Follow-up to task §9: a line with a recognized leading quantity/unit is
  // real structured ingredient data, not unstructured prose — it's checked
  // against the schema's own 200-char name cap instead of the 140-char
  // heuristic, so a merely-verbose (but still parseable) ingredient isn't
  // flagged just for being longer than 140 characters.
  it("routes a parsed ingredient name over 200 characters to Needs review, even with a recognized quantity/unit", () => {
    const longName = "a".repeat(210);
    const longLine = `2 cups ${longName}`;
    const result = parsePastedRecipe(["Family Recipe", longLine].join("\n"));

    expect(result.needsReviewCount).toBe(1);
    expect(result.values.sections[0].ingredients).toHaveLength(0);
    const reviewSection = result.values.sections.at(-1)!;
    expect(reviewSection.name).toBe("Needs review");
    expect(reviewSection.instructions[0].text).toBe(longLine);
  });

  it("clamps an over-length title to the persistence schema's own limit instead of producing a value that would fail to save", () => {
    const longTitle = "T".repeat(250);
    const result = parsePastedRecipe([longTitle, "1 cup rice"].join("\n"));
    expect(result.values.title).toHaveLength(200);
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

  it("splits into named Sections on a heading directly above a separator, removing the separator", () => {
    const result = parsePastedRecipe(
      [
        "Chicken Bowl",
        "Chicken",
        "------------",
        "2 lbs chicken thighs",
        "1 tsp salt",
        "Sauce",
        "________",
        "1/4 cup soy sauce",
      ].join("\n"),
    );

    expect(result.values.sections.map((s) => s.name)).toEqual([
      "Chicken",
      "Sauce",
    ]);
    expect(result.values.sections[0].ingredients.map((i) => i.name)).toEqual([
      "chicken thighs",
      "salt",
    ]);
    expect(result.values.sections[1].ingredients.map((i) => i.name)).toEqual([
      "soy sauce",
    ]);
  });

  it("splits into unnamed Sections on a bare separator with no adjacent heading", () => {
    const result = parsePastedRecipe(
      [
        "Two Parts",
        "2 lbs chicken thighs",
        "------------",
        "1/4 cup soy sauce",
      ].join("\n"),
    );

    expect(result.values.sections).toHaveLength(2);
    expect(result.values.sections[0].name).toBeNull();
    expect(result.values.sections[1].name).toBeNull();
    expect(result.values.sections[0].ingredients[0].name).toBe(
      "chicken thighs",
    );
    expect(result.values.sections[1].ingredients[0].name).toBe("soy sauce");
  });

  it("recognizes a heading sandwiched between two separators", () => {
    const result = parsePastedRecipe(
      [
        "Layered Bowl",
        "------------",
        "Toppings",
        "------------",
        "1 tbsp sesame seeds",
      ].join("\n"),
    );

    expect(result.values.sections.map((s) => s.name)).toEqual(["Toppings"]);
    expect(result.values.sections[0].ingredients[0].name).toBe("sesame seeds");
  });

  it("recognizes a Markdown '# Title' as the recipe name and '## Section' headings as Sections", () => {
    const result = parsePastedRecipe(
      [
        "# Bulgogi Bowl",
        "",
        "## Rice",
        "",
        "- 1.5 cups white rice",
        "- Salt to taste",
        "",
        "1. Cook the rice.",
        "",
        "---",
        "",
        "## Chicken",
        "",
        "- Rotisserie chicken",
        "",
        "1. Heat the chicken.",
      ].join("\n"),
    );

    expect(result.values.title).toBe("Bulgogi Bowl");
    expect(result.values.sections.map((s) => s.name)).toEqual([
      "Rice",
      "Chicken",
    ]);
    expect(result.values.sections[0].ingredients.map((i) => i.name)).toEqual([
      "white rice",
      "Salt",
    ]);
    expect(result.values.sections[1].ingredients.map((i) => i.name)).toEqual([
      "Rotisserie chicken",
    ]);
  });

  it("does not misread an ordinary short ingredient line as a heading absent a nearby separator", () => {
    const result = parsePastedRecipe(
      ["Salted Snack", "Salt to taste", "1 cup nuts"].join("\n"),
    );

    expect(result.values.sections).toHaveLength(1);
    expect(result.values.sections[0].name).toBeNull();
  });
});

describe("parseSectionFromPastedText", () => {
  it("parses one pasted block into a single Section, using a leading heading as its name", () => {
    const section = parseSectionFromPastedText(
      [
        "Sauce:",
        "1/4 cup soy sauce",
        "1 tbsp rice vinegar",
        "",
        "1. Whisk together.",
      ].join("\n"),
    );

    expect(section.name).toBe("Sauce");
    expect(section.ingredients.map((i) => i.name)).toEqual([
      "soy sauce",
      "rice vinegar",
    ]);
    expect(section.instructions.map((i) => i.text)).toEqual([
      "Whisk together.",
    ]);
  });

  it("leaves the Section unnamed when the pasted block has no clear heading", () => {
    const section = parseSectionFromPastedText(
      ["1/4 cup soy sauce", "1 tbsp rice vinegar"].join("\n"),
    );

    expect(section.name).toBeNull();
    expect(section.ingredients).toHaveLength(2);
  });

  it("merges content from an internally separated block into the one Section", () => {
    const section = parseSectionFromPastedText(
      [
        "Chicken",
        "------------",
        "2 lbs chicken thighs",
        "Sauce",
        "------------",
        "1/4 cup soy sauce",
      ].join("\n"),
    );

    expect(section.name).toBe("Chicken");
    expect(section.ingredients.map((i) => i.name)).toEqual([
      "chicken thighs",
      "soy sauce",
    ]);
  });

  it("never invents linked Parts", () => {
    const section = parseSectionFromPastedText("1 cup rice");
    expect(section.partLinks).toEqual([]);
  });

  it("separates unnumbered Ingredients from conventionally-numbered Instructions in a collapsed-Section paste", () => {
    const section = parseSectionFromPastedText(
      [
        "Chicken",
        "1 lb chicken",
        "2 tbsp sauce",
        "Salt to taste",
        "",
        "1. Mix the marinade.",
        "2. Coat the chicken.",
        "3. Cook until done.",
      ].join("\n"),
    );

    expect(section.ingredients.map((i) => i.name)).toEqual([
      "Chicken",
      "chicken",
      "sauce",
      "Salt",
    ]);
    expect(section.instructions.map((i) => i.text)).toEqual([
      "Mix the marinade.",
      "Coat the chicken.",
      "Cook until done.",
    ]);
  });

  it("does not mistake numbered ingredient quantities for numbered Instructions", () => {
    const section = parseSectionFromPastedText(
      ["2 eggs", "1 cup flour", "3 tbsp sugar"].join("\n"),
    );

    expect(section.instructions).toEqual([]);
    expect(
      section.ingredients.map((i) => [i.quantity, i.unit, i.name]),
    ).toEqual([
      [2, null, "eggs"],
      [1, "cup", "flour"],
      [3, "tbsp", "sugar"],
    ]);
  });

  it("preserves the order of multiple numbered Instructions", () => {
    const section = parseSectionFromPastedText(
      ["1 cup rice", "1. First.", "2. Second.", "3. Third."].join("\n"),
    );

    expect(section.instructions.map((i) => i.text)).toEqual([
      "First.",
      "Second.",
      "Third.",
    ]);
  });

  // Regression coverage for the real "Add section from text" path: DishFrame's
  // own collapsed-Section copy output puts each ordinal marker ("1.") on its
  // own line, with the Instruction text on the following line — not the
  // single-line "1. Instruction text" convention. This is the exact
  // real-world pasted sample the fix targets.
  it("associates a standalone ordinal marker on its own line with the following line as its Instruction", () => {
    const section = parseSectionFromPastedText(
      [
        "4 cups Coleslaw Mix (green cabbage with carrots)",
        "2 tbsp Lime Juice",
        "0.5–1 tsp Salt",
        "0.25–0.5 cup Cilantro, chopped",
        "1 tsp Honey (optional) (optional)",
        "1.",
        "Chop cilantro",
        "2.",
        "Mix all ingredients in a bowl",
        "3.",
        "Let rest for 15 minutes, then strain.",
      ].join("\n"),
    );

    expect(section.ingredients.map((i) => i.name)).toEqual([
      "Coleslaw Mix (green cabbage with carrots)",
      "Lime Juice",
      "Salt",
      "Cilantro, chopped",
      "Honey (optional) (optional)",
    ]);
    expect(section.instructions.map((i) => i.text)).toEqual([
      "Chop cilantro",
      "Mix all ingredients in a bowl",
      "Let rest for 15 minutes, then strain.",
    ]);
  });
});
