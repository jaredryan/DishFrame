import { test, expect, type Page } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * Multi-source Cooking Sessions (owner spec, 2026-09-17; completion pass,
 * 2026-09-18) — the generic Start Cooking picker's checkbox multi-select,
 * the multi-source Cooking Setup screen it hands off to (independent
 * per-source Version/scale, live re-derivation on Version change,
 * shared-Part consolidation split/merge), and starting the one combined
 * Cooking Session. Direct per-Recipe/Part entry is covered separately
 * (last test in this file) to confirm it stays on the old, unchanged path.
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

/** Attaches an already-saved Part to the Recipe/Part currently open in the
 * editor (must already be on an edit/new page with the Part-link controls
 * visible), then saves. Leaves the page on the container's own detail page. */
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

/** Opens the generic "What will you cook?" picker (from /cook) and checks
 * every given title, then continues into Cooking Setup. */
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

/** Reads the "Cooking order and scale" list's current row order via each
 * row's own "Drag to reorder {label}" handle — those handles exist exactly
 * once per row regardless of its included/excluded checkbox state, so this
 * reflects true DOM position, not just the included subset. */
async function currentSetupOrder(page: Page): Promise<string[]> {
  const handles = await page
    .getByRole("button", { name: /^Drag to reorder /, exact: false })
    .all();
  return Promise.all(
    handles.map(async (h) =>
      ((await h.getAttribute("aria-label")) ?? "").replace(
        "Drag to reorder ",
        "",
      ),
    ),
  );
}

/**
 * Reorders a row one position via dnd-kit's `KeyboardSensor` — the same
 * accessible interaction (and the same reason for using it over a
 * simulated pointer drag) as `preferences-tasters-grocery.spec.ts`'s own
 * `reorderUpViaKeyboard`: focus the handle, Space to pick up, Arrow key to
 * move, Space to drop, with short waits for the sensor to attach between
 * keypresses. Unlike that helper, Cooking Setup's own reorder is pure
 * local component state (no server round-trip until "Start cooking"), so
 * there's nothing to await after the drop beyond the synchronous re-render.
 */
async function reorderViaKeyboard(
  page: Page,
  handleName: string,
  direction: "ArrowUp" | "ArrowDown",
): Promise<void> {
  const handle = page.getByRole("button", { name: handleName });
  await handle.focus();
  await expect(handle).toBeFocused();
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
  await page.keyboard.press(direction);
  await page.waitForTimeout(150);
  await page.keyboard.press("Space");
  await page.waitForTimeout(150);
}

