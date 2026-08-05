import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotFoundContent } from "./not-found-content";

// Slice 21 structural audit: each route group's own not-found.tsx renders
// only this (no header/Wordmark of its own) so a 404 doesn't duplicate the
// enclosing layout's chrome (SidebarNav/PublicHeader) — regression coverage
// for that fix, not the root not-found page's own layout.
describe("NotFoundContent", () => {
  it("links Return home to the given href", () => {
    render(<NotFoundContent homeHref="/home" />);
    expect(screen.getByRole("link", { name: "Return home" })).toHaveAttribute(
      "href",
      "/home",
    );
  });

  it("renders a custom description when given one", () => {
    render(
      <NotFoundContent
        homeHref="/"
        description="This link may have expired, been revoked, or never existed."
      />,
    );
    expect(
      screen.getByText(
        "This link may have expired, been revoked, or never existed.",
      ),
    ).toBeInTheDocument();
  });
});
