import { describe, it, expect } from "vitest";
import {
  scaleQuantity,
  scaleIngredientQuantity,
  toKitchenFraction,
  formatCalculatedQuantity,
} from "@/lib/units/scaling";

describe("scaleQuantity", () => {
  it("scales a single value (§52.1)", () => {
    expect(scaleQuantity(2, 1.5)).toBe(3);
  });

  it("scales a range endpoint (§52.2)", () => {
    expect(scaleQuantity(2, 1.5)).toBe(3);
    expect(scaleQuantity(3, 1.5)).toBe(4.5);
  });

  it("does not round counts to whole numbers (§52.5)", () => {
    expect(scaleQuantity(1, 1.5)).toBe(1.5);
  });

  it("normalizes to 3 decimal places", () => {
    expect(scaleQuantity(1 / 3, 1)).toBe(0.333);
  });
});

describe("scaleIngredientQuantity", () => {
  const base = {
    quantity: 2,
    quantityEnd: null as number | null,
    isApproximate: false,
    displayText: null as string | null,
  };

  it("scales quantity and quantityEnd together", () => {
    const result = scaleIngredientQuantity(
      { ...base, quantity: 2, quantityEnd: 3 },
      1.5,
    );
    expect(result.quantity).toBe(3);
    expect(result.quantityEnd).toBe(4.5);
  });

  it("never scales a free-text quantity (§52.4)", () => {
    const result = scaleIngredientQuantity(
      { ...base, quantity: null, displayText: "Salt to taste" },
      2,
    );
    expect(result.displayText).toBe("Salt to taste");
    expect(result.quantity).toBeNull();
  });

  it("preserves the approximate flag through scaling (§52.3)", () => {
    const result = scaleIngredientQuantity(
      { ...base, quantity: 2, isApproximate: true },
      1.5,
    );
    expect(result.isApproximate).toBe(true);
    expect(result.quantity).toBe(3);
  });

  it("leaves a null quantity untouched", () => {
    const result = scaleIngredientQuantity({ ...base, quantity: null }, 2);
    expect(result.quantity).toBeNull();
  });
});

describe("toKitchenFraction", () => {
  it("renders a clean whole number", () => {
    expect(toKitchenFraction(3)).toBe("3");
  });

  it("renders a simple fraction", () => {
    expect(toKitchenFraction(0.5)).toBe("1/2");
    expect(toKitchenFraction(0.333)).toBe("1/3");
    expect(toKitchenFraction(0.25)).toBe("1/4");
    expect(toKitchenFraction(0.125)).toBe("1/8");
  });

  it("renders a mixed number", () => {
    expect(toKitchenFraction(1.5)).toBe("1 1/2");
  });

  it("returns null for a value with no clean kitchen fraction", () => {
    // 1/7 has no representation in {2,3,4,6,8} within tolerance.
    expect(toKitchenFraction(1 / 7)).toBeNull();
  });
});

describe("formatCalculatedQuantity (§52.7)", () => {
  it("prefers a kitchen fraction when one applies", () => {
    expect(formatCalculatedQuantity(1.5)).toBe("1 1/2");
  });

  it("falls back to a concise decimal otherwise", () => {
    expect(formatCalculatedQuantity(1.234)).toBe("1.23");
  });

  it("scales a count to a fractional value without rounding away precision", () => {
    // §52.5's literal example: "1 egg → 1.5 eggs".
    expect(formatCalculatedQuantity(scaleQuantity(1, 1.5))).toBe("1 1/2");
  });
});
