import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * BUILD_PLAN.md Slice 10 e2e journey: search, multi-criterion filtering, and
 * the visible active-filter chips (§47.8's example).
 */
test.describe("Recipe library: search, filters, and active-filter chips", () => {
  test.describe.configure({ mode: "serial" });

  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("multi-criterion filter narrows the library and shows matching active-filter chips", async ({
    page,
  }) => {
    const matchTitle = `Vietnamese Pho ${Date.now()}`;
    const otherTitle = `Thai Curry ${Date.now()}`;

    // --- Create the "High Protein" tag up front, from Settings ---
    await page.goto("/settings");
    // Scoped to the tag-creation form specifically: Slice 10 added the Tag
    // and Flavor Profile managers inline in /settings alongside the
    // pre-existing Taster/Grocery Category managers, so a bare "Add" button
    // role query now matches more than one form's submit button.
    const tagForm = page.locator("form", { hasText: "Add a tag" });
    await tagForm.getByLabel("Add a tag").fill("High Protein");
    await tagForm.getByRole("button", { name: "Add" }).click();

    // --- Recipe 1: Active, Vietnamese — will match every filter below ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(matchTitle);
    await page.getByLabel("Cuisine").fill("Vietnamese");
    // Stage is a Radix Select (combobox), not a native <select>.
    await page.getByRole("combobox", { name: /stage/i }).click();
    await page.getByRole("option", { name: "Active" }).click();

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const matchSectionDialog = page.getByRole("dialog");
    await matchSectionDialog
      .getByRole("button", { name: "Add ingredient" })
      .click();
    await matchSectionDialog.getByLabel("Ingredient name").fill("Rice noodles");
    await matchSectionDialog
      .getByRole("button", { name: "Finish section" })
      .click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // Tag it "High Protein" via the detail page's Tags & Flavors popover.
    await page.getByRole("button", { name: "Tags & Flavors" }).click();
    await page.getByText("High Protein").click();
    await page.getByRole("button", { name: "Save" }).click();

    // --- Recipe 2: a different cuisine — must not match the filter below ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(otherTitle);
    await page.getByLabel("Cuisine").fill("Thai");

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const otherSectionDialog = page.getByRole("dialog");
    await otherSectionDialog
      .getByRole("button", { name: "Add ingredient" })
      .click();
    await otherSectionDialog.getByLabel("Ingredient name").fill("Coconut milk");
    await otherSectionDialog
      .getByRole("button", { name: "Finish section" })
      .click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // --- Apply Stage=Active + Cuisine=Vietnamese + Tag=High Protein ---
    // Each checkbox click below is scoped to the open popover's own content
    // (rather than a bare page-wide `getByText`), since both "Active" and
    // "Vietnamese" also appear as plain text on the already-visible Recipe
    // cards in the library grid behind the popover, making an unscoped text
    // query ambiguous.
    const popoverContent = page.locator('[data-slot="popover-content"]');
    await page.goto("/recipes");
    await page.getByRole("button", { name: "Stage" }).click();
    await popoverContent.getByText("Active").click();
    await page.getByRole("button", { name: "Cuisine" }).click();
    await popoverContent.getByText("Vietnamese").click();
    await page.getByRole("button", { name: "Tags" }).click();
    await popoverContent.getByText("High Protein").click();

    await expect(page.getByText(matchTitle)).toBeVisible();
    await expect(page.getByText(otherTitle)).not.toBeVisible();

    // §47.8: active criteria remain visible as chips. Scoped to each chip's
    // own "Remove … filter" control (unique) rather than bare text, since
    // the one matching Recipe card behind the filter bar also shows
    // "Active"/"Vietnamese" as plain Stage/cuisine text.
    await expect(
      page.getByRole("button", { name: "Remove Active filter" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove Vietnamese filter" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remove High Protein filter" }),
    ).toBeVisible();

    // Clearing all filters restores both recipes.
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByText(matchTitle)).toBeVisible();
    await expect(page.getByText(otherTitle)).toBeVisible();
  });
});
