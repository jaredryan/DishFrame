import { describe, it, expect } from "vitest";
import {
  ingredientEffectiveNutrition,
  overrideEffectiveNutrition,
  combineEffectiveNutrition,
  computeSectionEffective,
  computeDishEffective,
  scaleEffectiveNutrition,
  toRawNutritionValues,
  NONE_NUTRITION,
  type RawNutritionValues,
} from "@/lib/nutrition/calculate";

const NONE: RawNutritionValues = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  moreNutrients: null,
};

function values(partial: Partial<RawNutritionValues>): RawNutritionValues {
  return { ...NONE, ...partial };
}

describe("ingredientEffectiveNutrition", () => {
  it("is NONE when nothing is entered", () => {
    expect(ingredientEffectiveNutrition(NONE)).toEqual(NONE_NUTRITION);
  });

  it("is COMPLETE with any single field entered", () => {
    const result = ingredientEffectiveNutrition(values({ protein: 5 }));
    expect(result.state).toBe("COMPLETE");
    expect(result.totals.protein).toBe(5);
    expect(result.totals.calories).toBeNull();
  });
});

describe("overrideEffectiveNutrition", () => {
  it("is null (inactive) when every field is empty", () => {
    expect(overrideEffectiveNutrition(NONE)).toBeNull();
    expect(overrideEffectiveNutrition(null)).toBeNull();
  });

  it("is OVERRIDE, carrying values through unchanged, when any field is set", () => {
    const result = overrideEffectiveNutrition(values({ calories: 300 }));
    expect(result).toEqual({
      totals: values({ calories: 300 }),
      state: "OVERRIDE",
    });
  });
});

describe("ingredient -> Section -> Dish aggregation", () => {
  it("sums calculated ingredient contributions at the Section level", () => {
    const section = computeSectionEffective(null, [
      values({ calories: 100, protein: 10 }),
      values({ calories: 50, protein: 5 }),
    ]);
    expect(section.state).toBe("COMPLETE");
    expect(section.totals.calories).toBe(150);
    expect(section.totals.protein).toBe(15);
  });

  it("sums calculated Section totals at the Dish level", () => {
    const sectionA = computeSectionEffective(null, [values({ calories: 100 })]);
    const sectionB = computeSectionEffective(null, [values({ calories: 200 })]);
    const dish = computeDishEffective(null, [sectionA, sectionB]);
    expect(dish.state).toBe("COMPLETE");
    expect(dish.totals.calories).toBe(300);
  });

  it("sums More nutrients by key across contributors", () => {
    const section = computeSectionEffective(null, [
      values({
        moreNutrients: [{ key: "fiber", label: "Fiber", unit: "g", value: 2 }],
      }),
      values({
        moreNutrients: [{ key: "fiber", label: "Fiber", unit: "g", value: 3 }],
      }),
    ]);
    expect(section.totals.moreNutrients).toEqual([
      { key: "fiber", label: "Fiber", unit: "g", value: 5 },
    ]);
  });

  it("is NONE for an empty Section (nothing to be missing)", () => {
    expect(computeSectionEffective(null, [])).toEqual(NONE_NUTRITION);
  });
});

describe("override replacement semantics", () => {
  it("a Section override replaces its calculated ingredient sum, not adds to it", () => {
    const section = computeSectionEffective(values({ calories: 999 }), [
      values({ calories: 100 }),
      values({ calories: 50 }),
    ]);
    expect(section.state).toBe("OVERRIDE");
    expect(section.totals.calories).toBe(999);
  });

  it("a whole-Dish override replaces the calculated Section sum, not adds to it", () => {
    const sectionA = computeSectionEffective(null, [values({ calories: 100 })]);
    const dish = computeDishEffective(values({ calories: 500 }), [sectionA]);
    expect(dish.state).toBe("OVERRIDE");
    expect(dish.totals.calories).toBe(500);
  });

  it("removing a Section override restores the calculated value", () => {
    const withOverride = computeSectionEffective(values({ calories: 999 }), [
      values({ calories: 100 }),
    ]);
    expect(withOverride.totals.calories).toBe(999);
    const removed = computeSectionEffective(null, [values({ calories: 100 })]);
    expect(removed.state).toBe("COMPLETE");
    expect(removed.totals.calories).toBe(100);
  });

  it("removing a whole-Dish override restores the calculated Section sum", () => {
    const sectionA = computeSectionEffective(null, [values({ calories: 100 })]);
    const removed = computeDishEffective(null, [sectionA]);
    expect(removed.state).toBe("COMPLETE");
    expect(removed.totals.calories).toBe(100);
  });
});

