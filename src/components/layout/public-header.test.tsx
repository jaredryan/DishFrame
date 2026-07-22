import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicHeader } from "@/components/layout/public-header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("PublicHeader", () => {
  it("renders primary navigation links", () => {
    render(<PublicHeader />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();

    for (const label of ["Home", "About", "Contact"]) {
      expect(
        screen.getAllByRole("link", { name: label }).length,
      ).toBeGreaterThan(0);
    }
  });

  it("renders sign-in and the primary call to action", () => {
    render(<PublicHeader />);

    expect(
      screen.getAllByRole("link", { name: "Sign in" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Start building" }).length,
    ).toBeGreaterThan(0);
  });
});
