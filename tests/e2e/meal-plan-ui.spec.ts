import { test, expect, type Page } from "@playwright/test";
import { cleanup, login, nativeButton, waitForServerAction } from "./helpers";

/**
 * Meal Plan UI behavior that's difficult to prove from integration tests
 * alone — the Create flow's default date range, the Add-meal/Add-plan
 * modals, day-grouped Schedule rendering, checkbox persistence across a
 * reload, and the Mark complete/Reopen read-only lifecycle
 * (PRODUCT_SPEC.md §13, Meal Plan Details/Editor "QA redesign" comments in
 * meal-plan-view.tsx/meal-plan-editor.tsx).
 */

async function createRecipe(page: Page, title: string): Promise<void> {
  await page.goto("/recipes/new");
  await page.getByLabel("Recipe title").fill(title, { timeout: 15_000 });
  await page.getByLabel("Yield amount").fill("4");
  await page.getByLabel("Yield unit").fill("servings");

  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const sectionDialog = page.getByRole("dialog");
  await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
  await sectionDialog.getByLabel("Ingredient name").fill("Rice");
  await sectionDialog.getByLabel("Quantity", { exact: true }).fill("2");
  await sectionDialog.getByLabel("Unit", { exact: true }).fill("cup");
  await sectionDialog.getByRole("button", { name: "Finish section" }).click();

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/, { timeout: 15_000 });
}

/**
 * Builds a small, deterministic Meal Plan through the real Create flow: one
 * Recipe, added as a Meal, scheduled once via "Add plan". Returns the
 * created Meal Plan's id so each test can navigate straight to its own
 * scenario without repeating the lifecycle assertions below.
 */
