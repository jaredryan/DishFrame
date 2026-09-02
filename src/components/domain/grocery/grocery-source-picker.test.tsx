import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GrocerySourcePickerProvider,
  GrocerySourcePickerTrigger,
  GrocerySourcePickerPanel,
  type MealPlanGroceryCandidate,
} from "@/components/domain/grocery/grocery-source-picker";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import type { GrocerySourceCandidate } from "@/lib/grocery/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const mockGenerateGroceryList = vi.fn();
const mockListGrocerySourceVersionOptions = vi.fn();
vi.mock("@/lib/grocery/list-actions", () => ({
  generateGroceryList: (...args: unknown[]) => mockGenerateGroceryList(...args),
  listGrocerySourceVersionOptions: (...args: unknown[]) =>
    mockListGrocerySourceVersionOptions(...args),
}));

const mockGenerateGroceryListFromMealPlan = vi.fn();
const mockListMealPlanEntriesForGrocerySelection = vi.fn();
vi.mock("@/lib/mealplans/actions", () => ({
  generateGroceryListFromMealPlan: (...args: unknown[]) =>
    mockGenerateGroceryListFromMealPlan(...args),
  listMealPlanEntriesForGrocerySelection: (...args: unknown[]) =>
    mockListMealPlanEntriesForGrocerySelection(...args),
}));

const MEAL_PLAN_CANDIDATE: MealPlanGroceryCandidate = {
  id: "plan-1",
  title: "This week's plan",
  startDate: new Date("2026-09-01"),
  endDate: new Date("2026-09-07"),
  _count: { entries: 2 },
};

const RECIPE_CANDIDATE: GrocerySourceCandidate = {
  dishId: "dish-1",
  kind: "RECIPE",
  stage: "ACTIVE",
  cuisineNames: [],
  title: "Weeknight Stir-Fry",
  versionLabel: "V1.0",
  imageAssetId: null,
  tagNames: [],
  rating: { kind: "none" },
  dishVersionId: "version-1",
  yieldQuantity: 4,
  yieldUnit: "servings",
};

beforeEach(() => {
  mockGenerateGroceryList.mockReset();
  mockListGrocerySourceVersionOptions.mockReset();
  mockGenerateGroceryListFromMealPlan.mockReset();
  mockListMealPlanEntriesForGrocerySelection.mockReset();
  mockGenerateGroceryList.mockResolvedValue({
    status: "success",
    listId: "list-1",
  });
  mockGenerateGroceryListFromMealPlan.mockResolvedValue({
    status: "success",
    listId: "list-2",
  });
  mockListMealPlanEntriesForGrocerySelection.mockResolvedValue({
    status: "success",
    entries: [
      { id: "entry-1", title: "Chili Crisp Bowl", cookDate: "2026-09-02" },
      { id: "entry-2", title: "Nuoc Cham Bowl", cookDate: "2026-09-04" },
    ],
  });
  mockListGrocerySourceVersionOptions.mockResolvedValue({
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
  });
});

function renderPicker(
  candidates: GrocerySourceCandidate[],
  mealPlanCandidates: MealPlanGroceryCandidate[] = [],
) {
  return render(
    <ToastProvider>
      <GrocerySourcePickerProvider>
        <GrocerySourcePickerTrigger
          hasCandidates={candidates.length > 0 || mealPlanCandidates.length > 0}
        />
        <GrocerySourcePickerPanel
          candidates={candidates}
          mealPlanCandidates={mealPlanCandidates}
        />
      </GrocerySourcePickerProvider>
      <Toaster />
    </ToastProvider>,
  );
}

/** Switches the open modal from its default `Meal plan` basis to
 * `Recipes & parts` — every pre-existing Recipes/Parts-basis test needs
 * this first now that Meal plan is the default. */
async function switchToRecipesAndParts(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("radio", { name: "Recipes & parts" }));
}

/**
 * Slice 21 empty-account audit: a brand-new account has zero Recipes/Parts,
 * so `SourceGroup` (below) renders nothing for either group and the form
 * offered no way to satisfy "Select at least one Recipe or Part." — a
 * dead-end. Covers the fix (disabled entry point with an explanation)
 * alongside the pre-existing populated-account path.
 */
