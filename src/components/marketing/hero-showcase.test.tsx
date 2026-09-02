import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroShowcase } from "@/components/marketing/hero-showcase";

describe("HeroShowcase", () => {
  it("routes the call to action to the logged-in home page", () => {
    render(<HeroShowcase />);

    expect(
      screen.getByRole("link", { name: /create your first recipe/i }),
    ).toHaveAttribute("href", "/home");
  });

  it("introduces the DishFrame brand lockup in the hero content", () => {
    render(<HeroShowcase />);

    expect(screen.getByRole("link", { name: "DishFrame" })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
