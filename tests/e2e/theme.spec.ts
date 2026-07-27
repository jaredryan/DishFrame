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

test("theme can be changed on the public site", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
});

// Gate 2 remediation: theme controls were removed from the sign-in screen
// and from the account-menu dropdown — the complete Appearance setting now
// lives only in /settings.
test("the sign-in screen has no theme controls", async ({ page }) => {
  await page.goto("/sign-in");

  await expect(
    page.getByRole("radiogroup", { name: "Theme" }),
  ).not.toBeVisible();
});

test.describe("theme in the signed-in app", () => {
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

  test("the account menu has no theme selector, and Appearance in Settings changes the theme", async ({
    page,
  }) => {
    await page.goto("/home");

    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(
      menu.getByRole("radiogroup", { name: "Theme" }),
    ).not.toBeVisible();
    await expect(menu.getByText("Settings")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Appearance" }),
    ).toBeVisible();

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(html).toHaveClass(/dark/);
  });
});
