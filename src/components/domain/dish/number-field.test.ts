import { describe, expect, it } from "vitest";
import { parseQuantityText } from "@/components/domain/dish/number-field";

describe("parseQuantityText", () => {
  it("parses whole numbers", () => {
    expect(parseQuantityText("2")).toBe(2);
  });

  it("parses decimals", () => {
    expect(parseQuantityText("0.5")).toBe(0.5);
    expect(parseQuantityText(".5")).toBe(0.5);
  });

  it("parses simple fractions", () => {
    expect(parseQuantityText("1/2")).toBe(0.5);
    expect(parseQuantityText("3/4")).toBe(0.75);
  });

  it("parses mixed numbers", () => {
    expect(parseQuantityText("1 1/2")).toBe(1.5);
    expect(parseQuantityText("2 3/4")).toBe(2.75);
  });

  it("tolerates extra spacing around the fraction slash", () => {
    expect(parseQuantityText("1 1 / 2")).toBe(1.5);
  });

  it("returns null for empty or incomplete text", () => {
    expect(parseQuantityText("")).toBeNull();
    expect(parseQuantityText("   ")).toBeNull();
    expect(parseQuantityText("1.")).toBeNull();
    expect(parseQuantityText("1/")).toBeNull();
  });

  it("returns null for a zero denominator instead of Infinity/NaN", () => {
    expect(parseQuantityText("1/0")).toBeNull();
    expect(parseQuantityText("1 1/0")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseQuantityText("to taste")).toBeNull();
  });

  // PRODUCT_SPEC.md §10.6a: normalized to 3 decimal places, matching the
  // database's `Decimal(12, 3)` column, so a repeating fraction never
  // commits as an unbounded JS float.
  describe("normalizes to 3 decimal places", () => {
    it("1/3", () => {
      expect(parseQuantityText("1/3")).toBe(0.333);
    });

    it("2/3", () => {
      expect(parseQuantityText("2/3")).toBe(0.667);
    });

    it("2 1/8 (already exact at 3 places)", () => {
      expect(parseQuantityText("2 1/8")).toBe(2.125);
    });

    it("a decimal already under 3 places is left unchanged", () => {
      expect(parseQuantityText("1.5")).toBe(1.5);
    });

    it("a decimal over 3 places is rounded", () => {
      expect(parseQuantityText("1.23456789")).toBe(1.235);
    });
  });
});
