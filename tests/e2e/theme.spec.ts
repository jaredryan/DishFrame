import { test, expect } from "@playwright/test";
import { cleanup, login } from "./helpers";

test("theme can be changed on the public site", async ({ page }) => {
  await page.goto("/");

  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
});

test.describe("theme in the signed-in app", () => {
  let userId: string;

  test.beforeEach(async ({ context }) => {
    userId = (await login(context)).userId;
  });

  test.afterEach(() => {
    cleanup(userId);
  });

  test("Appearance in Settings changes the theme", async ({ page }) => {
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
