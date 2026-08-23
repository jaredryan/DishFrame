import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/mealplans/actions", () => ({
  createMealPlan: vi.fn(),
  updateMealPlan: vi.fn(),
  addMealPlanEntry: vi.fn(),
  updateMealPlanEntry: vi.fn(),
  removeMealPlanEntry: vi.fn(),
  adoptNewerVersionInEntry: vi.fn(),
  addPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
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
