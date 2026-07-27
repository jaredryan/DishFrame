import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

// Final Gate 2 correction pass: link destinations are a stable contract
// (unlike the exact visual arrangement), worth locking in directly.
describe("Breadcrumbs", () => {
  it("links every item except the last, which is the current page", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Recipes", href: "/recipes" },
          { label: "Japanese rice bowl", href: "/recipes/abc" },
          { label: "Edit" },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Recipes" })).toHaveAttribute(
      "href",
      "/recipes",
    );
    expect(
      screen.getByRole("link", { name: "Japanese rice bowl" }),
    ).toHaveAttribute("href", "/recipes/abc");

    const current = screen.getByText("Edit");
    expect(current.tagName).not.toBe("A");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("renders a detail page's final item as current even though it has an href", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Parts", href: "/parts" },
          { label: "Garlic rice", href: "/parts/xyz" },
        ]}
      />,
    );

    // The last item is always the current page, never a link, regardless
    // of whether the caller supplied an href for it.
    expect(
      screen.queryByRole("link", { name: "Garlic rice" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Garlic rice")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("exposes an accessible breadcrumb navigation landmark", () => {
    render(
      <Breadcrumbs
        items={[
          { label: "Recipes", href: "/recipes" },
          { label: "New recipe" },
        ]}
      />,
    );
    expect(
      screen.getByRole("navigation", { name: "Breadcrumb" }),
    ).toBeInTheDocument();
  });
});
