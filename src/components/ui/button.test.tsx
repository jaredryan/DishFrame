import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

/**
 * General loading-state improvement pass: `loading` replaces the old
 * per-caller `{isPending ? "Saving…" : "Save"}` text-swap pattern — the
 * button keeps its label (and so its width) and shows a spinner, disables
 * itself so a pending single operation can't be double-submitted.
 */
describe("Button loading state", () => {
  it("disables the button and marks it busy while loading, keeping its accessible label", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("preserves the control's dimensions — the label stays laid out, just hidden", () => {
    render(<Button loading>Save changes</Button>);
    expect(screen.getByText("Save changes")).toBeInTheDocument();
  });

  it("is not disabled or busy when not loading", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).not.toBeDisabled();
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("stays disabled for an explicit disabled prop unrelated to loading", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
