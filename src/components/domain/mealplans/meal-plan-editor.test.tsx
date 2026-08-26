import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";
import type { DishVersionOption } from "@/lib/dishes/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const {
  createMealPlan,
  updateMealPlan,
  addMealPlanEntry,
  updateMealPlanEntry,
  removeMealPlanEntry,
  adoptNewerVersionInEntry,
  addPlannedMeal,
  removePlannedMeal,
} = vi.hoisted(() => ({
  createMealPlan: vi.fn(),
  updateMealPlan: vi.fn(),
  addMealPlanEntry: vi.fn(),
  updateMealPlanEntry: vi.fn(),
  removeMealPlanEntry: vi.fn(),
  adoptNewerVersionInEntry: vi.fn(),
  addPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
}));

vi.mock("@/lib/mealplans/actions", () => ({
  createMealPlan,
  updateMealPlan,
  addMealPlanEntry,
  updateMealPlanEntry,
  removeMealPlanEntry,
  adoptNewerVersionInEntry,
  addPlannedMeal,
  removePlannedMeal,
}));

const { listDishVersionOptions } = vi.hoisted(() => ({
  listDishVersionOptions: vi.fn(async () => ({
    status: "success" as const,
    versions: [] as DishVersionOption[],
    currentVersionId: null as string | null,
  })),
}));

vi.mock("@/lib/dishes/actions", () => ({
  listDishVersionOptions,
}));

function candidate(
  overrides: Partial<MealPlanEntryCandidate> = {},
): MealPlanEntryCandidate {
  return {
    dishId: "dish-1",
    kind: "RECIPE",
    stage: "ACTIVE",
    cuisine: null,
    title: "Weeknight Stir-Fry",
    dishVersionId: "version-1",
    versionLabel: "V1.0",
    imageAssetId: null,
    yieldQuantity: 4,
    yieldUnit: "servings",
    tagIds: [],
    tagNames: [],
    flavorProfileValueIds: [],
    isFavorite: false,
    ratingValue: null,
    lastCookedAt: null,
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...overrides,
  };
}

function renderEditor(candidates: MealPlanEntryCandidate[]) {
  return render(
    <MealPlanEditor
      mode="create"
      candidates={candidates}
      tagOptions={[]}
      cuisineOptions={[]}
      flavorProfileOptions={[]}
    />,
  );
}

beforeEach(() => {
  createMealPlan.mockReset();
  addMealPlanEntry.mockReset();
  listDishVersionOptions.mockReset();
  createMealPlan.mockResolvedValue({
    status: "success",
    mealPlanId: "plan-1",
  });
  addMealPlanEntry.mockResolvedValue({ status: "success", entryId: "e1" });
  // Matches the default `candidate()` fixture: dish-1's own current Version
  // (V1.0, makes 4) plus a second, higher-yield Version (V2.0, makes 8).
  listDishVersionOptions.mockResolvedValue({
    status: "success",
    versions: [
      {
        id: "version-1",
        majorVersion: 1,
        minorVersion: 0,
        yieldQuantity: 4,
        yieldUnit: "servings",
      },
      {
        id: "version-2",
        majorVersion: 2,
        minorVersion: 0,
        yieldQuantity: 8,
        yieldUnit: "servings",
      },
    ],
    currentVersionId: "version-1",
  });
});

/**
 * Slice 25 redesign: the Add/Edit-meal modal is now a compact version of the
 * Recipes/Parts library browser (search/filters/sort acting directly on one
 * candidate list) rather than a separate recommendations system — see
 * `meal-plan-editor.tsx`'s `MealPickerModal` doc comment.
 */
describe("MealPlanEditor Add-meal picker", () => {
  it("defaults to Active-stage Recipes only", async () => {
    const user = userEvent.setup();
    const activeRecipe = candidate({ dishId: "r1", title: "Active Recipe" });
    const ideaRecipe = candidate({
      dishId: "r2",
      title: "Idea Recipe",
      stage: "IDEA",
    });
    const activePart = candidate({
      dishId: "p1",
      title: "Active Part",
      kind: "PART",
    });
    renderEditor([activeRecipe, ideaRecipe, activePart]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));

    expect(await screen.findByText("Active Recipe")).toBeInTheDocument();
    expect(screen.queryByText("Idea Recipe")).not.toBeInTheDocument();
    expect(screen.queryByText("Active Part")).not.toBeInTheDocument();
  });

  it("Clear removes every active filter, revealing every candidate", async () => {
    const user = userEvent.setup();
    const ideaPart = candidate({
      dishId: "p1",
      title: "Idea Part",
      kind: "PART",
      stage: "IDEA",
    });
    renderEditor([candidate(), ideaPart]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    expect(screen.queryByText("Idea Part")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Idea Part")).toBeInTheDocument();
  });

  it("selecting a candidate collapses the list to its rich row with a deselect control", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    await user.click(
      await screen.findByRole("radio", { name: /Weeknight Stir-Fry/ }),
    );

    expect(
      screen.getByRole("button", { name: "Remove Weeknight Stir-Fry" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("Favorites filters to Favorite-tagged candidates only", async () => {
    const user = userEvent.setup();
    const fav = candidate({
      dishId: "r1",
      title: "Favorite Dish",
      isFavorite: true,
    });
    const nonFav = candidate({ dishId: "r2", title: "Other Dish" });
    renderEditor([fav, nonFav]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    expect(await screen.findByText("Other Dish")).toBeInTheDocument();

    // Favorites lives inside the Tags filter dropdown as its first, divided
    // special option rather than a standalone control.
    await user.click(screen.getByRole("button", { name: "Tags" }));
    await user.click(
      await screen.findByRole("checkbox", { name: "Favorites" }),
    );

    expect(await screen.findByText("Favorite Dish")).toBeInTheDocument();
    expect(screen.queryByText("Other Dish")).not.toBeInTheDocument();
  });
});

describe("MealPlanEditor Add-meal picker — Version selection and yield sync", () => {
  it("stages the selected Version on the draft entry, persisted on Save", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    await user.click(
      await screen.findByRole("radio", { name: /Weeknight Stir-Fry/ }),
    );

    // Switch away from the default (current) Version to a specific one.
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Jump to a major version line" }),
      ).not.toBeDisabled(),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Jump to a major version line" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    await user.click(screen.getByRole("button", { name: "Create meal plan" }));

    await waitFor(() => expect(addMealPlanEntry).toHaveBeenCalled());
    expect(addMealPlanEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        dishId: "dish-1",
        dishVersionId: "version-2",
      }),
    );
  });

  it("preserves a user-chosen target yield across a Version switch, recalculating the scale from the newly selected Version's own yield", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    await user.click(
      await screen.findByRole("radio", { name: /Weeknight Stir-Fry/ }),
    );

    const targetYieldInput = await screen.findByLabelText("Target yield");
    expect(screen.getByText("Makes 4 servings")).toBeInTheDocument();

    await user.clear(targetYieldInput);
    await user.type(targetYieldInput, "6");
    expect(screen.getByText(/Scale recipe by 1\.5×/)).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Jump to a major version line" }),
      ).not.toBeDisabled(),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Jump to a major version line" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    // Makes now reflects V2.0's own yield (8), the target (6) is
    // preserved (never reset to the new Version's own yield), and the
    // scale recomputes against the new Version — never stays at 1.5x.
    expect(screen.getByText("Makes 8 servings")).toBeInTheDocument();
    expect(targetYieldInput).toHaveValue(6);
    expect(screen.getByText(/Scale recipe by 0\.75×/)).toBeInTheDocument();
  });
});
