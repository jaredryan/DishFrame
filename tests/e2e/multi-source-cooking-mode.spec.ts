import { test, expect, type Page } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * Multi-source Cooking Sessions (owner spec, 2026-09-17; completion pass,
 * 2026-09-18) — combined Cooking Mode: per-source nav above the divider,
 * shared-Part consolidation as one checklist/progress unit, live per-source
 * rescale isolation and exact pinned-Version behavior, and the guard
 * release/resume lifecycle across every participating source.
 *
 * Written per this repo's own established E2E policy (see
 * cooking-mode-timers.spec.ts) but not run in this pass — the owner runs
 * the suite themselves after review.
 */

async function createRecipe(
  page: Page,
  title: string,
  sectionName: string,
  ingredientName: string,
): Promise<void> {
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
}

async function createPart(
  page: Page,
  title: string,
  ingredientName: string,
  yieldQuantity: string,
  yieldUnit: string,
): Promise<void> {
  await page.goto("/parts/new");
  await page.getByLabel("Part title").fill(title, { timeout: 15_000 });
  await page.getByLabel("Yield amount").fill(yieldQuantity);
  await page.getByLabel("Yield unit").fill(yieldUnit);
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const sectionDialog = page.getByRole("dialog");
  await sectionDialog.getByLabel("Section name").fill("Make it");
  await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
  await sectionDialog.getByLabel("Ingredient name").fill(ingredientName);
  await sectionDialog.getByRole("button", { name: "Finish section" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/parts\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: title })).toBeVisible({
    timeout: 15_000,
  });
}

