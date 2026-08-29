import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { searchFdc, applyFdcResult } from "@/lib/nutrition/actions";
import type { DishFormValues } from "@/components/domain/dish/dish-form-values";

/**
 * Slice 13: the editor's nutrition section — manual entry, FDC search/
 * select, More nutrients, and detach — all as ordinary (unsaved) form
 * state. No live network call: `searchFdc`/`applyFdcResult` are mocked.
 */

// See dish-editor.test.tsx for why: CoachMark requires an ancestor
// OnboardingProvider now that useOnboarding() throws without one.
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <OnboardingProvider initialState={{}}>{children}</OnboardingProvider>
    ),
  });
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(async () => ({ status: "idle" })),
  editDish: vi.fn(async () => ({ status: "idle" })),
  updateVersionNote: vi.fn(async () => ({ status: "success" })),
  setDefaultScale: vi.fn(async () => ({ status: "success" })),
}));

vi.mock("@/lib/sections/actions", () => ({
  getPartLinkDisplay: vi.fn(),
  getPartLinkPreview: vi.fn(),
  listAttachablePartVersions: vi.fn(),
  listAttachableParts: vi.fn(async () => ({ status: "success", parts: [] })),
  validatePartAttachment: vi.fn(),
  resolvePartVersionForDetach: vi.fn(),
}));

vi.mock("@/lib/nutrition/actions", () => ({
  searchFdc: vi.fn(),
  applyFdcResult: vi.fn(),
}));

const mockedSearchFdc = vi.mocked(searchFdc);
const mockedApplyFdcResult = vi.mocked(applyFdcResult);

const savedNutritionValues: DishFormValues = {
  title: "Ginger Bowl",
  stage: "IDEA",
  cuisine: null,
  description: null,
  yieldQuantity: null,
  yieldUnit: null,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  difficulty: null,
  imageAssetId: null,
  calories: 320,
  protein: 12,
  carbs: 40,
  fat: 8,
  nutritionBasis: "PER_OUTPUT_UNIT",
  nutritionBasisQuantity: 1,
  nutritionBasisUnit: "serving",
  moreNutrients: [{ key: "fiber", label: "Fiber", value: 3, unit: "g" }],
  nutritionSourceProvider: "USDA_FDC",
  nutritionSourceId: "12345",
  nutritionSourceName: "Rice, white, cooked",
  sections: [
    {
      lineageId: "section-1",
      name: null,
      guidanceNote: null,
      position: 0,
      ingredients: [
        {
          lineageId: "ingredient-1",
          name: "Rice",
          quantity: null,
          quantityEnd: null,
          isApproximate: false,
          unit: null,
          displayText: null,
          preparationNote: null,
          isOptional: false,
          substitute: null,
        },
      ],
      instructions: [],
      partLinks: [],
    },
  ],
  partLinks: [],
};

const existingDishWithNutrition = {
  id: "dish-1",
  baseVersionId: "version-1",
  baseMajorVersion: 1,
  baseMinorVersion: 0,
  highestMajorVersion: 1,
  nextMinorVersion: 1,
  isCurrent: true,
  note: null,
  defaultScale: null,
  values: savedNutritionValues,
};

describe("manual nutrition entry", () => {
  it("lets the user type calories/protein/carbs/fat directly", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Calories"), "250");
    await user.type(screen.getByLabelText("Protein (g)"), "10");

    expect(screen.getByLabelText("Calories")).toHaveValue("250");
    expect(screen.getByLabelText("Protein (g)")).toHaveValue("10");
  });

  it("shows the per-amount basis fields only once Per serving/output unit is selected", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    expect(screen.queryByLabelText("Per amount")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Basis"));
    await user.click(
      await screen.findByRole("option", { name: "Per serving or output unit" }),
    );

    expect(screen.getByLabelText("Per amount")).toBeInTheDocument();
  });
});