describe("nested Part contribution", () => {
  it("contributes a Part's own effective nutrition as one value, without re-summing its ingredients", () => {
    // Part B has an override — its "real" ingredient sum (which this test
    // never even constructs) must never leak through; only the override
    // counts, exactly once.
    const partBEffective = overrideEffectiveNutrition(
      values({ calories: 400 }),
    )!;
    const section = computeSectionEffective(
      null,
      [values({ calories: 100 })],
      [partBEffective],
    );
    expect(section.totals.calories).toBe(500);
  });

  it("scales a nested Part's contribution by its PartLink multiplier", () => {
    const partBEffective = overrideEffectiveNutrition(
      values({ calories: 200, protein: 10 }),
    )!;
    const scaled = scaleEffectiveNutrition(partBEffective, 1.5);
    expect(scaled.totals.calories).toBe(300);
    expect(scaled.totals.protein).toBe(15);
    expect(scaled.state).toBe("OVERRIDE");
  });

  it("a Part with no nutrition data still counts as a real contributor with unknown data (Partial), but its absence contributes 0, not a blocking error", () => {
    const section = computeSectionEffective(
      null,
      [values({ calories: 100 })],
      [NONE_NUTRITION],
    );
    expect(section.totals.calories).toBe(100);
    expect(section.state).toBe("PARTIAL");
  });
});

describe("proportional scaling", () => {
  it("scales every primary nutrient by the same factor", () => {
    const base = ingredientEffectiveNutrition(
      values({ calories: 200, protein: 10, carbs: 20, fat: 5 }),
    );
    const scaled = scaleEffectiveNutrition(base, 2);
    expect(scaled.totals).toEqual(
      values({ calories: 400, protein: 20, carbs: 40, fat: 10 }),
    );
  });

  it("is a no-op for NONE (nothing to scale)", () => {
    expect(scaleEffectiveNutrition(NONE_NUTRITION, 3)).toEqual(NONE_NUTRITION);
  });

  it("is a no-op for factor 1", () => {
    const base = ingredientEffectiveNutrition(values({ calories: 200 }));
    expect(scaleEffectiveNutrition(base, 1)).toBe(base);
  });
});

describe("partial/incomplete propagation", () => {
  it("is PARTIAL when some contributing ingredients have data and some don't", () => {
    const section = computeSectionEffective(null, [
      values({ calories: 100 }),
      NONE,
    ]);
    expect(section.state).toBe("PARTIAL");
    expect(section.totals.calories).toBe(100);
  });

  it("is NONE (not Partial) when nothing anywhere has data", () => {
    const section = computeSectionEffective(null, [NONE, NONE]);
    expect(section.state).toBe("NONE");
  });

  it("propagates Partial upward from a Section into the Dish total", () => {
    const partialSection = computeSectionEffective(null, [
      values({ calories: 100 }),
      NONE,
    ]);
    const completeSection = computeSectionEffective(null, [
      values({ calories: 50 }),
    ]);
    const dish = computeDishEffective(null, [partialSection, completeSection]);
    expect(dish.state).toBe("PARTIAL");
    expect(dish.totals.calories).toBe(150);
  });

  it("propagates Partial upward from an incomplete nested Part contribution", () => {
    const partBEffective = computeSectionEffective(null, [
      values({ calories: 40 }),
      NONE,
    ]);
    expect(partBEffective.state).toBe("PARTIAL");
    const parentSection = computeSectionEffective(
      null,
      [values({ calories: 100 })],
      [partBEffective],
    );
    expect(parentSection.state).toBe("PARTIAL");
    expect(parentSection.totals.calories).toBe(140);
  });
});

describe("override completeness", () => {
  it("an active override makes its own level COMPLETE-equivalent (OVERRIDE) even with missing descendants", () => {
    const dish = computeDishEffective(values({ calories: 1000 }), [
      computeSectionEffective(null, [NONE]), // NONE section — nothing to sum
    ]);
    expect(dish.state).toBe("OVERRIDE");
    expect(dish.totals.calories).toBe(1000);
  });

  it("a Section override does not get downgraded to Partial by its own (now-ignored) children", () => {
    const section = computeSectionEffective(values({ calories: 500 }), [
      values({ calories: 100 }),
      NONE,
    ]);
    expect(section.state).toBe("OVERRIDE");
  });
});

describe("toRawNutritionValues", () => {
  it("treats missing/undefined the same as explicit null", () => {
    expect(toRawNutritionValues(undefined)).toEqual(NONE);
    expect(toRawNutritionValues(null)).toEqual(NONE);
    expect(toRawNutritionValues({})).toEqual(NONE);
  });

  it("passes entered fields through", () => {
    expect(toRawNutritionValues({ calories: 10 })).toEqual(
      values({ calories: 10 }),
    );
  });
});

describe("combineEffectiveNutrition", () => {
  it("is NONE for an empty list", () => {
    expect(combineEffectiveNutrition([])).toEqual(NONE_NUTRITION);
  });
});
