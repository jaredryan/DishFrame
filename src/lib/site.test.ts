import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  vi.resetModules();
  if (ORIGINAL_URL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_URL;
  }
});

describe("site constants", () => {
  it("reads SITE_URL from NEXT_PUBLIC_APP_URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://dish-frame.vercel.app";
    const { SITE_URL } = await import("./site");
    expect(SITE_URL).toBe("https://dish-frame.vercel.app");
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const { SITE_URL } = await import("./site");
    expect(SITE_URL).toBe("http://localhost:3000");
  });

  it("exposes the locked hero title and description", async () => {
    const { SITE_TITLE, SITE_DESCRIPTION, SITE_NAME } = await import("./site");
    expect(SITE_NAME).toBe("DishFrame");
    expect(SITE_TITLE).toBe(
      "DishFrame — A better framework for the way you cook",
    );
    expect(SITE_DESCRIPTION).toBe(
      "Keep recipes organized, reuse what already works, and save what you learn each time you cook.",
    );
  });

  it("absoluteUrl resolves paths against the configured origin", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://dish-frame.vercel.app";
    const { absoluteUrl } = await import("./site");
    expect(absoluteUrl("/about")).toBe("https://dish-frame.vercel.app/about");
    expect(absoluteUrl()).toBe("https://dish-frame.vercel.app/");
  });
});