test.describe("Multi-source Cooking Setup", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("generic picker supports checkbox multi-select and proceeds directly into Cooking Setup (no intermediate Version/scale step)", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Prep", "Rice");
    await createRecipe(page, beef, "Prep", "Noodles");

    await page.goto("/cook");
    await page.getByRole("button", { name: "Start cooking" }).click();
    const dialog = page.getByRole("dialog", { name: "What will you cook?" });
    await expect(
      dialog.getByRole("checkbox", { name: new RegExp(chicken) }),
    ).toBeVisible();

    await dialog.getByRole("checkbox", { name: new RegExp(chicken) }).click();
    await dialog.getByRole("checkbox", { name: new RegExp(beef) }).click();
    await expect(
      dialog.getByRole("checkbox", { name: new RegExp(chicken) }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: new RegExp(beef) }),
    ).toBeChecked();

    // No Version-selection step appears in the dialog itself — Continue
    // goes straight to the dedicated Setup route.
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/cook/setup", { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Cooking setup" }),
    ).toBeVisible();
    await expect(page.getByText(`${chicken} + ${beef}`)).toBeVisible();
  });

  test("Cooking Setup exposes independent Version and scale configuration per source, and two sources start one Cooking Session", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    // Distinct Section names, not ingredient names — the combined list's
    // rows are labeled by each unit's own Section/Part name
    // (`ConsolidatedUnitRow`'s `unit.label`), never by ingredient content.
    await createRecipe(page, chicken, "Chicken prep", "Rice");
    await createRecipe(page, beef, "Beef prep", "Noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);

    // Each source gets its own card with its own Version picker and its own
    // scale field — not one control shared across both.
    const chickenCard = page
      .locator("div")
      .filter({ hasText: chicken })
      .filter({ has: page.getByText("Scale this source") })
      .first();
    const beefCard = page
      .locator("div")
      .filter({ hasText: beef })
      .filter({ has: page.getByText("Scale this source") })
      .first();
    await expect(chickenCard).toBeVisible();
    await expect(beefCard).toBeVisible();

    // The combined "Cooking order and scale" list shows both Recipes' own
    // units together, one reorderable list.
    await expect(page.getByText("Cooking order and scale")).toBeVisible();
    await expect(page.getByText("Chicken prep")).toBeVisible();
    await expect(page.getByText("Beef prep")).toBeVisible();

    await page.getByRole("button", { name: "Start cooking" }).click();
    // Excludes "setup" explicitly — this click starts from `/cook/setup`,
    // which otherwise also satisfies `[^/]+$` and lets this resolve before
    // the click's own navigation/session-creation actually completes.
    await expect(page).toHaveURL(/\/cook\/(?!setup$)[^/]+$/, {
      timeout: 15_000,
    });

    // Both sources' own overview items appear above the divider (that
    // list sits outside the `<nav aria-label="Cooking navigation">`
    // element, which holds only the Section list — see NavRail in
    // cooking-mode-desktop-layout.tsx).
    await expect(
      page.getByRole("button", { name: chicken, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: beef, exact: true }),
    ).toBeVisible();
  });

  test("changing a source's Version in Setup re-derives the combined list", async ({
    page,
  }) => {
    const carrots = `Roasted Carrots ${Date.now()}`;
    await createPart(page, carrots, "Carrots", "2", "cups");

    const chicken = `Chicken Bowl ${Date.now()}`;
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(chicken, { timeout: 15_000 });
    // Chicken Bowl needs content of its own beyond the attached Part — the
    // Part is detached below, and a Recipe with nothing else can't be saved
    // (the app's minimum-content rule).
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Prep");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Rice");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();
    await attachPartAndSave(page, carrots, chicken);

    // A second Version of Chicken Bowl exists (no Part) so Setup has a real
    // Version to switch to and back.
    await page.getByRole("link", { name: "Edit Recipe" }).click();
    await expect(page).toHaveURL(/\/edit$/, { timeout: 15_000 });
    // Detach the Part for this new Version — its own row exposes a remove
    // control identified by the attached Part's own name.
    await page
      .getByRole("button", { name: new RegExp(`Remove ${carrots}`) })
      .click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Removing a linked Part is a cooking-relevant change, so the editor
    // asks how to save it — pick "Save as a refinement" so the edited
    // content becomes this Recipe's new current Version, same as this
    // test's own comment above already assumes.
    await page.getByRole("button", { name: "Save as a refinement" }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/, { timeout: 15_000 });

    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, beef, "Prep", "Noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);

    // Chicken Bowl's *current* Version (no Part) is selected by default —
    // the combined list has no shared-Part row yet.
    await expect(page.getByText("Shared", { exact: true })).not.toBeVisible();

    // Every source's own Version picker shares the same default accessible
    // name ("Select a Version") — scope to Chicken Bowl's own source card
    // so a two-source Setup screen doesn't hit a strict-mode ambiguity.
    const chickenCard = page
      .locator("div")
      .filter({ hasText: chicken })
      .filter({ has: page.getByRole("combobox", { name: "Select a Version" }) })
      .first();
    await chickenCard
      .getByRole("combobox", { name: "Select a Version" })
      .click();
    // Switching Chicken Bowl back to its historical Version (the one that
    // still links Roasted Carrots — the only other saved Version) re-derives
    // the combined list to include the shared Part.
    await page
      .getByRole("option")
      .filter({ hasNotText: "(current)" })
      .first()
      .click();
    await expect(page.getByText(carrots)).toBeVisible();
  });

  test("direct Recipe entry ('Prepare to cook') stays on the unchanged single-source Setup route", async ({
    page,
  }) => {
    const title = `Solo Bowl ${Date.now()}`;
    await createRecipe(page, title, "Prep", "Rice");

    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+\/cook$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Cooking setup" }),
    ).toBeVisible();
    // The single-source Setup screen's own "Version" section header — the
    // multi-source screen has no such standalone section (Version lives
    // inline per source card instead).
    await expect(page.getByRole("heading", { name: "Version" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Whole-session scale" }),
    ).toBeVisible();
  });

  test("the combined Cooking order list supports manual interleaving across sources, excluding/re-including a unit preserves its position, and the custom order persists into Cooking Mode and after resume", async ({
    page,
  }) => {
    const chicken = `Chicken Bowl ${Date.now()}`;
    const beef = `Beef Bowl ${Date.now()}`;
    await createRecipe(page, chicken, "Chicken prep", "Chicken rice");
    await createRecipe(page, beef, "Beef prep", "Beef noodles");

    await pickAndContinueToSetup(page, [chicken, beef]);
    // `currentSetupOrder` reads the DOM synchronously (no auto-waiting, so
    // it can't retry) — wait for the combined list to actually be there
    // first, since it's rendered async after Setup's own data fetch.
    await expect(page.getByText("Cooking order and scale")).toBeVisible();

    const initialOrder = await currentSetupOrder(page);
    expect(initialOrder).toHaveLength(2);
    const [first, second] = initialOrder;

    // Manually interleave: move the second row up one position, swapping
    // it with the first — proving units from different sources can be
    // freely reordered relative to each other, not just accepted in the
    // server's own suggested order.
    await reorderViaKeyboard(page, `Drag to reorder ${second}`, "ArrowUp");
    const interleavedOrder = await currentSetupOrder(page);
    expect(interleavedOrder).toEqual([second, first]);

    // Excluding the now-first row leaves it in the same position (dimmed
    // via `!isIncluded`, not removed or reordered) — `order` always
    // reflects every row regardless of its own inclusion state.
    await page
      .getByRole("checkbox", {
        name: `Include ${second} in this cooking session`,
      })
      .uncheck();
    expect(await currentSetupOrder(page)).toEqual([second, first]);

    // Re-including it restores it to that exact same position.
    await page
      .getByRole("checkbox", {
        name: `Include ${second} in this cooking session`,
      })
      .check();
    expect(await currentSetupOrder(page)).toEqual([second, first]);

    await page.getByRole("button", { name: "Start cooking" }).click();
    // Excludes "setup" explicitly — this click starts from `/cook/setup`,
    // which otherwise also satisfies `[^/]+$` and lets this resolve before
    // the click's own navigation/session-creation actually completes.
    await expect(page).toHaveURL(/\/cook\/(?!setup$)[^/]+$/, {
      timeout: 15_000,
    });

    // The custom order survives into Cooking Mode's own combined Section
    // nav list, in the exact interleaved sequence chosen in Setup.
    const cookingNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    await expect(
      cookingNav.getByRole("button", { name: new RegExp(second) }),
    ).toBeVisible();
    const navLabelsInOrder = await cookingNav
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((b) => b.querySelector("span > span")?.textContent ?? ""),
      );
    expect(navLabelsInOrder).toEqual([second, first]);

    // ...and after leaving and resuming the still-active session.
    await page.getByRole("button", { name: "End cooking" }).click();
    // "Leave & resume later" routes to Chicken Bowl's own (source[0]'s)
    // history page, not this combined session's own URL (`CookingModeShell`'s
    // `handleLeaveAndResume`) — resume via /cook's resume card instead of a
    // stale stored `sessionUrl`, same established pattern as this file's own
    // "shows exactly one resume card" test.
    await page.getByRole("button", { name: "Leave & resume later" }).click();
    await page.goto("/cook");
    await page
      .getByRole("button", { name: new RegExp(`Resume ${chicken}`) })
      .click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    // `evaluateAll` reads the DOM synchronously (no auto-waiting) — wait for
    // the resumed nav to actually be populated first, same as above.
    await expect(
      cookingNav.getByRole("button", { name: new RegExp(second) }),
    ).toBeVisible();
    const navLabelsAfterResume = await cookingNav
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((b) => b.querySelector("span > span")?.textContent ?? ""),
      );
    expect(navLabelsAfterResume).toEqual([second, first]);
  });
});
