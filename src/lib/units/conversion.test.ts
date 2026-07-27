import { describe, it, expect } from "vitest";
import {
  convertQuantity,
  suggestSimplifiedUnit,
  normalizeUnitName,
} from "@/lib/units/conversion";

describe("normalizeUnitName", () => {
  it("recognizes common spellings", () => {
    expect(normalizeUnitName("tbsp")).toBe("tbsp");
    expect(normalizeUnitName("Tablespoons")).toBe("tbsp");
    expect(normalizeUnitName("Cups")).toBe("cup");
    expect(normalizeUnitName("g")).toBe("g");
    expect(normalizeUnitName("Kilograms")).toBe("kg");
  });

  it("returns null for an unrecognized unit", () => {
    expect(normalizeUnitName("pinch")).toBeNull();
    expect(normalizeUnitName(null)).toBeNull();
  });
});

describe("convertQuantity (§53.2)", () => {
  it("converts within the volume family", () => {
    expect(convertQuantity(3, "tsp", "tbsp")).toBeCloseTo(1, 5);
    expect(convertQuantity(16, "tbsp", "cup")).toBeCloseTo(1, 5);
  });

  it("converts within the weight family", () => {
    expect(convertQuantity(1000, "g", "kg")).toBeCloseTo(1, 5);
    expect(convertQuantity(16, "oz", "lb")).toBeCloseTo(1, 5);
  });

  it("converts temperature via the linear formula, not a factor table", () => {
    expect(convertQuantity(0, "C", "F")).toBeCloseTo(32, 5);
    expect(convertQuantity(212, "F", "C")).toBeCloseTo(100, 5);
  });

  it("never converts across families (§53.4 — no mass↔volume)", () => {
    expect(convertQuantity(100, "g", "cup")).toBeNull();
  });
});

describe("suggestSimplifiedUnit (§53.3)", () => {
  it("suggests tbsp for 6 tsp", () => {
    expect(suggestSimplifiedUnit(6, "tsp")).toEqual({
      quantity: 2,
      unit: "tbsp",
    });
  });

  it("suggests cup for 16 tbsp", () => {
    expect(suggestSimplifiedUnit(16, "tbsp")).toEqual({
      quantity: 1,
      unit: "cup",
    });
  });

  it("suggests kg for 1,000 g", () => {
    expect(suggestSimplifiedUnit(1000, "g")).toEqual({
      quantity: 1,
      unit: "kg",
    });
  });

  it("suggests nothing when no larger unit gives a clean result", () => {
    expect(suggestSimplifiedUnit(5, "tsp")).toBeNull();
  });

  it("suggests nothing for the largest unit in a progression", () => {
    expect(suggestSimplifiedUnit(3, "cup")).toBeNull();
  });

  it("suggests nothing for temperature (no simplification progression)", () => {
    expect(suggestSimplifiedUnit(212, "F")).toBeNull();
  });
});
