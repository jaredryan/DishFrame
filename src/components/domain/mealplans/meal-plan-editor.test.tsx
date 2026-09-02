import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";
import type { DishVersionOption } from "@/lib/dishes/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { createMealPlan, updateMealPlan, saveMealPlanEntryChanges } = vi.hoisted(
  () => ({
    createMealPlan: vi.fn(),
    updateMealPlan: vi.fn(),
    saveMealPlanEntryChanges: vi.fn(),
  }),
);

vi.mock("@/lib/mealplans/actions", () => ({
  createMealPlan,
  updateMealPlan,
  saveMealPlanEntryChanges,
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
    cuisineIds: [],
    cuisineNames: [],
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
    <ToastProvider>
      <MealPlanEditor
        mode="create"
        candidates={candidates}
        tagOptions={[]}
        cuisineOptions={[]}
        flavorProfileOptions={[]}
      />
      <Toaster />
    </ToastProvider>,
  );
}

beforeEach(() => {
  // MealPlanEditor persists its create-mode draft to localStorage and
  // rehydrates from it on mount — clear it so a prior test's un-saved
  // draft (e.g. a staged meal/schedule) never bleeds into the next render.
  window.localStorage.clear();
  createMealPlan.mockReset();
  saveMealPlanEntryChanges.mockReset();
  listDishVersionOptions.mockReset();
  createMealPlan.mockResolvedValue({
    status: "success",
    mealPlanId: "plan-1",
  });
  saveMealPlanEntryChanges.mockResolvedValue({
    status: "success",
    hadEntryError: false,
  });
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

describe("MealPlanEditor Details defaults (§1)", () => {
  it("defaults Start date to today and End date to today + 6 days", () => {
    renderEditor([candidate()]);

    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 6);
    const format = (d: Date) =>
      d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

    expect(screen.getByLabelText("Start date")).toHaveValue(format(today));
    expect(screen.getByLabelText("End date")).toHaveValue(format(end));
  });
});

describe("MealPlanEditor Meals to cook cards (§3)", () => {
  it("does not show a meaningless Planned badge for a newly-added unsaved meal", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);
    await addDefaultMeal(user);

    expect(screen.queryByText("Planned")).not.toBeInTheDocument();
  });

  it("clicking the card row (not a nested action) opens Edit", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);
    await addDefaultMeal(user);

    await user.click(screen.getByText("Weeknight Stir-Fry"));

    expect(await screen.findByLabelText("Target yield")).toBeInTheDocument();
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
        screen.getByRole("combobox", { name: "Select a Version" }),
      ).not.toBeDisabled(),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Select a Version" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    await user.click(screen.getByRole("button", { name: "Add meal" }));
    await user.click(screen.getByRole("button", { name: "Create meal plan" }));

    await waitFor(() => expect(saveMealPlanEntryChanges).toHaveBeenCalled());
    expect(saveMealPlanEntryChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        newEntries: [
          expect.objectContaining({
            dishId: "dish-1",
            dishVersionId: "version-2",
          }),
        ],
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
        screen.getByRole("combobox", { name: "Select a Version" }),
      ).not.toBeDisabled(),
    );
    await user.click(
      screen.getByRole("combobox", { name: "Select a Version" }),
    );
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    // Makes now reflects V2.0's own yield (8), the target (6) is
    // preserved (never reset to the new Version's own yield), and the
    // scale recomputes against the new Version — never stays at 1.5x.
    expect(screen.getByText("Makes 8 servings")).toBeInTheDocument();
    expect(targetYieldInput).toHaveValue("6");
    expect(screen.getByText(/Scale recipe by 0\.75×/)).toBeInTheDocument();
  });
});

/**
 * Adds the sole default `candidate()` as a draft Meal via the Add-meal
 * picker, leaving its modal closed afterward. Target yield is prefilled
 * from the candidate's own yield (4) but stays untouched/`null` on submit
 * unless explicitly edited here — `targetYield` (re)types it so the draft
 * entry carries a real target yield for the Schedule tests below to cap
 * against.
 */
async function addDefaultMeal(
  user: ReturnType<typeof userEvent.setup>,
  targetYield = "4",
) {
  await user.click(screen.getByRole("button", { name: "Add meal" }));
  await user.click(
    await screen.findByRole("radio", { name: /Weeknight Stir-Fry/ }),
  );
  const targetYieldInput = await screen.findByLabelText("Target yield");
  await user.clear(targetYieldInput);
  await user.type(targetYieldInput, targetYield);
  await user.click(screen.getByRole("button", { name: "Add meal" }));
}

/**
 * Schedule redesign (Meal Plan QA redesign, §4): a day-card view grouped by
 * calendar date, with one-plan-per-modal Add/Edit — replacing the former
 * inline `+ Planned meal` UI and, before that, the multi-plan-in-one-modal
 * "Plan meals" batch workflow. With exactly one Meal on the plan, the
 * modal's "Dish" picker defaults to it, so these tests don't need to drive
 * that Select directly.
 */
