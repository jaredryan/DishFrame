import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  EffectiveNutritionSummary,
  type EffectiveNutritionDisplayData,
} from "@/components/domain/dish/nutrition-summary";
import { NONE_NUTRITION } from "@/lib/nutrition/calculate";
import type { NutritionState } from "@/lib/nutrition/calculate";

/**
 * Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md §54.5):
 * the shared calculated/partial/override-aware nutrition presentation used
 * by every surface (editor summaries, detail, print, public share, Version
 * History/compare, and offline equivalents).
 */

function nutrition(
  state: NutritionState,
  overrides: Partial<EffectiveNutritionDisplayData["totals"]> = {},
  rest: Partial<Omit<EffectiveNutritionDisplayData, "totals" | "state">> = {},
): EffectiveNutritionDisplayData {
  return {
    state,
    totals: {
      calories: null,
      protein: null,
      carbs: null,
      fat: null,
      moreNutrients: null,
      ...overrides,
    },
    ...rest,
  };
}

describe("EffectiveNutritionSummary", () => {
  it("renders nothing when the state is NONE", () => {
    const { container } = render(
      <EffectiveNutritionSummary nutrition={NONE_NUTRITION} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows primary nutrients and a Calculated badge for COMPLETE", () => {
    render(
      <EffectiveNutritionSummary
        nutrition={nutrition("COMPLETE", {
          calories: 320,
          protein: 12,
          carbs: 40,
          fat: 8,
        })}
      />,
    );

    expect(screen.getByText("320 cal")).toBeInTheDocument();
    expect(screen.getByText("12g protein")).toBeInTheDocument();
    expect(screen.getByText("40g carbs")).toBeInTheDocument();
    expect(screen.getByText("8g fat")).toBeInTheDocument();
    expect(screen.getByText("Calculated")).toBeInTheDocument();
  });

  it("shows a Partial badge and explanatory note for PARTIAL", () => {
    render(
      <EffectiveNutritionSummary
        nutrition={nutrition("PARTIAL", { calories: 100 })}
      />,
    );
    expect(screen.getByText("Partial")).toBeInTheDocument();
    expect(
      screen.getByText(/some contributing ingredients/),
    ).toBeInTheDocument();
  });

  it("shows a Manual override badge, basis, and source for OVERRIDE", () => {
    render(
      <EffectiveNutritionSummary
        nutrition={nutrition(
          "OVERRIDE",
          { calories: 300 },
          {
            basis: {
              nutritionBasis: "PER_OUTPUT_UNIT",
              nutritionBasisQuantity: 1,
              nutritionBasisUnit: "serving",
            },
            source: { provider: "USDA_FDC", name: "Rice, white, cooked" },
          },
        )}
      />,
    );
    expect(screen.getByText("Manual override")).toBeInTheDocument();
    expect(screen.getByText("Per 1 serving")).toBeInTheDocument();
    expect(
      screen.getByText(/Sourced from USDA FoodData Central/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rice, white, cooked/)).toBeInTheDocument();
  });

  it("shows More nutrients only when present", () => {
    const { rerender } = render(
      <EffectiveNutritionSummary
        nutrition={nutrition("COMPLETE", { calories: 100 })}
      />,
    );
    expect(screen.queryByText("More nutrients")).not.toBeInTheDocument();

    rerender(
      <EffectiveNutritionSummary
        nutrition={nutrition("COMPLETE", {
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

  it("supports a custom title for a Section-level summary", () => {
    render(
      <EffectiveNutritionSummary
        nutrition={nutrition("COMPLETE", { calories: 50 })}
        title="Section nutrition"
      />,
    );
    expect(screen.getByText("Section nutrition")).toBeInTheDocument();
  });
});
