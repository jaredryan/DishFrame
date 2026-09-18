import { test, expect, type Page } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * Multi-source Cooking Sessions completion pass (2026-09-18) — the
 * source-specific post-cook review wizard: per-source stepping, ratings
 * staying source-specific (not combined), deferred/revisited review
 * behavior, and a non-primary source's review correctly targeting its own
 * Recipe/Part and its own Cooking history.
 *
 * Written per this repo's own established E2E policy (see
 * cooking-mode-timers.spec.ts) but not run in this pass — the owner runs
 * the suite themselves after review.
 *
 * Note: quantitative separation of actual-yield/notes across sources is
 * already covered at the service layer by
 * multi-source.integration.test.ts's "one Cooking Session holds separate
 * source reviews" — these E2E tests use star ratings as the UI-visible
 * proof of source-specific data instead of re-asserting that math here.
 */

async function createRecipe(
  page: Page,
  title: string,
  sectionName: string,
  ingredientName: string,
): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByLabel("Recipe title").fill(title, { timeout: 15_000 });
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const sectionDialog = page.getByRole("dialog");
  await sectionDialog.getByLabel("Section name").fill(sectionName);
  await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
  await sectionDialog.getByLabel("Ingredient name").fill(ingredientName);
  await sectionDialog.getByRole("button", { name: "Finish section" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 15_000,
  });
  return page.url().split("/recipes/")[1];
}

async function pickAndContinueToSetup(
  page: Page,
  titles: string[],
): Promise<void> {
  await page.goto("/cook");
  await page.getByRole("button", { name: "Start cooking" }).click();
  const dialog = page.getByRole("dialog", { name: "What will you cook?" });
  for (const title of titles) {
    await dialog.getByRole("checkbox", { name: new RegExp(title) }).click();
  }
  await dialog.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL("/cook/setup", { timeout: 15_000 });
}

async function startAndEndSession(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start cooking" }).click();
  // Excludes "setup" explicitly — this click starts from `/cook/setup`,
  // which otherwise also satisfies `[^/]+$` and lets this resolve before
  // the click's own navigation/session-creation actually completes.
  await expect(page).toHaveURL(/\/cook\/(?!setup$)[^/]+$/, {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "End cooking" }).click();
  await page.getByRole("button", { name: "Finish session" }).click();
  await expect(page).toHaveURL(/\/cook\/[^/]+\/review/, { timeout: 15_000 });
}

async function rateAndSave(page: Page, stars: number): Promise<void> {
  await page
    .getByRole("radiogroup", { name: "Rate your own experience" })
    .getByRole("radio", { name: `${stars} star${stars === 1 ? "" : "s"}` })
    .click();
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(
    page.getByRole("heading", { name: "Review saved" }),
  ).toBeVisible();
}

test.describe("Multi-source session review", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("ending a multi-source session opens the source-specific review wizard, which advances through each source independently and keeps ratings source-specific", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Chicken prep", "Chicken rice");
    await createRecipe(page, beef, "Beef prep", "Beef noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);
    await startAndEndSession(page);

    await expect(page.getByText("Reviewing 1 of 2")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`How did ${chicken} go\\?`),
      }),
    ).toBeVisible();
    await rateAndSave(page, 4);
    await page.getByRole("link", { name: "Continue" }).click();

    await expect(page.getByText("Reviewing 2 of 2")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: new RegExp(`How did ${beef} go\\?`) }),
    ).toBeVisible();
    await rateAndSave(page, 2);
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });

    // Reopening each source's own review confirms the ratings landed on the
    // correct, separate source rather than being combined or overwritten.
    // (The source-overview buttons sit above the `<nav aria-label="Cooking
    // navigation">` element, not inside it, so they're located directly.)
    await page.getByRole("button", { name: chicken, exact: true }).click();
    await page.getByRole("link", { name: /^(Add|Edit) Review$/ }).click();
    await expect(
      page.getByRole("radio", { name: "4 stars", checked: true }),
    ).toBeVisible();

    await page.goBack();
    await page.getByRole("button", { name: beef, exact: true }).click();
    await page.getByRole("link", { name: /^(Add|Edit) Review$/ }).click();
    await expect(
      page.getByRole("radio", { name: "2 stars", checked: true }),
    ).toBeVisible();
  });

  test("skipping a source's review, then reopening it later via that source's own overview, saves it independently; revising a non-primary source's review lands on that source's own Recipe and its own Cooking history recognizes the session", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Chicken prep", "Chicken rice");
    const beefId = await createRecipe(page, beef, "Beef prep", "Beef noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);
    await startAndEndSession(page);

    // Save the primary source's (chicken) review, then defer the
    // non-primary source's (beef) review.
    await rateAndSave(page, 4);
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page.getByText("Reviewing 2 of 2")).toBeVisible();
    await page.getByRole("link", { name: "Skip this one" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    const sessionUrl = page.url();

    // Revisit beef's (non-primary source) own deferred review from its own
    // overview.
    await page.getByRole("button", { name: beef, exact: true }).click();
    await page.getByRole("link", { name: /^(Add|Edit) Review$/ }).click();
    await expect(page.getByText("Reviewing 2 of 2")).toBeVisible();
    await rateAndSave(page, 2);

    // The post-save success screen's "View recipe" targets beef's own
    // Recipe — not chicken's (the session's primary/source[0]) — proving a
    // non-primary source's review is wired to the correct underlying Dish.
    await page.getByRole("link", { name: "View recipe" }).click();
    await expect(page).toHaveURL(new RegExp(`/recipes/${beefId}$`), {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: beef })).toBeVisible();

    // Beef's own Cooking history now recognizes its participation as a
    // non-primary source — no longer the untouched empty state.
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: "Cooking history" }).click();
    await expect(page).toHaveURL(new RegExp(`/recipes/${beefId}/history$`), {
      timeout: 15_000,
    });
    await expect(
      page.getByText("No completed Cooking Sessions yet."),
    ).not.toBeVisible();

    // Chicken's earlier-saved review is untouched by beef's later save.
    await page.goto(sessionUrl);
    await page.getByRole("button", { name: chicken, exact: true }).click();
    await page.getByRole("link", { name: /^(Add|Edit) Review$/ }).click();
    await expect(
      page.getByRole("radio", { name: "4 stars", checked: true }),
    ).toBeVisible();
  });
});
