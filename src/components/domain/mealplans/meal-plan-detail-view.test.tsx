import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MealPlanDetailView } from "@/components/domain/mealplans/meal-plan-detail-view";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { getMealPlanRecommendations } = vi.hoisted(() => ({
  getMealPlanRecommendations: vi.fn(),
}));

vi.mock("@/lib/mealplans/actions", () => ({
  duplicateMealPlan: vi.fn(),
  deleteMealPlan: vi.fn(),
  addMealPlanEntry: vi.fn(),
  updateMealPlanEntry: vi.fn(),
  removeMealPlanEntry: vi.fn(),
  setMealPlanEntryStatus: vi.fn(),
  adoptNewerVersionInEntry: vi.fn(),
  addPlannedMeal: vi.fn(),
  removePlannedMeal: vi.fn(),
  startSessionFromEntry: vi.fn(),
  generateGroceryListFromMealPlan: vi.fn(),
  getMealPlanRecommendations,
}));

const MEAL_PLAN: MealPlanDetailDto = {
  id: "plan-1",
  title: "This week",
  startDate: "2026-08-04T00:00:00.000Z",
  endDate: "2026-08-10T00:00:00.000Z",
  notes: null,
  entries: [],
  linkedGroceryLists: [],
};

const CANDIDATE: MealPlanEntryCandidate = {
  dishId: "dish-1",
  kind: "RECIPE",
  title: "Weeknight Stir-Fry",
  dishVersionId: "version-1",
  yieldQuantity: 4,
  yieldUnit: "servings",
};

const NO_OWNED_RECIPES_TEXT =
  "Recommendations are drawn from your saved Recipes — you don't have any yet.";
const NONE_ELIGIBLE_TEXT =
  "None of your saved Recipes are currently eligible for recommendations — archived Recipes aren't included.";
const NO_MATCHES_TEXT = "No matches — try adjusting the filters above.";

async function getRecommendations() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Get recommendations" }));
}

/**
 * Slice 21 empty-account audit correction: `candidates` (the plan-entry
 * picker's pool — Recipes *and* Parts, every non-archived one) cannot
 * answer either "does this account own any Recipes" (it excludes archived
 * Dishes entirely) or "is any owned Recipe recommendation-eligible" (it's
 * not Recipe-only and carries no Stage). `totalRecipeCount`/
 * `eligibleRecipeCount` — two dedicated counts from
 * `getMealPlanRecommendations` — now distinguish three truthful states.
 */
describe("MealPlanDetailView RecommendationsPanel empty states", () => {
  it("shows the Recipe-specific first-use explanation when the account owns no Recipes", async () => {
    getMealPlanRecommendations.mockResolvedValueOnce({
      status: "success",
      recommendations: [],
      totalRecipeCount: 0,
      eligibleRecipeCount: 0,
    });

    render(<MealPlanDetailView mealPlan={MEAL_PLAN} candidates={[]} />);
    await getRecommendations();

    expect(await screen.findByText(NO_OWNED_RECIPES_TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Create a Recipe" }),
    ).toHaveAttribute("href", "/recipes/new");
    expect(
      screen.queryByRole("link", { name: "Create a Part" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(NO_MATCHES_TEXT)).not.toBeInTheDocument();
  });

  it("shows truthful eligibility guidance when Recipes exist but none are eligible", async () => {
    getMealPlanRecommendations.mockResolvedValueOnce({
      status: "success",
      recommendations: [],
      totalRecipeCount: 2,
      eligibleRecipeCount: 0,
    });

    render(
      <MealPlanDetailView mealPlan={MEAL_PLAN} candidates={[CANDIDATE]} />,
    );
    await getRecommendations();

    expect(await screen.findByText(NONE_ELIGIBLE_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(NO_OWNED_RECIPES_TEXT)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Create a Part" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(NO_MATCHES_TEXT)).not.toBeInTheDocument();
  });

  it("keeps the filter-adjustment message when eligible Recipes exist but filters return no matches", async () => {
    getMealPlanRecommendations.mockResolvedValueOnce({
      status: "success",
      recommendations: [],
      totalRecipeCount: 2,
      eligibleRecipeCount: 1,
    });

    render(
      <MealPlanDetailView mealPlan={MEAL_PLAN} candidates={[CANDIDATE]} />,
    );
    await getRecommendations();

    expect(await screen.findByText(NO_MATCHES_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(NO_OWNED_RECIPES_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(NONE_ELIGIBLE_TEXT)).not.toBeInTheDocument();
  });
});
