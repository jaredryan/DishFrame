import { test, expect } from "@playwright/test";
import { cleanup, login, waitForServerAction } from "./helpers";

/**
 * PRODUCT_SPEC.md §93.4 — Help's replayable guide list. seed-session.ts
 * pre-completes only the "intro" guide (see its own comment), so a freshly
 * seeded account sees "meal-plans-intro" as genuinely incomplete here,
 * exercising the real Play → Replay → uncheck lifecycle without needing to
 * reset anything first.
 */
test.describe("Onboarding: Help guide list", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("Play launches the guide, the checkbox persists completion, and the card itself isn't the action target", async ({
    page,
  }) => {
    await page.goto("/help");

    const guideCard = page.locator("li").filter({
      has: page.getByRole("checkbox", { name: "Meal Plans guide completed" }),
    });
    const checkbox = guideCard.getByRole("checkbox", {
      name: "Meal Plans guide completed",
    });
    await expect(checkbox).not.toBeChecked();
    await expect(
      guideCard.getByRole("button", { name: "Play Meal Plans guide" }),
    ).toBeVisible();

    // --- Clicking the card body (not the checkbox or the Play button)
    // does nothing — explicit controls only, no whole-card click (§93.4).
    await guideCard.getByText("Planning meals across a date range").click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(checkbox).not.toBeChecked();

    // --- Play navigates to the guide's page and shows its CoachMark ---
    await waitForServerAction(page, () =>
      guideCard.getByRole("button", { name: "Play Meal Plans guide" }).click(),
    );
    await expect(page).toHaveURL(/\/meal-plans$/, { timeout: 15_000 });
    await expect(
      page.getByRole("note").filter({ hasText: "Meal Plans" }),
    ).toBeVisible();

    // --- Marking the checkbox directly (without playing) persists
    // completion and flips Play to Replay ---
    await page.goto("/help");
    const checkboxAfter = page
      .locator("li")
      .filter({
        has: page.getByRole("checkbox", { name: "Meal Plans guide completed" }),
      })
      .getByRole("checkbox", { name: "Meal Plans guide completed" });
    await expect(checkboxAfter).not.toBeChecked();
    await waitForServerAction(page, () => checkboxAfter.click());
    await expect(checkboxAfter).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Replay Meal Plans guide" }),
    ).toBeVisible();

    await page.reload();
    const checkboxReloaded = page.getByRole("checkbox", {
      name: "Meal Plans guide completed",
    });
    await expect(checkboxReloaded).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Replay Meal Plans guide" }),
    ).toBeVisible();

    // --- Unchecking restores the incomplete state ---
    await waitForServerAction(page, () => checkboxReloaded.click());
    await expect(checkboxReloaded).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Play Meal Plans guide" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Meal Plans guide completed" }),
    ).not.toBeChecked();
  });
});
