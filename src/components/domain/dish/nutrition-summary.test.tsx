import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  NutritionSummary,
  toNutritionSummaryData,
  type NutritionSummaryData,
} from "@/components/domain/dish/nutrition-summary";
import { Prisma } from "@/generated/prisma/client";

/**
 * Slice 13 correction pass, PRODUCT_SPEC.md §54: the shared read-only
 * nutrition presentation used by both the current-Version detail page and
 * both historical Version pages.
 */

function nutrition(
  overrides: Partial<NutritionSummaryData> = {},
): NutritionSummaryData {
  return {
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    nutritionBasis: null,
    nutritionBasisQuantity: null,
    nutritionBasisUnit: null,
    moreNutrients: null,
    nutritionSourceProvider: null,
    nutritionSourceName: null,
    ...overrides,
  };
}

describe("NutritionSummary", () => {
  it("renders nothing when there is no nutrition data at all", () => {
    const { container } = render(<NutritionSummary nutrition={nutrition()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows primary nutrients and basis when present", () => {
    render(
      <NutritionSummary
        nutrition={nutrition({
          calories: 320,
          protein: 12,
          carbs: 40,
          fat: 8,
          nutritionBasis: "PER_OUTPUT_UNIT",
          nutritionBasisQuantity: 1,
          nutritionBasisUnit: "serving",
        })}
      />,
    );

    expect(screen.getByText("320 cal")).toBeInTheDocument();
    expect(screen.getByText("12g protein")).toBeInTheDocument();
    expect(screen.getByText("40g carbs")).toBeInTheDocument();
    expect(screen.getByText("8g fat")).toBeInTheDocument();
    expect(screen.getByText("Per 1 serving")).toBeInTheDocument();
  });

  it("shows More nutrients only when present", () => {
    const { rerender } = render(
      <NutritionSummary nutrition={nutrition({ calories: 100 })} />,
    );
    expect(screen.queryByText("More nutrients")).not.toBeInTheDocument();

    rerender(
      <NutritionSummary
        nutrition={nutrition({
          calories: 100,
          moreNutrients: [
            { key: "fiber", label: "Fiber", value: 3, unit: "g" },
          ],
        })}
      />,
    );
    expect(screen.getByText("More nutrients")).toBeInTheDocument();
    expect(screen.getByText("Fiber 3g")).toBeInTheDocument();
  });

  it("shows the USDA disclaimer only when sourced attribution exists", () => {
    const { rerender } = render(
      <NutritionSummary nutrition={nutrition({ calories: 100 })} />,
    );
    expect(screen.queryByText(/may contain errors/)).not.toBeInTheDocument();

    rerender(
      <NutritionSummary
        nutrition={nutrition({
          calories: 100,
          nutritionSourceProvider: "USDA_FDC",
          nutritionSourceName: "Rice, white, cooked",
        })}
      />,
    );
    expect(
      screen.getByText(/Sourced from USDA FoodData Central/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rice, white, cooked/)).toBeInTheDocument();
    expect(
      screen.getByText(/may contain errors or change over time/),
    ).toBeInTheDocument();
  });
});

describe("toNutritionSummaryData", () => {
  it("converts Decimal/Json version columns into plain display data", () => {
    const data = toNutritionSummaryData({
      calories: new Prisma.Decimal(320),
      protein: new Prisma.Decimal(12),
      carbs: null,
      fat: null,
      nutritionBasis: "WHOLE",
      nutritionBasisQuantity: null,
      nutritionBasisUnit: null,
      moreNutrients: [{ key: "fiber", label: "Fiber", value: 3, unit: "g" }],
      nutritionSourceProvider: "USDA_FDC",
      nutritionSourceName: "Test food",
    });

    expect(data.calories).toBe(320);
    expect(data.protein).toBe(12);
    expect(data.nutritionBasis).toBe("WHOLE");
    expect(data.moreNutrients).toEqual([
      { key: "fiber", label: "Fiber", value: 3, unit: "g" },
    ]);
    expect(data.nutritionSourceProvider).toBe("USDA_FDC");
  });

  it("treats a malformed moreNutrients value as no data rather than throwing", () => {
    const data = toNutritionSummaryData({
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      nutritionBasis: null,
      nutritionBasisQuantity: null,
      nutritionBasisUnit: null,
      moreNutrients: "not an array" as never,
      nutritionSourceProvider: null,
      nutritionSourceName: null,
    });

    expect(data.moreNutrients).toBeNull();
  });
});
