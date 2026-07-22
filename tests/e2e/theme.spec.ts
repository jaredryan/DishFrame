import { test, expect } from "@playwright/test";

test("theme can be changed from the sign-in page", async ({ page }) => {
  await page.goto("/sign-in");

  const html = page.locator("html");
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
});
