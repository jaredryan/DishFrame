import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_APP_URL = "https://dish-frame.vercel.app";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("sitemap", () => {
  it("includes only the public marketing routes at the configured origin", async () => {
    const { default: sitemap } = await import("./sitemap");
    const urls = sitemap().map((entry) => entry.url);

    expect(urls).toEqual([
      "https://dish-frame.vercel.app/",
      "https://dish-frame.vercel.app/about",
      "https://dish-frame.vercel.app/contact",
    ]);
  });

  it("excludes private and API routes", async () => {
    const { default: sitemap } = await import("./sitemap");
    const urls = sitemap().map((entry) => entry.url);

    for (const privatePath of [
      "/sign-in",
      "/home",
      "/recipes",
      "/parts",
      "/help",
      "/profile",
      "/api",
    ]) {
      expect(urls.some((url) => url.includes(privatePath))).toBe(false);
    }
  });
});