async function createMealPlanWithScheduledMeal(
  page: Page,
  recipeTitle: string,
): Promise<string> {
  await createRecipe(page, recipeTitle);

  await page.goto("/meal-plans");
  await page.getByRole("link", { name: "Create meal plan" }).click();
  await expect(page).toHaveURL(/\/meal-plans\/new$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Add meal", exact: true }).click();
  const addMealDialog = page.getByRole("dialog", { name: "Add meal" });
  await addMealDialog.getByRole("button", { name: "Clear" }).click();
  await addMealDialog
    .getByPlaceholder("Search your Recipes and Parts…")
    .fill(recipeTitle);
  await addMealDialog.getByRole("radio", { name: recipeTitle }).click();
  await addMealDialog
    .getByRole("button", { name: "Add meal", exact: true })
    .click();
  await expect(page.getByText(recipeTitle)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Add plan" }).click();
  const planDialog = page.getByRole("dialog", { name: "Add plan" });
  await planDialog.getByLabel("Meal name").fill("Dinner");
  await planDialog.getByLabel("Servings").fill("2");
  await planDialog
    .getByRole("button", { name: "Add plan", exact: true })
    .click();
  await expect(planDialog).not.toBeVisible();
  await expect(page.getByText("Dinner")).toBeVisible();

  await page.getByRole("button", { name: "Create meal plan" }).click();
  await expect(page).toHaveURL(/\/meal-plans\/(?!new)[^/]+$/, {
    timeout: 15_000,
  });
  return page.url().split("/").pop()!;
}

test.describe("Meal Plan UI", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("Create meal plan defaults, adding a meal, and scheduling it via Add plan groups by day", async ({
    page,
  }) => {
    const recipeTitle = `Schedule Test Bowl ${Date.now()}`;
    await createRecipe(page, recipeTitle);

    await page.goto("/meal-plans");
    await page.getByRole("link", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/new$/, { timeout: 15_000 });
    await expect(page.getByLabel("Title")).toHaveValue("This week");
    const startText = await page
      .getByLabel("Start date", { exact: true })
      .inputValue();
    const endText = await page
      .getByLabel("End date", { exact: true })
      .inputValue();
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.round(
      (new Date(endText).getTime() - new Date(startText).getTime()) / dayMs,
    );
    expect(diffDays).toBe(6);

    await page.getByRole("button", { name: "Add meal", exact: true }).click();
    const addMealDialog = page.getByRole("dialog", { name: "Add meal" });
    await addMealDialog.getByRole("button", { name: "Clear" }).click();
    await addMealDialog
      .getByPlaceholder("Search your Recipes and Parts…")
      .fill(recipeTitle);
    await addMealDialog.getByRole("radio", { name: recipeTitle }).click();
    await addMealDialog
      .getByRole("button", { name: "Add meal", exact: true })
      .click();
    await expect(page.getByText(recipeTitle)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Add plan" }).click();
    const planDialog = page.getByRole("dialog", { name: "Add plan" });
    await planDialog.getByLabel("Meal name").fill("Dinner");
    await planDialog.getByLabel("Servings").fill("2");
    await planDialog
      .getByRole("button", { name: "Add plan", exact: true })
      .click();
    await expect(planDialog).not.toBeVisible();

    // The Schedule section groups by calendar date — one day card holding
    // the newly added "Dinner" plan.
    await expect(page.getByText("Dinner")).toBeVisible();

    await page.getByRole("button", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/(?!new)[^/]+$/, {
      timeout: 15_000,
    });

    // Meal Plan Details: the Meal appears in "Meals to cook" (the recipe
    // title shows there and, redundantly, inside the Schedule section's own
    // mealTitle line — `.first()` targets the "Meals to cook" card, the
    // first such match in DOM order), and the schedule item still renders
    // under its date in "Schedule".
    await expect(page.getByText(recipeTitle).first()).toBeVisible();
    await expect(page.getByText("Dinner")).toBeVisible();
  });

  test("cooked/eaten checkboxes persist, and Mark complete makes execution controls read-only while Reopen/Reuse stay available", async ({
    page,
  }) => {
    const recipeTitle = `Lifecycle Test Bowl ${Date.now()}`;
    const mealPlanId = await createMealPlanWithScheduledMeal(page, recipeTitle);
    await page.goto(`/meal-plans/${mealPlanId}`);

    // --- Cooked checkbox in "Meals to cook" persists across a reload ---
    const cookedCheckbox = page.getByRole("checkbox", {
      name: "This meal has not yet been cooked",
    });
    await waitForServerAction(page, () => cookedCheckbox.click());
    await expect(
      page.getByRole("checkbox", { name: "This meal was cooked" }),
    ).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "This meal was cooked" }),
    ).toBeChecked();

    // --- Eaten checkbox in "Schedule" persists across a reload. Our
    // fixture schedules exactly one meal for its day, so checking it makes
    // the whole day "fully eaten" and its day card auto-collapses to a
    // summary (ViewScheduleDayCard) — expand it again to reach the
    // checkbox directly. ---
    const eatenCheckbox = page.getByRole("checkbox", {
      name: "This planned meal has not been eaten yet",
    });
    await waitForServerAction(page, () => eatenCheckbox.click());
    const daySummary = page.getByRole("button", { name: /1\/1 eaten/ });
    await expect(daySummary).toBeVisible();
    await daySummary.click();
    await expect(
      page.getByRole("checkbox", { name: "This planned meal was eaten" }),
    ).toBeChecked();
    await page.reload();
    // A fresh load re-collapses the now-fully-eaten day by default — the
    // persisted "1/1 eaten" summary is itself proof the toggle survived.
    await expect(
      page.getByRole("button", { name: /1\/1 eaten/ }),
    ).toBeVisible();

    // --- Mark complete via the overflow menu ---
    await page.getByRole("button", { name: "More actions" }).click();
    await waitForServerAction(page, () =>
      page.getByRole("menuitem", { name: "Mark complete" }).click(),
    );
    await expect(page.getByText(/has been closed/)).toBeVisible();

    // --- Execution controls are disabled, not hidden ---
    await expect(
      page.getByRole("checkbox", { name: "This meal was cooked" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: /1\/1 eaten/ }).click();
    await expect(
      page.getByRole("checkbox", { name: "This planned meal was eaten" }),
    ).toBeDisabled();
    await expect(nativeButton(page, "Generate grocery list")).toBeDisabled();
    await expect(
      nativeButton(page, "Edit Meal Plan (unavailable)"),
    ).toBeDisabled();

    // --- Reopen and Reuse stay available on a completed plan ---
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Reuse for new dates" }),
    ).toBeVisible();
    const reopenItem = page.getByRole("menuitem", { name: "Reopen" });
    await expect(reopenItem).toBeVisible();
    await waitForServerAction(page, () => reopenItem.click());

    await expect(page.getByText(/has been closed/)).not.toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: "This meal was cooked" }),
    ).toBeEnabled();
  });
});
