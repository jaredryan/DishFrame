import { test, expect } from "@playwright/test";

test("unknown routes render the branded 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Looks like this page is missing.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Return home" })).toBeVisible();
});

test("home, about, and contact expose a correct canonical tag", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https?:\/\/[^/]+\/?$/,
  );

  await page.goto("/about");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/about$/,
  );

  await page.goto("/contact");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/contact$/,
  );
});

test("sign-in is marked noindex, nofollow", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /nofollow/,
  );
});

test("homepage exposes valid, escaped JSON-LD", async ({ page }) => {
  await page.goto("/");
  const raw = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .innerHTML();

  const data = JSON.parse(raw);
  expect(data.name).toBe("DishFrame");
  expect(data).not.toHaveProperty("aggregateRating");
});

test("robots.txt references the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("Sitemap:");
  expect(body).toContain("/sitemap.xml");
  expect(body).toContain("Disallow: /sign-in");
});

test("sitemap.xml lists only public marketing pages", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("<loc>");
  expect(body).not.toContain("/sign-in");
  expect(body).not.toContain("/home");
});

test("manifest.webmanifest is served with the DishFrame identity", async ({
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe("DishFrame");
  expect(manifest.short_name).toBe("DishFrame");
});
