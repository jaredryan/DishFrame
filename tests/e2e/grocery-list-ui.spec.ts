import { test, expect, type Page } from "@playwright/test";
import { cleanup, login, nativeButton, waitForServerAction } from "./helpers";

/**
 * Grocery List UI behavior that relies on real browser state/navigation —
 * the "New grocery list" flow's Recipes & Parts basis, the standalone
 * source card's primary Edit interaction, Mark complete/Reopen read-only
 * behavior (§12), the Meal Plan basis, the index card's View-details vs.
 * Linked-to-meal-plan-link distinction, and the Meal Plan entry inclusion
 * checkbox (§81.7).
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
  // Excludes "new": the bare pattern also matches the still-unsaved
  // /recipes/new form, letting the test click "Grocery Lists" before the
  // save redirect lands — the unsaved-changes guard on /recipes/new then
  // swallows that click instead of navigating (see home-dashboard.spec.ts).
  await expect(page).toHaveURL(/\/recipes\/(?!new$)[^/]+$/, {
    timeout: 15_000,
  });
}

/**
 * Opens the "List actions" dropdown and clicks `itemName`, retrying the
 * whole open+wait+click if the menu never opens, or the item detaches
 * mid-click. A `router.refresh()` from the *previous* List-actions
 * mutation (see `grocery-list-detail-view.tsx`'s `runAction`) can still be
 * settling in the background even after its own DOM changes are visible,
 * and if it lands while this dropdown is open, it can close/remount it out
 * from under the click, or before the item ever becomes visible —
 * reproduced via a captured Playwright trace showing the item detach
 * ~60ms after opening, then never reappear. The visibility wait itself
 * must be inside the retry (a short per-attempt timeout, not the default
 * 5s) so an attempt that catches the menu mid-remount doesn't burn the
 * whole budget before a later attempt gets a chance.
 */
async function clickListAction(page: Page, itemName: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.getByRole("button", { name: "List actions" }).click();
      const item = page.getByRole("menuitem", { name: itemName });
      await expect(item).toBeVisible({ timeout: 3_000 });
      await item.click({ timeout: 3_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      // The dropdown may still be open (just showing stale content) after
      // a failed attempt — close it before the next attempt reopens it,
      // so that click unambiguously starts a fresh open.
      await page.keyboard.press("Escape").catch(() => {});
    }
  }
}

