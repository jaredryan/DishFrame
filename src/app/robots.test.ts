import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_APP_URL = "https://dish-frame.vercel.app";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("robots", () => {
  it("points to the sitemap at the configured origin", async () => {
    const { default: robots } = await import("./robots");
    expect(robots().sitemap).toBe("https://dish-frame.vercel.app/sitemap.xml");
  });

  it("allows public marketing pages and disallows private/API routes", async () => {
    const { default: robots } = await import("./robots");
    const { rules } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;

    expect(rule.allow).toEqual(["/", "/about", "/contact"]);
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        "/sign-in",
        "/home",
        "/recipes",
        "/parts",
        "/help",
        "/profile",
        "/api/",
      ]),
    );
  });
});
