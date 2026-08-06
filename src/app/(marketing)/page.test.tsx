import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/session", () => ({
  getServerSession: vi.fn().mockResolvedValue(null),
}));

describe("MarketingHomePage", () => {
  it("routes the primary call to action to sign-in", async () => {
    const { default: MarketingHomePage } = await import("./page");
    render(await MarketingHomePage());

    const ctas = screen.getAllByRole("link", {
      name: /create your first recipe/i,
    });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/sign-in");
    }
  });
});
