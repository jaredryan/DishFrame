import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

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

async function createRecipe(page: Page, title: string): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByLabel("Recipe title").fill(title);
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Ingredient name").fill("Ginger");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Excludes "new" itself — the plain `[^/]+$` pattern other specs use
  // would also match `/recipes/new` before the post-save navigation has
  // actually happened, letting this resolve on the stale URL.
  await expect(page).toHaveURL(/\/recipes\/(?!new)[^/]+$/);
  return page.url().split("/recipes/")[1];
}

/**
 * PRODUCT_SPEC.md §87, Slice 18: print CSS is inherently browser-dependent —
 * this narrowly-scoped spec only checks the meaningful print-media
 * invariants that can't be verified in vitest (chrome hidden, ink-friendly
 * background, no overflow), plus the one authorization path Playwright can
 * exercise end-to-end that vitest already covers at the service layer
 * (`print.integration.test.ts`): a signed-out visitor can't reach a private
 * print route.
 */
test.describe("Print/PDF presentation", () => {
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

  test("owner print view: toolbar hidden and content ink-friendly under print media, with no overflow", async ({
    page,
  }) => {
    const title = `Print Test Recipe ${Date.now()}`;
    const dishId = await createRecipe(page, title);

    await page.goto(`/print/recipes/${dishId}`);

    // Screen presentation: toolbar visible, no app chrome leaked in from
    // the (app) route group.
    await expect(
      page.getByRole("link", { name: "Back to recipe" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print / Save as PDF" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );

    await page.emulateMedia({ media: "print" });

    // Print output: toolbar disappears, core content stays visible.
    await expect(
      page.getByRole("link", { name: "Back to recipe" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Print / Save as PDF" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(page.getByText("Ginger", { exact: true })).toBeVisible();

    const backgroundColor = await page
      .locator("article")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(backgroundColor).toBe("rgb(255, 255, 255)");

    const hasHorizontalOverflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("a signed-out visitor is redirected away from a private print route", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/print/recipes/nonexistent-dish-id");
    await expect(page).toHaveURL("/sign-in");
    await context.close();
  });
});