describe("MealPlanEditor Schedule section", () => {
  it("starts empty, with Add plan disabled until a Meal exists", async () => {
    renderEditor([candidate()]);

    expect(
      screen.getByText("There is no schedule for this meal plan."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add plan" })).toBeDisabled();
  });

  it("Add plan commits a scheduled meal, grouped under its date's day card", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);
    await addDefaultMeal(user);

    expect(screen.getByRole("button", { name: "Add plan" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Add plan" }));

    await user.type(await screen.findByLabelText("Meal name"), "Sunday dinner");
    await user.type(screen.getByLabelText("Servings"), "2");
    const submitButtons = screen.getAllByRole("button", { name: "Add plan" });
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(await screen.findByText("Sunday dinner")).toBeInTheDocument();
    expect(screen.getByText(/2 servings/)).toBeInTheDocument();
  });

  it("prevents scheduling more servings than the Meal's target yield across entries (§77.2)", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]); // target yield 4 (candidate()'s yieldQuantity)
    await addDefaultMeal(user);

    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await user.type(await screen.findByLabelText("Meal name"), "First");
    await user.type(screen.getByLabelText("Servings"), "3");
    const submitButtons = screen.getAllByRole("button", { name: "Add plan" });
    await user.click(submitButtons[submitButtons.length - 1]);
    expect(await screen.findByText("First")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await user.type(await screen.findByLabelText("Meal name"), "Second");
    expect(
      screen.getByText(/1 serving left for this Dish/),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Servings"), "3");
    const secondSubmit = screen.getAllByRole("button", { name: "Add plan" });
    await user.click(secondSubmit[secondSubmit.length - 1]);

    expect(
      await screen.findByText(/Only 1 serving left for this Dish/),
    ).toBeInTheDocument();
    // The over-allocating second entry never joined the schedule.
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
  });

  it("removing the Meal a schedule entry belongs to clears that schedule entry too", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);
    await addDefaultMeal(user);
    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await user.type(await screen.findByLabelText("Meal name"), "Sunday dinner");
    await user.type(screen.getByLabelText("Servings"), "2");
    const submitButtons = screen.getAllByRole("button", { name: "Add plan" });
    await user.click(submitButtons[submitButtons.length - 1]);
    expect(await screen.findByText("Sunday dinner")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove meal" }));

    expect(
      screen.getByText("There is no schedule for this meal plan."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Sunday dinner")).not.toBeInTheDocument();
  });

  it("Save sends the schedule as scheduleAssignments keyed to the new entry's localKey", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);
    await addDefaultMeal(user);
    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await user.type(await screen.findByLabelText("Meal name"), "Sunday dinner");
    await user.type(screen.getByLabelText("Servings"), "2");
    const submitButtons = screen.getAllByRole("button", { name: "Add plan" });
    await user.click(submitButtons[submitButtons.length - 1]);
    await screen.findByText("Sunday dinner");

    await user.click(screen.getByRole("button", { name: "Create meal plan" }));

    await waitFor(() => expect(saveMealPlanEntryChanges).toHaveBeenCalled());
    const call = saveMealPlanEntryChanges.mock.calls[0][0];
    expect(call.newEntries).toHaveLength(1);
    const localKey = call.newEntries[0].localKey;
    expect(typeof localKey).toBe("string");
    expect(call.scheduleAssignments).toEqual([
      {
        mealKey: localKey,
        meals: [
          expect.objectContaining({ label: "Sunday dinner", servings: 2 }),
        ],
      },
    ]);
  });

  it("blocks Save with a clear message when a Meal's target yield drops below its already-scheduled servings", async () => {
    const user = userEvent.setup();
    renderEditor([candidate()]);
    await addDefaultMeal(user); // target yield 4

    await user.click(screen.getByRole("button", { name: "Add plan" }));
    await user.type(await screen.findByLabelText("Meal name"), "Sunday dinner");
    await user.type(screen.getByLabelText("Servings"), "3");
    const submitButtons = screen.getAllByRole("button", { name: "Add plan" });
    await user.click(submitButtons[submitButtons.length - 1]);
    await screen.findByText("Sunday dinner");

    // Lower the Meal's target yield below what's already scheduled (3).
    await user.click(screen.getByRole("button", { name: "Edit meal" }));
    const targetYieldInput = await screen.findByLabelText("Target yield");
    await user.clear(targetYieldInput);
    await user.type(targetYieldInput, "2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await user.click(screen.getByRole("button", { name: "Create meal plan" }));

    expect(
      await screen.findByText(
        /Scheduled servings for "Weeknight Stir-Fry" \(3\) exceed its target yield of 2/,
      ),
    ).toBeInTheDocument();
    expect(createMealPlan).not.toHaveBeenCalled();
    expect(saveMealPlanEntryChanges).not.toHaveBeenCalled();
  });
});
