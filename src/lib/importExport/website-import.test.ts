import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractRecipeJsonLd,
  mapSchemaOrgRecipe,
  parseIso8601DurationToMinutes,
  proposeImportFromUrl,
} from "@/lib/importExport/website-import";
import { fetchHtmlSafely } from "@/lib/importExport/url-fetch";

vi.mock("@/lib/importExport/url-fetch", () => ({
  fetchHtmlSafely: vi.fn(),
}));

const mockedFetchHtmlSafely = vi.mocked(fetchHtmlSafely);

function htmlWithJsonLd(json: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(json)}</script></head><body></body></html>`;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("extractRecipeJsonLd", () => {
  it("finds a Recipe node in a plain JSON-LD object", () => {
    const html = htmlWithJsonLd({ "@type": "Recipe", name: "Tacos" });
    expect(extractRecipeJsonLd(html)?.name).toBe("Tacos");
  });

  it("finds a Recipe node inside a top-level array", () => {
    const html = htmlWithJsonLd([
      { "@type": "WebPage" },
      { "@type": "Recipe", name: "Tacos" },
    ]);
    expect(extractRecipeJsonLd(html)?.name).toBe("Tacos");
  });

  it("finds a Recipe node nested inside @graph", () => {
    const html = htmlWithJsonLd({
      "@graph": [
        { "@type": "Organization" },
        { "@type": "Recipe", name: "Tacos" },
      ],
    });
    expect(extractRecipeJsonLd(html)?.name).toBe("Tacos");
  });

  it("finds a Recipe node across multiple JSON-LD script blocks", () => {
    const html =
      htmlWithJsonLd({ "@type": "Organization" }) +
      htmlWithJsonLd({ "@type": "Recipe", name: "Tacos" });
    expect(extractRecipeJsonLd(html)?.name).toBe("Tacos");
  });

  it("matches a Recipe within an array-valued @type", () => {
    const html = htmlWithJsonLd({
      "@type": ["Thing", "Recipe"],
      name: "Tacos",
    });
    expect(extractRecipeJsonLd(html)?.name).toBe("Tacos");
  });

  it("returns null when no script has usable JSON-LD", () => {
    const html = "<html><body>No structured data here</body></html>";
    expect(extractRecipeJsonLd(html)).toBeNull();
  });

  it("skips a malformed JSON-LD block and keeps looking", () => {
    const html =
      `<script type="application/ld+json">{not valid json</script>` +
      htmlWithJsonLd({ "@type": "Recipe", name: "Tacos" });
    expect(extractRecipeJsonLd(html)?.name).toBe("Tacos");
  });

  it("returns null when JSON-LD is present but has no Recipe type", () => {
    const html = htmlWithJsonLd({ "@type": "WebPage", name: "Not a recipe" });
    expect(extractRecipeJsonLd(html)).toBeNull();
  });
});

describe("parseIso8601DurationToMinutes", () => {
  it("parses hours and minutes", () => {
    expect(parseIso8601DurationToMinutes("PT1H30M")).toBe(90);
  });
  it("parses minutes only", () => {
    expect(parseIso8601DurationToMinutes("PT15M")).toBe(15);
  });
  it("returns null for an unparseable value", () => {
    expect(parseIso8601DurationToMinutes("15 minutes")).toBeNull();
  });
});

describe("mapSchemaOrgRecipe", () => {
  it("maps a flat ingredient/instruction Recipe", () => {
    const result = mapSchemaOrgRecipe({
      "@type": "Recipe",
      name: "Grilled Cheese",
      description: "A classic.",
      recipeYield: "2 servings",
      recipeCuisine: "American",
      prepTime: "PT5M",
      cookTime: "PT10M",
      recipeIngredient: ["2 slices bread", "1 cup shredded cheddar"],
      recipeInstructions: ["Butter the bread.", "Cook until golden."],
    });

    expect(result?.values.title).toBe("Grilled Cheese");
    expect(result?.values.description).toBe("A classic.");
    expect(result?.values.yieldQuantity).toBe(2);
    expect(result?.values.yieldUnit).toBe("servings");
    expect(result?.values.cuisine).toBe("American");
    expect(result?.values.prepTimeMinutes).toBe(5);
    expect(result?.values.cookTimeMinutes).toBe(10);
    expect(result?.values.sections).toHaveLength(1);
    expect(
      result?.values.sections[0].ingredients.map((i) => [
        i.quantity,
        i.unit,
        i.name,
      ]),
    ).toEqual([
      [2, "slices", "bread"],
      [1, "cup", "shredded cheddar"],
    ]);
    expect(result?.values.sections[0].instructions.map((i) => i.text)).toEqual([
      "Butter the bread.",
      "Cook until golden.",
    ]);
  });

  it("maps HowToStep instructions", () => {
    const result = mapSchemaOrgRecipe({
      "@type": "Recipe",
      name: "Tacos",
      recipeIngredient: ["1 lb ground beef"],
      recipeInstructions: [
        { "@type": "HowToStep", text: "Brown the beef." },
        { "@type": "HowToStep", text: "Assemble tacos." },
      ],
    });

    expect(result?.values.sections[0].instructions.map((i) => i.text)).toEqual([
      "Brown the beef.",
      "Assemble tacos.",
    ]);
  });

  it("preserves HowToSection names as Section names", () => {
    const result = mapSchemaOrgRecipe({
      "@type": "Recipe",
      name: "Layered Dip",
      recipeIngredient: ["1 can beans", "1 cup cheese"],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Bean layer",
          itemListElement: [
            { "@type": "HowToStep", text: "Spread the beans." },
          ],
        },
        {
          "@type": "HowToSection",
          name: "Cheese layer",
          itemListElement: [{ "@type": "HowToStep", text: "Add cheese." }],
        },
      ],
    });

    const sectionNames = result?.values.sections.map((s) => s.name);
    expect(sectionNames).toContain("Bean layer");
    expect(sectionNames).toContain("Cheese layer");
    const beanSection = result?.values.sections.find(
      (s) => s.name === "Bean layer",
    );
    expect(beanSection?.instructions.map((i) => i.text)).toEqual([
      "Spread the beans.",
    ]);
  });

  it("maps nutrition fields when present", () => {
    const result = mapSchemaOrgRecipe({
      "@type": "Recipe",
      name: "Tacos",
      recipeIngredient: ["1 lb beef"],
      recipeInstructions: ["Cook it."],
      nutrition: {
        "@type": "NutritionInformation",
        calories: "270 calories",
        proteinContent: "9g",
        carbohydrateContent: "30g",
        fatContent: "10g",
      },
    });

    expect(result?.values.calories).toBe(270);
    expect(result?.values.protein).toBe(9);
    expect(result?.values.carbs).toBe(30);
    expect(result?.values.fat).toBe(10);
  });

  it("returns null when there is nothing usable to import", () => {
    const result = mapSchemaOrgRecipe({ "@type": "Recipe", name: "Empty" });
    expect(result).toBeNull();
  });
});

describe("proposeImportFromUrl", () => {
  it("returns an error when the fetch boundary rejects the URL", async () => {
    mockedFetchHtmlSafely.mockResolvedValue({
      ok: false,
      message: "That URL points to a private or internal address.",
    });

    const result = await proposeImportFromUrl("http://169.254.169.254/");
    expect(result.status).toBe("error");
  });

  it("returns an error when the page has no usable Recipe JSON-LD", async () => {
    mockedFetchHtmlSafely.mockResolvedValue({
      ok: true,
      html: "<html><body>No recipe here</body></html>",
    });

    const result = await proposeImportFromUrl("https://example.com/blog-post");
    expect(result.status).toBe("error");
  });

  it("returns a successful parse result for a page with Recipe JSON-LD", async () => {
    mockedFetchHtmlSafely.mockResolvedValue({
      ok: true,
      html: htmlWithJsonLd({
        "@type": "Recipe",
        name: "Tacos",
        recipeIngredient: ["1 lb beef"],
        recipeInstructions: ["Cook it."],
      }),
    });

    const result = await proposeImportFromUrl("https://example.com/tacos");
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.result.values.title).toBe("Tacos");
    }
  });
});
