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
 * Golden path for BUILD_PLAN.md Slice 2's UI: sign-in is Google OAuth-only,
 * so this test mints a session directly via Better Auth's `testUtils`
 * plugin rather than driving a real OAuth consent screen — the sanctioned
 * mechanism for exactly this situation.
 */
test.describe("Preferences, Tasters, and Grocery Categories", () => {
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

  test("save preferences, manage a Taster, and manage a Grocery Category", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();

    // --- Preferences: change a setting and confirm it persists ---
    await page.getByLabel("Measurement system").click();
    await page.getByRole("option", { name: "Metric" }).click();
    await expect(page.getByRole("status")).toContainText("Preferences saved");

    await page.reload();
    await expect(page.getByLabel("Measurement system")).toContainText("Metric");

    // --- Grocery Categories: add one ---
    const categoryInput = page.getByLabel("Add a category");
    await categoryInput.fill("Spices");
    await page
      .locator("form")
      .filter({ has: categoryInput })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Spices")).toBeVisible();

    // --- Tasters: navigate, add, rename, archive, restore, delete ---
    await page.getByRole("link", { name: "Manage Tasters" }).click();
    await expect(page).toHaveURL(/\/tasters/);
    await expect(
      page.getByRole("listitem").filter({ hasText: "You" }),
    ).toBeVisible();

    const tasterInput = page.getByLabel("Add a taster");
    await tasterInput.fill("Mom");
    await page
      .locator("form")
      .filter({ has: tasterInput })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Mom", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Rename Mom" }).click();
    await page.getByLabel("Edit name for Mom").fill("Mother");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Mother", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Archive Mother" }).click();
    await expect(page.getByText("Archived")).toBeVisible();

    await page.getByRole("button", { name: "Restore Mother" }).click();
    await expect(page.getByText("Archived")).not.toBeVisible();

    await page.getByRole("button", { name: "Delete Mother" }).click();
    await expect(page.getByText("Mother", { exact: true })).not.toBeVisible();
  });
});
