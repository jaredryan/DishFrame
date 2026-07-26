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

/**
 * Runs tests/e2e/seed-session.ts via `tsx` in its own process, never
 * imported directly into this spec file. Playwright's own test transform
 * cannot load the generated Prisma client (ESM-only, uses `import.meta`) or
 * resolve the "@/" path alias the way Next.js/vitest/tsx do — shelling out
 * sidesteps that entirely.
 */
function seed(...args: string[]): string {
  return execFileSync("pnpm", ["exec", "tsx", SEED_SCRIPT, ...args], {
    encoding: "utf-8",
    cwd: path.join(__dirname, "..", ".."),
    env: {
      ...process.env,
      // Resolves `import "server-only"` to Next.js's Server-Component no-op
      // instead of its Client-Component-only throw (see server-only's own
      // package.json "exports" map) — scoped to this child process only,
      // so the webServer's own `next dev` process (which handles this
      // condition itself via webpack) is never affected.
      NODE_OPTIONS: "--conditions=react-server",
    },
  });
}

/**
 * Golden path for BUILD_PLAN.md Slice 2 + its follow-up's Settings UI:
 * sign-in is Google OAuth-only, so this mints a session directly via Better
 * Auth's `testUtils` plugin rather than driving a real OAuth consent
 * screen — the sanctioned mechanism for exactly this situation.
 */
test.describe("Settings: Preferences, Grocery Categories, and Tasters", () => {
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

  test("save preferences, manage Grocery Categories (incl. the protected fallback), and navigate to Tasters", async ({
    page,
  }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // --- Preferences: change a setting and confirm it persists ---
    await page.getByLabel("Measurement system").click();
    await page.getByRole("option", { name: "Metric" }).click();
    await expect(page.getByRole("status")).toContainText("Preferences saved");

    await page.reload();
    await expect(page.getByLabel("Measurement system")).toContainText("Metric");

    // --- Grocery Categories: the seeded fallback is protected ---
    await expect(page.getByText("Fallback")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete Other" }),
    ).not.toBeVisible();

    // --- Grocery Categories: create, rename, reorder, delete an ordinary one ---
    const categoryInput = page.getByLabel("Add a category");
    await categoryInput.fill("Spices");
    await page
      .locator("form")
      .filter({ has: categoryInput })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Spices", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Rename Spices" }).click();
    await page.getByLabel("Edit name for Spices").fill("Herbs & Spices");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Herbs & Spices")).toBeVisible();

    await page.getByRole("button", { name: "Move Herbs & Spices up" }).click();

    await page.getByRole("button", { name: "Delete Herbs & Spices" }).click();
    await expect(page.getByText("Herbs & Spices")).not.toBeVisible();

    // --- Tasters: navigate from Settings, confirm the owner Taster is present ---
    await page.getByRole("link", { name: "Manage Tasters" }).click();
    await expect(page).toHaveURL(/\/tasters/);
    await expect(
      page.getByRole("listitem").filter({ hasText: "You" }),
    ).toBeVisible();
  });
});
