import { test, expect } from "@playwright/test";

test("marketing home loads with the hero headline", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "A better framework for the dishes you cook.",
    }),
  ).toBeVisible();
});

test("About loads", async ({ page }) => {
  await page.goto("/about");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Dishes aren’t finished. They’re learned.",
    }),
  ).toBeVisible();
});

test("Contact loads", async ({ page }) => {
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Help make DishFrame better.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send message" }),
  ).toBeEnabled();
});

test("Sign-in page loads", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome to DishFrame" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /continue with google/i }),
  ).toBeVisible();
});

test("public navigation moves between pages", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "About" })
    .click();
  await expect(page).toHaveURL("/about");

  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Contact" })
    .click();
  await expect(page).toHaveURL("/contact");
});

test("protected routes redirect signed-out visitors to sign-in", async ({
  page,
}) => {
  await page.goto("/home");
  await expect(page).toHaveURL("/sign-in");
});
