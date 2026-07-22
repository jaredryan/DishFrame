import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import MarketingHomePage from "./page";

describe("MarketingHomePage", () => {
  it("renders the hero headline and supporting copy", () => {
    render(<MarketingHomePage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "A better framework for the way you cook.",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Keep recipes organized, reuse what already works, and save what you learn each time you cook.",
      ),
    ).toBeInTheDocument();
  });

  it("routes the primary call to action to sign-in", () => {
    render(<MarketingHomePage />);

    const ctas = screen.getAllByRole("link", { name: /start building/i });
    expect(ctas.length).toBeGreaterThan(0);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/sign-in");
    }
  });

  it("renders the three product pillars", () => {
    render(<MarketingHomePage />);

    expect(screen.getByText("Reuse what you already know")).toBeInTheDocument();
    expect(screen.getByText("Learn from every meal")).toBeInTheDocument();
    expect(screen.getByText("Plan from what works")).toBeInTheDocument();
  });
});
