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
 * BUILD_PLAN.md Slice 8's required journey: a two-unit session where
 * checkoff progress and two simultaneously running Timers — one per unit —
 * survive unit switching and a full page refresh (PRODUCT_SPEC.md §28.4,
 * §29.3, §29.4). Written per Slice 8 policy but not run in this pass.
 */
test.describe("Cooking Mode: unit switching, progress, and simultaneous timers", () => {
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

  test("two units, two simultaneous timers, progress and timers persist across refresh", async ({
    page,
  }) => {
    const title = `Timer Test Bowl ${Date.now()}`;

    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title);

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

    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    await page.getByRole("button", { name: "Start cooking" }).click();
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });

    // Desktop redesign: every active timer's controls live in the
    // persistent right-hand timer rail, regardless of which Section is
    // selected — that's what "simultaneously accessible" now means, in
    // place of the old horizontal timer strip.
    const timerRail = page.getByRole("complementary", {
      name: /active timers/i,
    });
    // --- Desktop opens on the Recipe overview by default (refinement pass
    // item 1); switch to "Prep" first via the nav — scoped to the nav
    // landmark since the Recipe overview's own Sections list at the bottom
    // also has a same-named button — check its one ingredient, start a
    // timer via the elevated "Start timer" action in the Section header ---
    const cookingNav = page.getByRole("navigation", {
      name: /cooking navigation/i,
    });
    await cookingNav.getByRole("button", { name: /Prep/ }).click();
    await expect(page.getByRole("heading", { name: "Prep" })).toBeVisible();
    await page.getByRole("checkbox").check();

    await page
      .getByRole("button", { name: "Start timer", exact: true })
      .click();
    // "Start timer" opens the shared StartTimerDialog (a portaled Radix
    // dialog, not inline under <main>); its own submit button is "Start".
    const timerDialog = page.getByRole("dialog", { name: "Start a timer" });
    await timerDialog.getByLabel("Name").fill("Rice");
    await timerDialog.getByLabel("Minutes").fill("10");
    await timerDialog
      .getByRole("button", { name: "Start", exact: true })
      .click();
    await expect(timerRail.getByText(/Rice/)).toBeVisible();

    // --- Switch to "Sear" in one click via the left nav: check its
    // ingredient, start its own simultaneous timer ---
    await cookingNav.getByRole("button", { name: /Sear/ }).click();
    await expect(page.getByRole("heading", { name: "Sear" })).toBeVisible();
    await page.getByRole("checkbox").check();

    await page
      .getByRole("button", { name: "Start timer", exact: true })
      .click();
    await timerDialog.getByLabel("Name").fill("Sauce");
    await timerDialog.getByLabel("Minutes").fill("5");
    await timerDialog
      .getByRole("button", { name: "Start", exact: true })
      .click();

    // Both timers are simultaneously visible and controllable in the rail,
    // regardless of which Section is currently selected.
    await expect(timerRail.getByText(/Rice/)).toBeVisible();
    await expect(timerRail.getByText(/Sauce/)).toBeVisible();

    // --- Refresh: both timers' target end times and both checkoffs persist ---
    await page.reload();
    await expect(timerRail.getByText(/Rice/)).toBeVisible();
    await expect(timerRail.getByText(/Sauce/)).toBeVisible();

    await expect(page.getByRole("heading", { name: "Sear" })).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeChecked();
    await cookingNav.getByRole("button", { name: /Prep/ }).click();
    await expect(page.getByRole("checkbox")).toBeChecked();
  });
});