test.describe("Grocery List UI", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("New grocery list (Recipes & parts basis), standalone source card Edit, and Mark complete/Reopen read-only behavior", async ({
    page,
  }) => {
    const recipeTitle = `Grocery Test Bowl ${Date.now()}`;
    await createRecipe(page, recipeTitle);

    // Reached via the primary nav link (like a real user), rather than a
    // direct page.goto — the same click-through navigation the Meal Plan
    // create flow already relies on elsewhere in this suite.
    await page.getByRole("link", { name: "Grocery Lists" }).click();
    await expect(page).toHaveURL(/\/grocery-lists$/, { timeout: 15_000 });
    await nativeButton(page, "Make grocery list").click();
    const dialog = page.getByRole("dialog", { name: "New grocery list" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Recipes & parts" }).click();
    const candidateCheckbox = dialog.getByRole("checkbox", {
      name: `Select ${recipeTitle}`,
    });
    await expect(candidateCheckbox).toBeVisible();
    await candidateCheckbox.click();

    await dialog.getByRole("button", { name: "Next" }).click();
    const generateButton = dialog.getByRole("button", {
      name: "Generate",
      exact: true,
    });
    await expect(generateButton).toBeEnabled({ timeout: 10_000 });
    await generateButton.click();
    await expect(page).toHaveURL(/\/grocery-lists\/[^/]+$/, {
      timeout: 15_000,
    });

    // --- Standalone source card: clicking the card body (not its icon
    // actions) opens Edit ---
    // `.first()`: the Groceries section below can render a same-named
    // source-attribution badge (GroceryItemRow's `canRecombine` badge in
    // grocery-list-detail-view.tsx) once items are combined/uncombined,
    // so a bare text match is no longer unique — the Meals section (and
    // this source card's own title) renders first in DOM order.
    await page.getByText(recipeTitle).first().click();
    await expect(
      page.getByRole("dialog", { name: `Edit ${recipeTitle}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    const riceCheckbox = page.getByRole("checkbox", { name: /Rice/ });
    await expect(riceCheckbox).toBeEnabled();

    // --- Mark complete makes the list read-only ---
    await clickListAction(page, "Mark complete");
    await expect(page.getByText("Completed", { exact: true })).toBeVisible();
    await expect(riceCheckbox).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Add item" }),
    ).not.toBeVisible();

    // --- Reopen restores normal editing ---
    // Not waitForServerAction: `isCompleted` is driven purely by the
    // server-returned `list.completedAt` (no optimistic override), so the
    // assertions below already prove the mutation landed via their own
    // auto-retry.
    await clickListAction(page, "Reopen");
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(riceCheckbox).toBeEnabled();
    await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  });

  test("Meal plan basis, index card View-details vs. Linked-to-meal-plan-link, and the Meal Plan entry inclusion checkbox", async ({
    page,
  }) => {
    const recipeTitle = `Linked Grocery Bowl ${Date.now()}`;
    await createRecipe(page, recipeTitle);

    // --- A small Meal Plan with one entry, to generate a linked list from ---
    const mealPlanTitle = `Grocery Link Plan ${Date.now()}`;
    await page.goto("/meal-plans");
    await page.getByRole("link", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/new$/, { timeout: 15_000 });
    // Mandatory first-pass Details modal (§3) — confirm via "Next".
    await page.getByLabel("Title").fill(mealPlanTitle);
    await page.getByRole("button", { name: "Next" }).click();
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
    await page.getByRole("button", { name: "Create meal plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/(?!new)[^/]+$/, {
      timeout: 15_000,
    });
    const mealPlanId = page.url().split("/").pop()!;

    // --- New grocery list dialog defaults to the "Meal plan" basis ---
    await page.goto("/grocery-lists");
    await page.getByRole("button", { name: "Make grocery list" }).click();
    const dialog = page.getByRole("dialog", { name: "New grocery list" });
    await expect(
      dialog.getByRole("radio", { name: "Meal plan" }),
    ).toHaveAttribute("aria-checked", "true");
    await dialog
      .getByRole("button", { name: mealPlanTitle, exact: false })
      .click();
    await expect(
      dialog.getByRole("checkbox", { name: recipeTitle }),
    ).toBeChecked({ timeout: 10_000 });

    const generateButton = dialog.getByRole("button", {
      name: "Generate",
      exact: true,
    });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(page).toHaveURL(/\/grocery-lists\/[^/]+$/, {
      timeout: 15_000,
    });
    const groceryListId = page.url().split("/").pop()!;

    // --- Meal Plan entry inclusion checkbox toggles and persists ---
    const entryCheckbox = page.getByRole("checkbox", {
      name: `Include ${recipeTitle} in this grocery list`,
    });
    await expect(entryCheckbox).toBeChecked();
    await waitForServerAction(page, () => entryCheckbox.click());
    await expect(entryCheckbox).not.toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("checkbox", {
        name: `Include ${recipeTitle} in this grocery list`,
      }),
    ).not.toBeChecked();

    // --- Index card: the "Meal plan: ..." link navigates to the Meal Plan
    // without triggering the card's own View-details action ---
    await page.goto("/grocery-lists");
    const card = page
      .locator("li")
      .filter({ has: page.getByRole("link", { name: /Meal plan:/ }) });
    await card.getByRole("link", { name: /Meal plan:/ }).click();
    await expect(page).toHaveURL(new RegExp(`/meal-plans/${mealPlanId}$`), {
      timeout: 15_000,
    });

    // --- The card's primary View-details action (the whole-row click
    // target) opens the Grocery List ---
    await page.goto("/grocery-lists");
    await page
      .getByRole("link", { name: "View details for Grocery list" })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/grocery-lists/${groceryListId}$`),
      {
        timeout: 15_000,
      },
    );
  });
});
