import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

/**
 * BUILD_PLAN.md Slice 7's required journey (Gate 4), updated for Slice 8's
 * dedicated Cooking Mode UI: Cooking Setup → Start cooking → edit the
 * active plan via the Manage-plan sheet → End early. Uses a two-Section
 * Recipe so plan editing (remove/restore) can be exercised without ever
 * hitting the final-unit guard (§27.4) — that guard's own dialog is
 * covered by the integration suite, not here.
 */
test.describe("Cooking: setup, start, edit active plan, end early", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("golden path", async ({ page }) => {
    // Slice 16 correction: the default 30s test timeout is no longer
    // enough headroom. This journey's very first steps hit `/recipes/new`
    // and `/recipes/[dishId]` for the first time in the whole suite (see
    // the two per-action overrides below), and the Recipe detail page's
    // action menu (`DishDetailActions`) now also reaches the whole sharing
    // feature (Slice 16's `ShareDialog` → `sharing/actions.ts` → the
    // independent-copy engine's full dependency graph) — a heavier
    // first-time dev-mode compile than any individual per-action override
    // can rescue, since an action-level `timeout` can never exceed an
    // already-expiring overall test deadline (Playwright applies whichever
    // limit is hit first). Doubling the whole-test budget is the correct
    // fix here, not another per-action bump.
    test.setTimeout(60_000);

    const title = `Cooking Test Bowl ${Date.now()}`;

    // --- Create a Recipe with two Sections, each with one ingredient ---
    await page.goto("/recipes/new");
    // Generous timeout, not the default: this is the first navigation of the
    // whole suite, so it pays Turbopack's one-time dev-mode compile cost for
    // this route — heavier since Slice 13 added the FDC search dialog and
    // nutrition fields — on top of the network round trip (see the same
    // pattern below for /cook/[sessionId]).
    await page.getByLabel("Recipe title").fill(title, { timeout: 15_000 });

    // Each Section is authored in its own modal session (opened by "Add
    // section", committed by "Finish section") — one at a time, so the same
    // dialog locator can be reused for both.
    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    const sectionDialog = page.getByRole("dialog");
    await sectionDialog.getByLabel("Section name").fill("Prep");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Ginger");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();

    await page
      .getByRole("button", { name: "Add section", exact: true })
      .click();
    await sectionDialog.getByLabel("Section name").fill("Sear");
    await sectionDialog.getByRole("button", { name: "Add ingredient" }).click();
    await sectionDialog.getByLabel("Ingredient name").fill("Soy sauce");
    await sectionDialog.getByRole("button", { name: "Finish section" }).click();

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    // Generous timeout, not the default: this is the first navigation to
    // /recipes/[dishId] in the whole suite, so it pays Turbopack's one-time
    // dev-mode compile cost for that route — heavier since Slice 13 added
    // nutrition rendering to the detail page too — on top of the network
    // round trip (same pattern as the two waits above/below it in this file).
    await expect(page.getByRole("heading", { name: title })).toBeVisible({
      timeout: 15_000,
    });

    // --- Cooking Setup: both Sections appear, prefilled and included ---
    // Scoped to <main> — the sidebar's own "Cook" nav link (to the sessions
    // index) also matches this accessible name.
    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    // Generous timeout, not the default: like the two waits above, this is
    // the first navigation to /recipes/[dishId]/cook in the whole suite, so
    // it pays Turbopack's one-time dev-mode compile cost for that route too.
    await expect(page).toHaveURL(/\/cook$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Cooking setup" }),
    ).toBeVisible();
    await expect(page.getByText("Prep", { exact: true })).toBeVisible();
    await expect(page.getByText("Sear", { exact: true })).toBeVisible();

    // --- Start cooking: a real Cooking Session is created, landing in the
    // dedicated Cooking Mode surface ---
    await page.getByRole("button", { name: "Start cooking" }).click();
    // Generous timeout, not the default: this is the first navigation to
    // /cook/[sessionId] in the whole suite, so it pays Turbopack's one-time
    // dev-mode compile cost for that route (observed ~6s) on top of the
    // network round trip — a known cause of slowness, not a hang.
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    const sessionId = page.url().match(/\/cook\/([^/]+)/)![1];

    // --- Desktop opens on the Recipe overview by default (refinement pass
    // item 1) — session-level actions are visible immediately ---
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Manage plan" }),
    ).toBeVisible();

    // Mobile's single-column layout stays in the DOM (just `lg:hidden`)
    // alongside the desktop three-zone layout, so plain-text locators like
    // `getByText` — which, unlike `getByRole`, aren't filtered by the
    // accessibility tree — can match both copies. Scope to <main>, the
    // desktop layout's unique landmark, to disambiguate.
    const main = page.getByRole("main");

    // --- Switch to "Prep" via the left nav. Scoped to the nav landmark —
    // the Recipe overview's own Sections list at the bottom also has a
    // same-named button, so an unscoped locator would be ambiguous. ---
    const cookingNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    await cookingNav.getByRole("button", { name: /Prep/ }).click();
    await expect(page.getByRole("heading", { name: "Prep" })).toBeVisible();
    await expect(main.getByText("Ginger")).toBeVisible();

    // --- Switch focus to the other Section in one click, via the desktop
    // left nav rail (replaces the old horizontal Section strip) ---
    await cookingNav.getByRole("button", { name: /Sear/ }).click();
    await expect(page.getByRole("heading", { name: "Sear" })).toBeVisible();
    await expect(main.getByText("Soy sauce")).toBeVisible();

    // --- Session management (Manage plan, End cooking) lives behind the
    // "Recipe" nav destination on desktop ---
    await page.getByRole("button", { name: title, exact: true }).click();

    // --- Edit the active plan via the Manage-plan sheet: remove "Prep",
    // confirm it moves to Removed, then restore it ---
    await page.getByRole("button", { name: "Manage plan" }).click();
    await page.getByRole("button", { name: "Remove Prep" }).click();
    await expect(
      page.getByRole("heading", { name: "Removed from this session" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Restore Prep" }).click();
    await expect(
      page.getByRole("heading", { name: "Removed from this session" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // --- End cooking: redesigned modal offers four outcomes; "End early"
    // redirects to the optional Review (§30.2) — "Not now" returns to the
    // session with partial progress preserved and state updated ---
    await page.getByRole("button", { name: "End cooking" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "End early" })
      .click();
    await expect(page).toHaveURL(`/cook/${sessionId}/review`);
    await page.getByRole("link", { name: "Not now" }).click();
    await expect(page).toHaveURL(`/cook/${sessionId}`);
    await expect(main.getByText("Ended early")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "End cooking" }),
    ).not.toBeVisible();
  });
});
