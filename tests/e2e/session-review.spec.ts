import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * BUILD_PLAN.md Slice 9's required journey: finish a Cooking Session, save a
 * rating-only Session Review, see the resulting rating summary on the
 * Recipe, edit the Review, delete it, and confirm the Cooking Session's
 * evidence (checklist progress, Cooking notes) survives the deletion.
 * Written per Slice 9 policy but not run in this pass.
 */
test.describe("Session Review: rate, edit, delete, evidence survives", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("golden path", async ({ page }) => {
    const title = `Review Test Bowl ${Date.now()}`;

    // --- Create a simple one-Section Recipe ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title);

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Prep");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Ginger");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

    // --- Cooking Setup → Start cooking ---
    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    await expect(page).toHaveURL(/\/cook$/);
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    const sessionId = page.url().match(/\/cook\/([^/]+)/)![1];

    // --- Cooking notes live on the Recipe overview, which is where desktop
    // opens by default (refinement pass item 1) — editable during cooking ---
    // Mobile's layout stays in the DOM (`lg:hidden`) alongside desktop's, so
    // a bare CSS-selector locator like `locator("textarea")` — unfiltered by
    // the accessibility tree, unlike `getByRole` — matches both copies.
    // Scope to <main>, the desktop layout's unique landmark.
    const main = page.getByRole("main");
    await main.locator("textarea").fill("Used a bigger knife.");
    await page.getByRole("button", { name: "Save notes" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // --- Check off progress in the one Section, so there's real evidence
    // to preserve. Scoped to the nav landmark — the Recipe overview's own
    // Sections list at the bottom also has a same-named button. ---
    const cookingNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    await cookingNav.getByRole("button", { name: /Prep/ }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: title, exact: true }).click();

    // --- Finish the session → redirected straight to the Review ---
    await page.getByRole("button", { name: "End cooking" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Finish session" })
      .click();
    await expect(page).toHaveURL(`/cook/${sessionId}/review`);
    await expect(
      page.getByRole("heading", { name: `How did ${title} go?` }),
    ).toBeVisible();

    // --- Save a rating-only Review (5 stars for "You") ---
    await page.getByRole("radio", { name: "5 stars" }).click();
    await page.getByRole("button", { name: "Save review" }).click();
    await expect(
      page.getByRole("heading", { name: "Review saved" }),
    ).toBeVisible();

    // --- Edit recipe opens the shared editor pinned to the exact cooked
    // Version, with session evidence quickly accessible without losing
    // unsaved edits (§39.4/§39.5) ---
    await page.getByRole("link", { name: "Edit recipe" }).click();
    await expect(page).toHaveURL(
      new RegExp(
        `/recipes/[^/]+/edit\\?versionId=[^&]+&sessionId=${sessionId}$`,
      ),
    );
    const dishId = page.url().match(/\/recipes\/([^/]+)\/edit/)![1];
    await page.getByRole("button", { name: "View session evidence" }).click();
    await expect(page.getByText("5/5")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Recipe title")).toHaveValue(title);

    // --- The rating summary now appears on the Recipe. The post-save "Done"
    // screen is transient client state (session-review-form.tsx's
    // `justSaved`) that doesn't survive a fresh navigation, so reaching the
    // Recipe page goes direct rather than round-tripping through a reloaded
    // Review page. ---
    await page.goto(`/recipes/${dishId}`);
    await expect(page.getByText("5.0/5")).toBeVisible();

    // --- Edit the Review: change the rating to 3 stars ---
    await page.goto(`/cook/${sessionId}/review`);
    await page.getByRole("radio", { name: "3 stars" }).click();
    await page.getByRole("button", { name: "Save review" }).click();
    await expect(
      page.getByRole("heading", { name: "Review saved" }),
    ).toBeVisible();

    // --- Delete the Review, confirming the warning first ---
    await page.goto(`/cook/${sessionId}/review`);
    await page.getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Delete Review" })
      .click();
    await expect(page).toHaveURL(`/cook/${sessionId}`);

    // --- Cooking Session evidence and Cooking notes survive the deletion ---
    await expect(main.locator("textarea")).toHaveValue("Used a bigger knife.");
    await cookingNav.getByRole("button", { name: /Prep/ }).click();
    await expect(page.getByRole("checkbox")).toBeChecked();
  });
});
