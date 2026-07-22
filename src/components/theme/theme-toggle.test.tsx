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
});