describe("GrocerySourcePicker", () => {
  it("disables the entry point with an explanation when there are no Recipes or Parts", async () => {
    const user = userEvent.setup();
    renderPicker([]);

    // getByRole is ambiguous here: the DisabledActionHint wrapper span now
    // also carries role="button" (for Enter/Space parity), matching the
    // inner disabled <button> too. getByText only checks direct text-node
    // children, so it uniquely resolves to the real button.
    const button = screen.getByText("Make grocery list");
    expect(button).toBeDisabled();

    await user.click(button.closest("span")!);
    expect(
      await screen.findByText(
        "Create a Recipe or Part first — a grocery list is generated from what you've saved.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the picker and lists candidates when at least one Recipe or Part exists", async () => {
    const user = userEvent.setup();
    renderPicker([RECIPE_CANDIDATE]);

    const button = screen.getByRole("button", { name: "Make grocery list" });
    expect(button).toBeEnabled();

    await user.click(button);
    await switchToRecipesAndParts(user);
    expect(screen.getByText("Weeknight Stir-Fry")).toBeInTheDocument();
  });

  it("recalculates the scale factor from the newly selected Version's own yield, preserving the user's chosen target servings", async () => {
    const user = userEvent.setup();
    renderPicker([RECIPE_CANDIDATE]);

    await user.click(screen.getByRole("button", { name: "Make grocery list" }));
    await switchToRecipesAndParts(user);
    await user.click(screen.getByLabelText("Select Weeknight Stir-Fry"));
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Defaults to the candidate's own current Version (V1.0, makes 4).
    const servingsInput = await screen.findByLabelText("Servings");
    expect(servingsInput).toHaveValue("4");

    // User asks for 6 servings — at V1.0 (makes 4) that's a 1.5x scale.
    await user.clear(servingsInput);
    await user.type(servingsInput, "6");
    expect(screen.getByText(/will be scaled by 1\.5×/)).toBeInTheDocument();

    // Switch to V2.0 (makes 8) — the target (6) must be preserved, not
    // reset to the new Version's own yield, and the scale must recompute
    // against the new Version (6 / 8 = 0.75x), never staying at 1.5x.
    await user.click(
      screen.getByRole("combobox", { name: "Select a Version" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    expect(servingsInput).toHaveValue("6");
    expect(screen.getByText(/will be scaled by 0\.75×/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(mockGenerateGroceryList).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            dishId: "dish-1",
            dishVersionId: "version-2",
            scaleFactor: 0.75,
          }),
        ],
      }),
    );
  });

  it("defaults the new-list basis to Meal plan", async () => {
    const user = userEvent.setup();
    renderPicker([RECIPE_CANDIDATE], [MEAL_PLAN_CANDIDATE]);

    await user.click(screen.getByRole("button", { name: "Make grocery list" }));

    expect(
      screen.getByRole("radio", { name: "Meal plan", checked: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("This week's plan")).toBeInTheDocument();
    expect(screen.queryByText("Weeknight Stir-Fry")).not.toBeInTheDocument();
  });

  it("shows each Meal Plan result's name, date range, and entry count, and collapses the search into the selected plan", async () => {
    const user = userEvent.setup();
    renderPicker([], [MEAL_PLAN_CANDIDATE]);

    await user.click(screen.getByRole("button", { name: "Make grocery list" }));

    expect(screen.getByText("This week's plan")).toBeInTheDocument();
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();

    await user.click(screen.getByText("This week's plan"));

    // The search list collapses — searching for Meal Plans is no longer
    // presented — replaced by the selected plan's own summary card.
    expect(
      screen.queryByPlaceholderText("Search Meal Plans"),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Chili Crisp Bowl")).toBeInTheDocument();
    expect(screen.getByText("Nuoc Cham Bowl")).toBeInTheDocument();
  });

  it("generates from the selected Meal Plan's checked subset of meals", async () => {
    const user = userEvent.setup();
    renderPicker([], [MEAL_PLAN_CANDIDATE]);

    await user.click(screen.getByRole("button", { name: "Make grocery list" }));
    await user.click(screen.getByText("This week's plan"));
    await screen.findByText("Chili Crisp Bowl");

    // Every meal starts checked (matching Meal Plan Details' own default);
    // uncheck one to exercise the subset-selection semantics.
    await user.click(screen.getByRole("checkbox", { name: "Nuoc Cham Bowl" }));
    await user.click(screen.getByRole("button", { name: "Generate" }));

    expect(mockGenerateGroceryListFromMealPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        mealPlanId: "plan-1",
        entryIds: ["entry-1"],
      }),
    );
  });

  it("Recipes & parts basis still supports the existing standalone multi-select flow", async () => {
    const user = userEvent.setup();
    renderPicker([RECIPE_CANDIDATE], [MEAL_PLAN_CANDIDATE]);

    await user.click(screen.getByRole("button", { name: "Make grocery list" }));
    await switchToRecipesAndParts(user);

    expect(screen.getByText("Weeknight Stir-Fry")).toBeInTheDocument();
    expect(screen.queryByText("This week's plan")).not.toBeInTheDocument();
  });
});
