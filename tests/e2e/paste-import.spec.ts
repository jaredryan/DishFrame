import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * BUILD_PLAN.md Slice 11, PRODUCT_SPEC.md §56.1/§59: paste raw recipe text,
 * review the deterministic parser's proposal, correct a field the parser
 * couldn't confidently place, confirm, and see the result in the library.
 */
test.describe("Paste-and-review import", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("paste, review, correct a misparsed field, confirm, and find it in the library", async ({
    page,
  }) => {
    const title = `Grilled Cheese Sandwich ${Date.now()}`;
    const pastedText = [
      title,
      "",
      "This recipe has been passed down in my family for three generations and everyone always asks for it whenever I bring it to a gathering, potluck, or holiday dinner of any kind",
      "",
      "- 2 slices bread",
      "- 1 cup shredded cheddar",
      "",
      "1. Butter the bread.",
      "2. Cook until golden on both sides.",
    ].join("\n");

    await page.goto("/recipes");
    await page.getByRole("link", { name: "Import" }).click();
    await expect(page).toHaveURL(/\/recipes\/import$/);

    await page.getByLabel("Pasted recipe text").fill(pastedText);
    await page.getByRole("button", { name: "Parse recipe" }).click();

    await expect(
      page.getByRole("heading", { name: "Review imported recipe" }),
    ).toBeVisible();
    await expect(
      page.getByText(/couldn't be confidently structured/),
    ).toBeVisible();
    await expect(page.getByLabel("Recipe title")).toHaveValue(title);

    // Correct the one field the deterministic parser couldn't confidently
    // place — the long unstructured line landed in its own "Needs review"
    // Section as a single instruction row; opening that Section's modal is
    // required to edit it, same as any other Section. Rewrite it as a real,
    // short cooking note, then commit it back via "Finish section".
    await page.getByRole("button", { name: "Edit Needs review" }).click();
    const needsReviewDialog = page.getByRole("dialog");
    await needsReviewDialog
      .getByRole("textbox", { name: /Instruction/, exact: false })
      .fill("A family favorite.");
    await needsReviewDialog
      .getByRole("button", { name: "Finish section" })
      .click();

    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("shredded cheddar")).toBeVisible();
    await expect(page.getByText("A family favorite.")).toBeVisible();

    await page.goto("/recipes");
    await expect(page.getByText(title)).toBeVisible();
  });
});
