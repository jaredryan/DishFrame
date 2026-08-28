import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * BUILD_PLAN.md Slice 15's required journey: build a plan, generate a
 * synced grocery list, check off an item, edit the plan (a target-yield
 * change), confirm the list visibly reflects the sync rather than silently
 * losing the checkoff, complete the list, and confirm it freezes.
 */
test.describe("Meal Plans: build, sync grocery list, edit, complete", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("golden path", async ({ page }) => {
    const title = `Meal Plan Test Bowl ${Date.now()}`;

    // --- Create a Recipe with a real yield + one quantified ingredient,
    // so target-yield scaling has something meaningful to change ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title, { timeout: 15_000 });
    await page.getByLabel("Yield amount").fill("4");
    await page.getByLabel("Yield unit").fill("servings");

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Rice");
    await sectionDialog.getByLabel("Quantity", { exact: true }).fill("2");
    await sectionDialog.getByLabel("Unit", { exact: true }).fill("cup");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/, { timeout: 15_000 });

    // --- Create a Meal Plan (full create page, Slice 22 redesign) ---
    await page.goto("/meal-plans");
    // The list page's CTA is a Link (asChild Button), so its role is "link";
    // the create page's submit button below is a real <button>.
    await page.getByRole("link", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/new$/, { timeout: 15_000 });
    await page.getByLabel("Title").fill("This week");

    // --- Add the Recipe as a Meal via the Add-meal modal (default target
    // yield — no scaling). The modal's default filters (Stage: Active) would
    // exclude this freshly created, still-Idea-stage Recipe, so Clear them
    // first. ---
    await page.getByRole("button", { name: "Add meal", exact: true }).click();
    const addMealDialog = page.getByRole("dialog", { name: "Add meal" });
    await addMealDialog.getByRole("button", { name: "Clear" }).click();
    await addMealDialog
      .getByPlaceholder("Search your Recipes and Parts…")
      .fill(title);
    await addMealDialog.getByRole("radio", { name: title }).click();
    await addMealDialog
      .getByRole("button", { name: "Add meal", exact: true })
      .click();
    await expect(page.locator("li").filter({ hasText: title })).toBeVisible({
      timeout: 10_000,
    });

    // --- Final Save creates the MealPlan record and its Meal together ---
    await page.getByRole("button", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/(?!new)[^/]+$/, {
      timeout: 15_000,
    });
    const mealPlanUrl = page.url();
    const mealPlanId = mealPlanUrl.split("/").pop();
    const entryCard = page.locator("li").filter({ hasText: title });
    await expect(entryCard).toBeVisible({ timeout: 10_000 });

    // --- Generate a synced grocery list from the View page ---
    await page.getByRole("button", { name: "Generate grocery list" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Generate" })
      .click();
    await expect(page).toHaveURL(/\/grocery-lists\/[^/]+$/, {
      timeout: 15_000,
    });
    const groceryListUrl = page.url();

    // --- Check off the generated item ---
    const riceCheckbox = page.getByRole("checkbox", { name: /Rice/ });
    await expect(riceCheckbox).toBeVisible();
    await riceCheckbox.click();
    await expect(riceCheckbox).toBeChecked();

    // --- On the Edit page: change the entry's target yield, doubling it
    // (composition changes live on Edit, not the read-only View page) ---
    await page.goto(`/meal-plans/${mealPlanId}/edit`);
    await entryCard.getByRole("button", { name: "Edit" }).click();
    // "Edit meal" opens as a dialog (portalled outside the entryCard <li>),
    // not inline within the entry — so its fields must be queried from the
    // dialog, not from entryCard.
    const editMealDialog = page.getByRole("dialog", { name: "Edit meal" });
    await editMealDialog.getByLabel("Target yield").fill("8");
    await editMealDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(entryCard.getByText(/Makes 8 servings/)).toBeVisible({
      timeout: 10_000,
    });
    // "Save changes" above only stages the edit in local draft state — the
    // page-level Save is what actually persists it via updateMealPlanEntry
    // (and, inside that same transaction, resyncs linked grocery lists).
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/meal-plans\/(?!new)[^/]+$/, {
      timeout: 15_000,
    });

    // --- Back on the grocery list: the checkoff survives, and the change
    // is visibly flagged rather than silently applied (§81.4) ---
    await page.goto(groceryListUrl);
    await expect(page.getByText("Plan changed")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("checkbox", { name: /Rice/ })).toBeChecked();

    // --- Complete the list: freezes it as history (§81.5) ---
    await page.getByRole("button", { name: "List actions" }).click();
    await page.getByRole("menuitem", { name: "Complete" }).click();
    await expect(page.getByText("Completed", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: "Sync now" }),
    ).not.toBeVisible();
  });
});
