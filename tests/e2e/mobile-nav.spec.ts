import { test, expect } from "@playwright/test";

test("mobile navigation drawer opens and links work", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();

  await page.getByRole("button", { name: "Open menu" }).click();

  const drawer = page.getByRole("navigation", { name: "Mobile" });
  await expect(drawer).toBeVisible();

  await drawer.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL("/about");
});
