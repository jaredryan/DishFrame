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

// See preferences-tasters-grocery.spec.ts for why this shells out to `tsx`
// rather than importing seed-session.ts directly.
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

  test("golden path", async ({ page }) => {
    const title = `Cooking Test Bowl ${Date.now()}`;

    // --- Create a Recipe with two Sections, each with one ingredient ---
    await page.goto("/recipes/new");
    await page.getByLabel("Recipe title").fill(title);

    await page.getByLabel("Section name").fill("Prep");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByLabel("Ingredient name").fill("Ginger");

    await page.getByRole("button", { name: "Add section" }).click();
    await page.getByLabel("Section name").nth(1).fill("Sear");
    await page.getByRole("button", { name: "Add ingredient" }).nth(1).click();
    await page.getByLabel("Ingredient name").nth(1).fill("Soy sauce");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // --- Cooking Setup: both Sections appear, prefilled and included ---
    // Scoped to <main> — the sidebar's own "Cook" nav link (to the sessions
    // index) also matches this accessible name.
    await page.locator("main").getByRole("link", { name: "Cook" }).click();
    await expect(page).toHaveURL(/\/cook$/);
    await expect(
      page.getByRole("heading", { name: "Cooking setup" }),
    ).toBeVisible();
    await expect(page.getByText("Prep", { exact: true })).toBeVisible();
    await expect(page.getByText("Sear", { exact: true })).toBeVisible();

    // --- Start cooking: a real Cooking Session is created, landing in the
    // dedicated Cooking Mode surface focused on the first unit ---
    await page.getByRole("button", { name: "Start cooking" }).click();
    // Generous timeout, not the default: this is the first navigation to
    // /cook/[sessionId] in the whole suite, so it pays Turbopack's one-time
    // dev-mode compile cost for that route (observed ~6s) on top of the
    // network round trip — a known cause of slowness, not a hang.
    await expect(page).toHaveURL(/\/cook\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Prep" })).toBeVisible();
    await expect(page.getByText("Ginger")).toBeVisible();

    // --- Switch focus to the other unit in one tap ---
    await page.getByRole("button", { name: /Sear/ }).click();
    await expect(page.getByRole("heading", { name: "Sear" })).toBeVisible();
    await expect(page.getByText("Soy sauce")).toBeVisible();

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

    // --- End early: partial progress is preserved, state updates ---
    await page.getByRole("button", { name: "End" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "End early" })
      .click();
    await expect(page.getByText("Ended early")).toBeVisible();
    await expect(page.getByRole("button", { name: "End" })).not.toBeVisible();
  });
});
