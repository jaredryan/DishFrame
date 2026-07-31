import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MarketingHomePage from "./page";

describe("MarketingHomePage", () => {
  it("routes the primary call to action to sign-in", () => {
    render(<MarketingHomePage />);

    const ctas = screen.getAllByRole("link", { name: /start building/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/sign-in");
    }
  });
});
