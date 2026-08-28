import { test, expect, type Page, type Locator } from "@playwright/test";
import { cleanup, login } from "./helpers";

// Dashboard sections are `<section>` elements, each with its own heading —
// scoping by tag avoids collisions with the sidebar nav's own same-named
// links ("Cook", "Meal Plans", "Grocery Lists", ...).
function dashboardSection(page: Page, heading: string): Locator {
  return page.locator("section").filter({ hasText: heading });
}

test.describe("Home dashboard: navigation (empty account)", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("loads with all four sections, correct empty states, and working navigation", async ({
    page,
  }) => {
    // Generous timeout: this single test walks every section's navigation
    // targets (~9 `page.goto` calls), several of them the first visit to
    // that route in this file, each paying a one-time dev-mode compile cost
    // (see the per-route comments in cooking-golden-path.spec.ts).
    test.setTimeout(90_000);

    await page.goto("/home", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Home", level: 1 }),
    ).toBeVisible({ timeout: 15_000 });

    for (const heading of [
      "Continue cooking",
      "Recently updated",
      "Meal plans",
      "Grocery lists",
    ]) {
      await expect(
        page.getByRole("heading", { name: heading, level: 2 }),
      ).toBeVisible();
    }

    // --- Continue cooking: Start cooking opens the "What will you
    // cook?" picker, empty state, View cooking sessions -> Cook ---
    const cooking = dashboardSection(page, "Continue cooking");
    await expect(
      cooking.getByText(
        "Open a Recipe or Part and choose Cook to start a Cooking Session.",
      ),
    ).toBeVisible();
    await cooking.getByRole("button", { name: "Start cooking" }).click();
    const picker = page.getByRole("dialog", {
      name: "What will you cook?",
    });
    await expect(picker).toBeVisible();
    await expect(
      picker.getByText("You don't have any recipes or parts saved yet."),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Cook", exact: true }),
    ).toBeDisabled();
    await picker.getByRole("button", { name: "Cancel" }).click();
    await expect(picker).not.toBeVisible();

    await cooking.getByRole("link", { name: "View cooking sessions" }).click();
    await expect(page).toHaveURL(/\/cook$/, { timeout: 15_000 });

    // --- Cook page's own Start cooking action opens the same picker ---
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(
      page.getByRole("dialog", { name: "What will you cook?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    // --- Recently updated: empty state, + Create menu, View recipes/parts ---
    await page.goto("/home");
    const recent = dashboardSection(page, "Recently updated");
    await expect(
      recent.getByRole("link", { name: "create your first Recipe" }),
    ).toHaveAttribute("href", "/recipes/new");

    await recent.getByRole("button", { name: "Create" }).click();
    const menuItems = page.getByRole("menuitem");
    await expect(menuItems).toHaveText(["Create recipe", "Create part"]);
    await page.getByRole("menuitem", { name: "Create recipe" }).click();
    await expect(page).toHaveURL(/\/recipes\/new$/, { timeout: 15_000 });

    await page.goto("/home");
    await dashboardSection(page, "Recently updated")
      .getByRole("button", { name: "Create" })
      .click();
    await page.getByRole("menuitem", { name: "Create part" }).click();
    await expect(page).toHaveURL(/\/parts\/new$/, { timeout: 15_000 });

    await page.goto("/home");
    await dashboardSection(page, "Recently updated")
      .getByRole("link", { name: "View recipes" })
      .click();
    await expect(page).toHaveURL(/\/recipes$/, { timeout: 15_000 });

    await page.goto("/home");
    await dashboardSection(page, "Recently updated")
      .getByRole("link", { name: "View parts" })
      .click();
    await expect(page).toHaveURL(/\/parts$/, { timeout: 15_000 });

    // --- Meal plans: empty state, primary action -> create page, View meal plans -> Meal Plans ---
    await page.goto("/home");
    const mealPlans = dashboardSection(page, "Meal plans");
    await expect(mealPlans.getByText("No Meal Plans yet.")).toBeVisible();
    await mealPlans.getByRole("link", { name: "Plan meals" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/new$/, { timeout: 15_000 });
    await expect(page.getByLabel("Title")).toBeVisible();

    await page.goto("/home");
    await dashboardSection(page, "Meal plans")
      .getByRole("link", { name: "View meal plans" })
      .click();
    await expect(page).toHaveURL(/\/meal-plans$/, { timeout: 15_000 });

    // --- Grocery lists: empty state, primary action + View grocery lists both -> Grocery Lists ---
    await page.goto("/home");
    const groceryLists = dashboardSection(page, "Grocery lists");
    await expect(
      groceryLists.getByText("No active grocery lists."),
    ).toBeVisible();
    await groceryLists.getByRole("link", { name: "Make grocery list" }).click();
    await expect(page).toHaveURL(/\/grocery-lists$/, { timeout: 15_000 });

    await page.goto("/home");
    await dashboardSection(page, "Grocery lists")
      .getByRole("link", { name: "View grocery lists" })
      .click();
    await expect(page).toHaveURL(/\/grocery-lists$/, { timeout: 15_000 });
  });
});

test.describe("Home dashboard: populated data", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("surfaces real Recipes, Parts, an active Cooking Session, a Meal Plan, and a Grocery List", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const recipeTitle = `Home Dash Recipe ${Date.now()}`;
    const partTitle = `Home Dash Part ${Date.now()}`;
    const mealPlanTitle = `Home Dash Plan ${Date.now()}`;
    const groceryListTitle = `Home Dash Groceries ${Date.now()}`;

    // --- Recipe, with an ingredient so it can back a grocery list ---
    await page.goto("/recipes/new");
    await page
      .getByLabel("Recipe title")
      .fill(recipeTitle, { timeout: 15_000 });
    await page.getByLabel("Yield amount").fill("4");
    await page.getByLabel("Yield unit").fill("servings");

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const recipeSectionDialog = page.getByRole("dialog");
    await recipeSectionDialog
      .getByRole("button", { name: "Add ingredient" })
      .click();
    await recipeSectionDialog.getByLabel("Ingredient name").fill("Basil");
    await recipeSectionDialog
      .getByRole("button", { name: "Finish section" })
      .click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Excludes "new" explicitly: `/\/recipes\/[^/]+$/` alone would also
    // match the still-unsaved /recipes/new form itself, masking a save
    // failure as a pass.
    await expect(page).toHaveURL(/\/recipes\/(?!new$)[^/]+$/, {
      timeout: 15_000,
    });

    // --- Part ---
    await page.goto("/parts/new");
    await page.getByLabel("Part title").fill(partTitle, { timeout: 15_000 });
    // A Dish must have at least one ingredient/instruction/linked Part to
    // save (§8.3's minimum-content rule, shared by Recipes and Parts).
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const partSectionDialog = page.getByRole("dialog");
    await partSectionDialog
      .getByRole("button", { name: "Add ingredient" })
      .click();
    await partSectionDialog.getByLabel("Ingredient name").fill("Tomato Paste");
    await partSectionDialog
      .getByRole("button", { name: "Finish section" })
      .click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/parts\/(?!new$)[^/]+$/, {
      timeout: 15_000,
    });

    // --- Active Cooking Session, started via the Home "What will you
    // cook?" picker: search, select the Recipe, Cook lands on its Cooking
    // setup route (same as the Recipe's own Cook button), then the existing
    // Start cooking there creates the real session and enters Cooking Mode.
    await page.goto("/home");
    await dashboardSection(page, "Continue cooking")
      .getByRole("button", { name: "Start cooking" })
      .click();
    const picker = page.getByRole("dialog", {
      name: "What will you cook?",
    });
    await expect(picker).toBeVisible();
    await picker.getByPlaceholder("Search").fill(recipeTitle);
    await picker.getByRole("radio", { name: new RegExp(recipeTitle) }).click();
    await picker.getByRole("button", { name: "Cook", exact: true }).click();
    await expect(page).toHaveURL(/\/cook\?from=home&versionId=[^&]+$/, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });

    // --- Meal Plan ---
    await page.goto("/meal-plans");
    // The list page's CTA is a Link (asChild Button), so its role is "link";
    // the create page's submit button below is a real <button>.
    await page.getByRole("link", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/new$/, { timeout: 15_000 });
    await page.getByLabel("Title").fill(mealPlanTitle);
    await page.getByRole("button", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/(?!new)[^/]+$/, {
      timeout: 15_000,
    });

    // --- Grocery List, generated from the Recipe ---
    await page.goto("/grocery-lists");
    await page.getByRole("button", { name: "Make grocery list" }).click();
    await page.getByLabel("Title").fill(groceryListTitle);
    await page.getByRole("checkbox", { name: recipeTitle }).check();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page).toHaveURL(/\/grocery-lists\/[^/]+$/, {
      timeout: 15_000,
    });

    // --- Home reflects all of the above ---
    await page.goto("/home");

    const cooking = dashboardSection(page, "Continue cooking");
    await expect(cooking.getByText(recipeTitle)).toBeVisible({
      timeout: 15_000,
    });

    const recent = dashboardSection(page, "Recently updated");
    await expect(recent.getByText(recipeTitle)).toBeVisible();
    await expect(recent.getByText(partTitle)).toBeVisible();
    await expect(recent.getByText("Recipe", { exact: true })).toBeVisible();
    await expect(recent.getByText("Part", { exact: true })).toBeVisible();

    const mealPlans = dashboardSection(page, "Meal plans");
    await expect(mealPlans.getByText(mealPlanTitle)).toBeVisible();

    const groceryLists = dashboardSection(page, "Grocery lists");
    await expect(groceryLists.getByText(groceryListTitle)).toBeVisible();
  });
});
