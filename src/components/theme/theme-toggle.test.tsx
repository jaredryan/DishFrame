import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme }),
}));

describe("ThemeToggle", () => {
  it("renders light, dark, and system options", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeInTheDocument();
  });

  it("calls setTheme when an option is selected", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("marks the active theme as checked", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  // Settings QA pass: the default/compact size (used both in the public
  // nav's desktop row and now in Settings' Appearance section) stays
  // visually compact on fine-pointer desktop but carries a pointer-coarse
  // variant that reaches the 44px-class touch target — jsdom can't evaluate
  // the `pointer: coarse` media feature itself, so this only asserts the
  // class is present, not that it wins at runtime.
  it("compact size carries a pointer-coarse touch-target variant", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Light" }).className).toMatch(
      /pointer-coarse:h-11/,
    );
  });
});
