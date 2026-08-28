import { test, expect } from "@playwright/test";
import { cleanup, clickAndWaitForServerAction, login } from "./helpers";

/**
 * BUILD_PLAN.md Slice 20: a brand-new account's first authenticated page
 * load shows the skippable initial introduction (PRODUCT_SPEC.md §92.2),
 * and completing/skipping it persists server-side (§92.5) — confirmed here
 * via a reload rather than local-storage, matching the manual QA target
 * "sign in on a second device... completion state is shared."
 */
test.describe("Onboarding: initial introduction", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    // Opts out of seed-session.ts's default (pre-completed "intro" guide,
    // added so every *other* e2e spec's freshly seeded account doesn't hit
    // this dialog) — this spec is specifically testing the real first-run
    // state.
    userId = (await login(context, { withIntro: true })).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("shows once for a brand-new account, then never reappears after reload", async ({
    page,
  }) => {
    await page.goto("/home");

    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).toBeVisible();

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Skip" }),
    );
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();

    // A reload re-fetches server truth for onboardingState — proving the
    // skip persisted server-side, not merely in client component state.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();
  });

  test("completing both steps persists and never reappears", async ({
    page,
  }) => {
    await page.goto("/home");

    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Next: quick preferences" }).click();
    await expect(
      page.getByRole("heading", { name: "A few quick preferences" }),
    ).toBeVisible();

    await clickAndWaitForServerAction(
      page,
      page.getByRole("button", { name: "Done" }),
    );
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Welcome to DishFrame" }),
    ).not.toBeVisible();
  });
});
