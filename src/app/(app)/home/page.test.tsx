import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import AppHomePage from "./page";

/**
 * Slice 21 empty-account audit: "Import a recipe" was previously a
 * hard-disabled "coming soon" button even though `/recipes/import` (the
 * paste-and-review import flow, PRODUCT_SPEC.md §59) is fully built and
 * already linked from the Recipes page — stale terminology on a first-run
 * account's only other CTA besides "Create a recipe".
 */
describe("AppHomePage", () => {
  it("links Import a recipe to the real import flow instead of a disabled placeholder", () => {
    render(<AppHomePage />);

    const importLink = screen.getByRole("link", { name: /import a recipe/i });
    expect(importLink).toHaveAttribute("href", "/recipes/import");
    expect(importLink).not.toHaveAttribute("aria-disabled");
  });
});
