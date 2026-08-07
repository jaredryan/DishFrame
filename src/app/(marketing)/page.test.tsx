import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MarketingHomePage from "./page";

describe("MarketingHomePage", () => {
  it("routes the primary call to action to recipe creation", () => {
    render(<MarketingHomePage />);

    const ctas = screen.getAllByRole("link", {
      name: /create your first recipe/i,
    });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/recipes/new");
    }
  });
});
