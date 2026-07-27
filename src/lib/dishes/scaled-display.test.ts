import { describe, it, expect } from "vitest";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";

function ingredient(
  overrides: Partial<Parameters<typeof scaledIngredientDisplay>[0]> = {},
) {
  return {
    quantity: 2,
    quantityEnd: null,
    isApproximate: false,
    unit: "tbsp",
    displayText: null,
    name: "Soy sauce",
    preparationNote: null,
    ...overrides,
  };
}

describe("scaledIngredientDisplay", () => {
  it("uses authored style (verbatim decimal) when unscaled and no override", () => {
    const result = scaledIngredientDisplay(
      ingredient({ quantity: 1.5 }),
      1,
      null,
    );
    expect(result.line).toBe("1.5 tbsp Soy sauce");
  });

  it("uses calculated style (kitchen fraction) once scaled", () => {
    const result = scaledIngredientDisplay(
      ingredient({ quantity: 1 }),
      1.5,
      null,
    );
    expect(result.line).toBe("1 1/2 tbsp Soy sauce");
  });

  it("never scales a free-text ingredient (§52.4)", () => {
    const result = scaledIngredientDisplay(
      ingredient({ quantity: null, unit: null, displayText: "Salt to taste" }),
      2,
      null,
    );
    expect(result.line).toBe("Salt to taste Soy sauce");
    expect(result.suggestion).toBeNull();
  });

  it("suggests a simpler unit when one applies", () => {
    const result = scaledIngredientDisplay(
      ingredient({ quantity: 6, unit: "tsp" }),
      1,
      null,
    );
    expect(result.suggestion).toEqual({ quantity: 2, unit: "tbsp" });
  });

  it("applies a preferred-unit override instead of suggesting", () => {
    const result = scaledIngredientDisplay(
      ingredient({ quantity: 16, unit: "tbsp" }),
      1,
      "cup",
    );
    expect(result.line).toBe("1 cup Soy sauce");
    expect(result.suggestion).toBeNull();
  });

  it("computes the suggestion against the scaled quantity, not the authored one", () => {
    // 4 tsp authored, scaled 1.5x -> 6 tsp -> suggests 2 tbsp.
    const result = scaledIngredientDisplay(
      ingredient({ quantity: 4, unit: "tsp" }),
      1.5,
      null,
    );
    expect(result.suggestion).toEqual({ quantity: 2, unit: "tbsp" });
  });

  it("returns no suggestion or override effect for an unrecognized unit", () => {
    const result = scaledIngredientDisplay(
      ingredient({ quantity: 1, unit: "pinch" }),
      1,
      "cup",
    );
    expect(result.canonicalUnit).toBeNull();
    expect(result.suggestion).toBeNull();
    expect(result.line).toBe("1 pinch Soy sauce");
  });
});
