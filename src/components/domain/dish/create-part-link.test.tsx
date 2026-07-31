import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CreatePartLink } from "@/components/domain/dish/create-part-link";

/**
 * Slice 6A browser-review correction pass §4: Create Part now opens the
 * complete standalone `/parts/new` flow in a new tab instead of the
 * removed simplified embedded dialog (previously `create-part-dialog.tsx`,
 * whose coverage this replaces) — the parent draft is never touched by
 * this action itself.
 */
describe("CreatePartLink", () => {
  it("links to /parts/new in a new tab with a safe rel attribute", () => {
    render(<CreatePartLink />);

    const link = screen.getByRole("link", { name: "Create Part" });
    expect(link).toHaveAttribute("href", "/parts/new");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("does not render the removed embedded Create Part dialog", () => {
    render(<CreatePartLink />);

    expect(screen.queryByText("Create a new Part")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: /create a new part/i }),
    ).not.toBeInTheDocument();
  });
});
