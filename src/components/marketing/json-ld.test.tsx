import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_APP_URL = "https://dish-frame.vercel.app";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("JsonLd", () => {
  it("renders valid JSON-LD with the correct URL, name, and no fabricated claims", async () => {
    const { JsonLd } = await import("./json-ld");
    const { container } = render(<JsonLd />);

    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();

    const data = JSON.parse(script!.innerHTML);

    expect(data["@type"]).toMatch(/WebApplication|WebSite|SoftwareApplication/);
    expect(data.name).toBe("DishFrame");
    expect(data.url).toBe("https://dish-frame.vercel.app");
    expect(data.description).toBe(
      "Keep recipes organized, reuse what already works, and save what you learn each time you cook.",
    );

    for (const fabricatedField of [
      "aggregateRating",
      "review",
      "ratingValue",
      "offers",
      "priceRange",
    ]) {
      expect(data).not.toHaveProperty(fabricatedField);
    }
  });

  it("escapes angle brackets so injected content can't break out of the script tag", async () => {
    process.env.NEXT_PUBLIC_APP_URL =
      "https://dish-frame.vercel.app/</script><script>alert(1)</script>";
    const { JsonLd } = await import("./json-ld");
    const { container } = render(<JsonLd />);
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );

    expect(script!.innerHTML).not.toContain("<");
    expect(script!.innerHTML).toContain("\\u003c");
  });
});