async function attachPartAndSave(
  page: Page,
  partTitle: string,
  containerTitle: string,
): Promise<void> {
  await page.getByRole("button", { name: "Attach a part" }).click();
  const dialog = page.getByRole("dialog", { name: "Attach a part" });
  await dialog.getByRole("radio", { name: new RegExp(partTitle) }).click();
  await dialog.getByRole("button", { name: "Attach" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/(recipes|parts)\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(page.getByRole("heading", { name: containerTitle })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
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

async function startCookingFromSetup(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Start cooking" }).click();
  // Excludes "setup" specifically — `/cook/setup` is the page we start this
  // click from, and it otherwise satisfies `[^/]+$` too, letting this
  // resolve immediately (before the click's own navigation even begins)
  // and bake the wrong, stale URL into every caller's `sessionUrl`.
  await expect(page).toHaveURL(/\/cook\/(?!setup$)[^/]+$/, {
    timeout: 15_000,
  });
  return page.url().split("/cook/")[1];
}

/** Extracts just the leading "V{major}.{minor}" version label from the
 * source overview's identity paragraph — that `<p>` also concatenates a
 * live-updating elapsed-time string, so comparing its full textContent
 * across two points in time would spuriously differ even when the Version
 * itself hasn't changed. */
async function readVersionLabel(page: Page): Promise<string> {
  const text = await page
    .getByText(/^V\d+(\.\d+)?/)
    .first()
    .textContent();
  const match = text?.match(/^V\d+(\.\d+)?/);
  if (!match) throw new Error(`No version label found in: ${text}`);
  return match[0];
}

test.describe("Combined Cooking Mode", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("a shared Part consolidates into one Cooking Mode unit shown once in the combined nav, with per-source allocation, and its checklist/progress is a single shared item", async ({
    page,
  }) => {
    const carrots = `Roasted Carrots ${Date.now()}`;
    await createPart(page, carrots, "Diced carrots", "2", "cups");

    const chicken = `Chicken Bowl ${Date.now()}`;
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(chicken, { timeout: 15_000 });
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    let sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Chicken prep");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Chicken rice");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();
    // Let the Section dialog's own close animation/unmount finish before
    // opening the next dialog — starting "Attach a part" while it's still
    // exiting is what made the picker's radio unstable/detached below.
    await expect(sectionDialog).not.toBeVisible();
    await attachPartAndSave(page, carrots, chicken);

    const beef = `Beef Bowl ${Date.now()}`;
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(beef, { timeout: 15_000 });
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Beef prep");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Beef noodles");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();
    await expect(sectionDialog).not.toBeVisible();
    await attachPartAndSave(page, carrots, beef);

    await pickAndContinueToSetup(page, [chicken, beef]);
    // The combined Setup list shows the shared Part exactly once, labeled
    // "Shared" (joined with its counts/duration on one line, e.g.
    // "Shared · 1 ingredient" — never an exact-text match) — proof the two
    // identical-Part-and-Version attachments consolidated before the
    // session was even created.
    await expect(page.getByText(/^Shared\b/)).toBeVisible();
    await expect(page.getByText(carrots)).toHaveCount(1);

    await startCookingFromSetup(page);

    const cookingNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    // Both sources' own overview entries sit above the divider.
    await expect(
      page.getByRole("button", { name: chicken, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: beef, exact: true }),
    ).toBeVisible();
    // The shared Part appears exactly once in the Section list, not once
    // per contributing source.
    await expect(
      cookingNav.getByRole("button", { name: new RegExp(carrots) }),
    ).toHaveCount(1);

    await cookingNav.getByRole("button", { name: new RegExp(carrots) }).click();
    await expect(page.getByRole("heading", { name: carrots })).toBeVisible();
    // Restrained per-source allocation line (session-view.ts's `contributors`,
    // cooking-mode-desktop-layout.tsx's `SectionPanel`) names both
    // contributing sources — rendered as its own `<p>`. Scoped to that tag:
    // an unscoped text match also resolves to the nav button's own
    // "+"-joined `sourceLabel` and an ancestor `<ul>` whose combined
    // descendant text happens to satisfy the same regex (strict-mode
    // violation otherwise).
    const allocationText = page.locator("p").filter({
      hasText: new RegExp(`${chicken}.*${beef}|${beef}.*${chicken}`),
    });
    await expect(allocationText).toBeVisible();

    // Checking off the shared Part's own ingredient marks one unit, not a
    // per-source copy — confirmed by revisiting via a different source's
    // overview and finding the same unit still checked.
    await page.getByRole("checkbox", { name: "Diced carrots" }).check();
    await expect(
      page.getByRole("checkbox", { name: "Diced carrots" }),
    ).toBeChecked();

    await page.getByRole("button", { name: chicken, exact: true }).click();
    await cookingNav.getByRole("button", { name: new RegExp(carrots) }).click();
    await expect(
      page.getByRole("checkbox", { name: "Diced carrots" }),
    ).toBeChecked();
  });

  test("live per-source rescale is isolated between sources, never resets checked-off progress, and stays pinned to the exact Version cooked even after the source Recipe is edited mid-session", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Chicken prep", "Chicken rice");
    await createRecipe(page, beef, "Beef prep", "Beef noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);
    await startCookingFromSetup(page);
    const sessionUrl = page.url();

    const cookingNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });

    // Capture Chicken Bowl's own pinned Version label before any edit.
    await page.getByRole("button", { name: chicken, exact: true }).click();
    const originalVersionLabel = await readVersionLabel(page);

    // Check off Chicken's own ingredient before rescaling it.
    await cookingNav
      .getByRole("button", { name: new RegExp("Chicken prep") })
      .click();
    await page.getByRole("checkbox", { name: "Chicken rice" }).check();

    // Rescale Chicken Bowl's own source only. ScaleControl's Field/
    // FieldLabel pair has no htmlFor/id association, so the dialog's own
    // (single) text input is targeted directly rather than via getByLabel.
    await page.getByRole("button", { name: chicken, exact: true }).click();
    await page.getByRole("button", { name: "Scale", exact: true }).click();
    let scaleDialog = page.getByRole("dialog", {
      name: new RegExp(`Scale ${chicken}`),
    });
    await expect(scaleDialog).toBeVisible();
    await scaleDialog.getByRole("textbox").fill("2");
    await scaleDialog
      .getByRole("button", { name: "Save scale change" })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Beef Bowl (the non-primary, index-1 source) starts untouched by
    // Chicken's rescale — then rescale Beef's own source too, proving its
    // own scale control works end-to-end and isn't an index-0-only path
    // (the completion pass's own "source[0]-assumption audit" concern).
    // Setup's own per-source field reports a never-touched source as an
    // explicit 1× (not blank — see `TargetScaleField`'s doc comment in
    // scale-control.tsx), so that's what Beef's own scale dialog starts at.
    await page.getByRole("button", { name: beef, exact: true }).click();
    await page.getByRole("button", { name: "Scale", exact: true }).click();
    scaleDialog = page.getByRole("dialog", {
      name: new RegExp(`Scale ${beef}`),
    });
    await expect(scaleDialog.getByRole("textbox")).toHaveValue("1");
    await scaleDialog.getByRole("textbox").fill("3");
    await scaleDialog
      .getByRole("button", { name: "Save scale change" })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    // Both sources now carry their own distinct, independently-applied
    // scale — reopening each dialog reflects only its own value.
    await page.getByRole("button", { name: chicken, exact: true }).click();
    await page.getByRole("button", { name: "Scale", exact: true }).click();
    scaleDialog = page.getByRole("dialog", {
      name: new RegExp(`Scale ${chicken}`),
    });
    await expect(scaleDialog.getByRole("textbox")).toHaveValue("2");
    await scaleDialog.getByRole("button", { name: "Cancel" }).click();

    // Chicken's already-checked ingredient survived the rescale.
    await cookingNav
      .getByRole("button", { name: new RegExp("Chicken prep") })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Chicken rice" }),
    ).toBeChecked();

    // Edit Chicken Bowl's Recipe (a new section bumps its Version) while
    // the session is still active and pinned to the original Version.
    // Cooking Mode's own "View source" link only renders once a session
    // isn't active (`RecipePanel`'s `!isActive` guard) — this session is
    // still in progress, so reach the Recipe's detail page independently,
    // via /recipes, same as this file's own "Finish and End early" test.
    await page.goto("/recipes");
    await page.getByRole("link", { name: chicken }).click();
    await page
      .locator("main")
      .getByRole("link", { name: "Edit Recipe" })
      .click();
    await expect(page).toHaveURL(/\/edit$/, { timeout: 15_000 });
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Garnish");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Sesame seeds");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Adding a section is a cooking-content change, so Save opens the
    // major/minor Version-choice dialog (see recipe-golden-path.spec.ts) —
    // pick "Save as a refinement" to complete the save.
    await page.getByRole("button", { name: "Save as a refinement" }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/, { timeout: 15_000 });

    // Back in the still-active session, Chicken Bowl's own overview still
    // reports the exact same pinned Version — never the newer current one.
    await page.goto(sessionUrl);
    await page.getByRole("button", { name: chicken, exact: true }).click();
    const pinnedVersionLabel = await readVersionLabel(page);
    expect(pinnedVersionLabel).toBe(originalVersionLabel);
    // The new "Garnish" section from the edited Version never appears in
    // this already-started session.
    await expect(
      cookingNav.getByRole("button", { name: new RegExp("Garnish") }),
    ).not.toBeVisible();
  });

  test("Finish and End early each release every participating source, so a released source can start a brand-new session immediately", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Chicken prep", "Chicken rice");
    await createRecipe(page, beef, "Beef prep", "Beef noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);
    await startCookingFromSetup(page);

    await page.getByRole("button", { name: "End cooking" }).click();
    await page.getByRole("button", { name: "End early" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+\/review/, { timeout: 15_000 });
    // Multi-source review wizard: skip through both sources.
    await page.getByRole("link", { name: "Skip this one" }).click();
    await page.getByRole("link", { name: "Skip this one" }).click();

    // Both sources are released — each can start a brand-new session right
    // away via the direct "Prepare to cook" entry, with no conflict.
    await page.goto(`/recipes`);
    await page.getByRole("link", { name: chicken }).click();
    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/cook$/, {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("dialog")).not.toBeVisible();

    await page.goto(`/recipes`);
    await page.getByRole("link", { name: beef }).click();
    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("a multi-source session shows exactly one resume card on /cook, and resuming restores the full combined nav and checked progress", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Chicken prep", "Chicken rice");
    await createRecipe(page, beef, "Beef prep", "Beef noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);
    await startCookingFromSetup(page);

    const setupNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    await setupNav
      .getByRole("button", { name: new RegExp("Chicken prep") })
      .click();
    await page.getByRole("checkbox", { name: "Chicken rice" }).check();
    await page.getByRole("button", { name: chicken, exact: true }).click();

    await page.getByRole("button", { name: "End cooking" }).click();
    await page.getByRole("button", { name: "Leave & resume later" }).click();

    await page.goto("/cook");
    const combinedTitle = `${chicken} + ${beef}`;
    await expect(page.getByText(combinedTitle)).toHaveCount(1);

    await page
      .getByRole("button", { name: new RegExp(`Resume ${chicken}`) })
      .click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: chicken, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: beef, exact: true }),
    ).toBeVisible();

    // Resuming lands on the source overview (no `?unit=` deep link), same
    // as any fresh session load — navigate into Chicken prep to find its
    // checklist and confirm the checkoff survived.
    const resumedNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    await resumedNav
      .getByRole("button", { name: new RegExp("Chicken prep") })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Chicken rice" }),
    ).toBeChecked();
  });
});
