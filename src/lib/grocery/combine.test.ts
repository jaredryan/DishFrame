import { describe, it, expect } from "vitest";
import {
  canCombine,
  groupForCombination,
  normalizedIngredientName,
  type CombinableOccurrence,
} from "@/lib/grocery/combine";

function occ(
  key: string,
  name: string,
  quantity: number | null,
  unit: string | null,
  displayText: string | null = null,
  quantityEnd: number | null = null,
  isOptional = false,
): CombinableOccurrence {
  return { key, name, quantity, unit, displayText, quantityEnd, isOptional };
}

describe("normalizedIngredientName", () => {
  it("trims and lowercases", () => {
    expect(normalizedIngredientName("  Soy Sauce ")).toBe("soy sauce");
  });
});

describe("canCombine", () => {
  it("combines equivalent names with compatible convertible units (§61.1)", () => {
    const a = occ("a", "soy sauce", 2, "tbsp");
    const b = occ("b", "soy sauce", 0.25, "cup");
    expect(canCombine(a, b)).toBe(true);
  });

  it("combines equal count-based (unit-less) equivalent names", () => {
    const a = occ("a", "egg", 2, null);
    const b = occ("b", "egg", 1, null);
    expect(canCombine(a, b)).toBe(true);
  });

  it("does not combine an unrecognized unit like 'can' with a recognized one (§61.2)", () => {
    const a = occ("a", "tomatoes", 1, "can");
    const b = occ("b", "tomatoes", 400, "g");
    expect(canCombine(a, b)).toBe(false);
  });

  it("does not combine a count with a differently-shaped unit (§61.2)", () => {
    const a = occ("a", "onion", 2, null);
    const b = occ("b", "onion", 1, "cup");
    expect(canCombine(a, b)).toBe(false);
  });

  it("does not combine differing names (brand/variety/preparation difference)", () => {
    const a = occ("a", "diced tomatoes", 1, "can");
    const b = occ("b", "tomatoes", 400, "g");
    expect(canCombine(a, b)).toBe(false);
  });

  it("does not combine across incompatible unit families", () => {
    const a = occ("a", "butter", 1, "cup");
    const b = occ("b", "butter", 200, "g");
    expect(canCombine(a, b)).toBe(false);
  });

  it("never combines free-text quantities", () => {
    const a = occ("a", "salt", null, null, "to taste");
    const b = occ("b", "salt", null, null, "to taste");
    expect(canCombine(a, b)).toBe(false);
  });

  it("never combines quantity-less rows", () => {
    const a = occ("a", "salt", null, null);
    const b = occ("b", "salt", null, null);
    expect(canCombine(a, b)).toBe(false);
  });

  it("never combines a range quantity, even with an otherwise-matching row", () => {
    const a = occ("a", "onion", 1, "cup", null, 2);
    const b = occ("b", "onion", 1, "cup");
    expect(canCombine(a, b)).toBe(false);
  });

  it("combines two required contributions with matching name/quantity/unit", () => {
    const a = occ("a", "cilantro", 1, "cup", null, null, false);
    const b = occ("b", "cilantro", 1, "cup", null, null, false);
    expect(canCombine(a, b)).toBe(true);
  });

  it("combines two optional contributions with matching name/quantity/unit", () => {
    const a = occ("a", "cilantro", 1, "cup", null, null, true);
    const b = occ("b", "cilantro", 1, "cup", null, null, true);
    expect(canCombine(a, b)).toBe(true);
  });

  it("never combines a required contribution with an otherwise-identical optional one (Slice 12 correction)", () => {
    const required = occ("a", "cilantro", 1, "cup", null, null, false);
    const optional = occ("b", "cilantro", 1, "cup", null, null, true);
    expect(canCombine(required, optional)).toBe(false);
  });
});

describe("groupForCombination", () => {
  it("sums combinable quantities into the first member's unit", () => {
    const groups = groupForCombination([
      occ("a", "soy sauce", 2, "tbsp"),
      occ("b", "soy sauce", 0.25, "cup"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].unit).toBe("tbsp");
    expect(groups[0].totalQuantity).toBeCloseTo(6, 3); // 2 tbsp + 4 tbsp
    expect(groups[0].members.map((m) => m.key)).toEqual(["a", "b"]);
  });

  it("keeps ambiguous items in separate singleton groups", () => {
    const groups = groupForCombination([
      occ("a", "tomatoes", 1, "can"),
      occ("b", "tomatoes", 400, "g"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("sums count-based equivalent names", () => {
    const groups = groupForCombination([
      occ("a", "egg", 2, null),
      occ("b", "egg", 1, null),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].totalQuantity).toBe(3);
    expect(groups[0].unit).toBeNull();
  });

  it("keeps free-text and quantity-less occurrences as their own singleton groups", () => {
    const groups = groupForCombination([
      occ("a", "salt", null, null, "to taste"),
      occ("b", "salt", null, null, "to taste"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("groups three-way combinable occurrences transitively", () => {
    const groups = groupForCombination([
      occ("a", "butter", 1, "tbsp"),
      occ("b", "butter", 1, "tsp"),
      occ("c", "butter", 1, "tbsp"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(3);
  });

  it("keeps a required and an otherwise-identical optional occurrence in separate groups (Slice 12 correction)", () => {
    const groups = groupForCombination([
      occ("a", "cilantro", 1, "cup", null, null, false),
      occ("b", "cilantro", 1, "cup", null, null, true),
    ]);
    expect(groups).toHaveLength(2);
  });
});