describe("FDC search and select", () => {
  it("searches, lists results, and applies a selected result into form state", async () => {
    const user = userEvent.setup();
    mockedSearchFdc.mockResolvedValue({
      status: "success",
      results: [
        {
          fdcId: 5001,
          description: "Rice, white, cooked",
          dataType: "SR Legacy",
          brandName: null,
          brandOwner: null,
        },
      ],
    });
    mockedApplyFdcResult.mockResolvedValue({
      status: "success",
      nutrition: {
        fdcId: 5001,
        sourceName: "Rice, white, cooked",
        calories: 130,
        protein: 2.7,
        carbs: 28.2,
        fat: 0.3,
        nutritionBasis: "PER_OUTPUT_UNIT",
        nutritionBasisQuantity: 100,
        nutritionBasisUnit: "g",
        moreNutrients: [
          { key: "fiber", label: "Fiber", value: 0.4, unit: "g" },
        ],
      },
    });

    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Search" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Search USDA FoodData Central"),
      "rice",
    );
    await user.click(within(dialog).getByRole("button", { name: "Search" }));

    expect(mockedSearchFdc).toHaveBeenCalledWith({ query: "rice" });
    const resultButton = await within(dialog).findByText("Rice, white, cooked");
    await user.click(resultButton);

    expect(mockedApplyFdcResult).toHaveBeenCalledWith({ fdcId: 5001 });
    expect(await screen.findByLabelText("Calories")).toHaveValue("130");
    expect(screen.getByLabelText("Protein (g)")).toHaveValue("2.7");
    expect(
      screen.getByText(/Sourced from USDA FoodData Central/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rice, white, cooked/)).toBeInTheDocument();
  });

  it("shows a friendly error and never blocks manual entry when search fails", async () => {
    const user = userEvent.setup();
    mockedSearchFdc.mockResolvedValue({
      status: "error",
      message:
        "USDA FoodData Central is unavailable right now. Try manual entry instead.",
    });

    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Search" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByLabelText("Search USDA FoodData Central"),
      "rice",
    );
    await user.click(within(dialog).getByRole("button", { name: "Search" }));

    expect(
      await within(dialog).findByText(/Try manual entry instead/),
    ).toBeInTheDocument();

    // Manual entry still works — the dialog only reports the error, it
    // never disables the rest of the form (PRODUCT_SPEC.md §54.4).
    await user.click(screen.getByRole("button", { name: /close/i }));
    await user.type(screen.getByLabelText("Calories"), "300");
    expect(screen.getByLabelText("Calories")).toHaveValue("300");
  });
});

describe("detach from source", () => {
  it("clears source attribution while preserving nutrition values", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDishWithNutrition} />);
    // Nutrition starts collapsed for an already-saved Recipe/Part.
    await user.click(screen.getByRole("button", { name: "Expand Nutrition" }));

    expect(
      screen.getByText(/Sourced from USDA FoodData Central/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Calories")).toHaveValue("320");

    await user.click(
      screen.getByRole("button", { name: "Detach from source" }),
    );

    expect(
      screen.queryByText(/Sourced from USDA FoodData Central/),
    ).not.toBeInTheDocument();
    // Values and basis survive the detach — only attribution is cleared.
    expect(screen.getByLabelText("Calories")).toHaveValue("320");
    expect(screen.getByLabelText("Protein (g)")).toHaveValue("12");
  });
});

describe("More nutrients", () => {
  it("shows and edits the recognized whitelist", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDishWithNutrition} />);
    await user.click(screen.getByRole("button", { name: "Expand Nutrition" }));

    await user.click(screen.getByText("More nutrients"));

    expect(screen.getByLabelText("Fiber")).toHaveValue(3);
    expect(screen.getByLabelText("Sugar")).toHaveValue(null);

    await user.clear(screen.getByLabelText("Sodium"));
    await user.type(screen.getByLabelText("Sodium"), "450");
    expect(screen.getByLabelText("Sodium")).toHaveValue(450);
  });
});
