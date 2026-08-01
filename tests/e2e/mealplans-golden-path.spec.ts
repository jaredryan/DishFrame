import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";

type SeedCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
};

const SEED_SCRIPT = path.join(__dirname, "seed-session.ts");

function seed(...args: string[]): string {
  return execFileSync("pnpm", ["exec", "tsx", SEED_SCRIPT, ...args], {
    encoding: "utf-8",
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      NODE_OPTIONS: "--conditions=react-server",
    },
  });
}

/**
 * BUILD_PLAN.md Slice 15's required journey: build a plan, generate a
 * synced grocery list, check off an item, edit the plan (a target-yield
 * change), confirm the list visibly reflects the sync rather than silently
 * losing the checkoff, complete the list, and confirm it freezes.
 */
test.describe("Meal Plans: build, sync grocery list, edit, complete", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    const { userId: seededUserId, cookies } = JSON.parse(seed("login")) as {
      userId: string;
      cookies: SeedCookie[];
    };
    userId = seededUserId;

    await context.addCookies(
      cookies.map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      })),
    );
  });

  test.afterEach(() => {
    seed("cleanup", userId);
  });

  test("golden path", async ({ page }) => {
    const title = `Meal Plan Test Bowl ${Date.now()}`;

    // --- Create a Recipe with a real yield + one quantified ingredient,
    // so target-yield scaling has something meaningful to change ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title, { timeout: 15_000 });
    await page.getByLabel("Yield amount").fill("4");
    await page.getByLabel("Yield unit").fill("servings");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Ingredient name").fill("Rice");
    await page.getByLabel("Quantity", { exact: true }).fill("2");
    await page.getByLabel("Unit", { exact: true }).fill("cup");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/, { timeout: 15_000 });

    // --- Create a Meal Plan ---
    await page.goto("/meal-plans");
    await page.getByRole("button", { name: "New Meal Plan" }).click();
    await page.getByLabel("Title").fill("This week");
    await page.getByRole("button", { name: "Create Meal Plan" }).click();
    await expect(page).toHaveURL(/\/meal-plans\/[^/]+$/, { timeout: 15_000 });
    const mealPlanUrl = page.url();

    // --- Add the Recipe as an entry (default target yield — no scaling) ---
    await page.getByRole("combobox", { name: "Recipe or Part" }).click();
    await page.getByRole("option", { name: title }).click();
    await page.getByRole("button", { name: "Add entry" }).click();
    const entryCard = page.locator("li").filter({ hasText: title });
    await expect(entryCard).toBeVisible({ timeout: 10_000 });

    // --- Generate a synced grocery list from the whole plan ---
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

    // --- Back on the plan: edit the entry's target yield, doubling it ---
    await page.goto(mealPlanUrl);
    await entryCard.getByRole("button", { name: "Edit" }).click();
    await entryCard.getByLabel("Target yield").fill("8");
    await entryCard.getByRole("button", { name: "Save" }).click();
    await expect(entryCard.getByText(/Makes 8 servings/)).toBeVisible({
      timeout: 10_000,
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
