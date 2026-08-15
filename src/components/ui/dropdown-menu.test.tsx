import type * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The AccountMenu hover bug traced back to Radix's modal default: while a
 * modal DropdownMenu is open, Radix sets `document.body.style.pointerEvents
 * = "none"` (via `@radix-ui/react-dismissable-layer`) so every underlying
 * control — not just this menu's own trigger — stops responding to hover
 * (and effectively anything but the dismissable layer itself). The shared
 * wrapper now defaults `modal` to `false`, which skips that entirely.
 */
function Menu(props: Partial<React.ComponentProps<typeof DropdownMenu>>) {
  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Item one</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe("DropdownMenu", () => {
  afterEach(() => {
    document.body.style.pointerEvents = "";
  });

  it("defaults to non-modal — the rest of the page stays interactive while open", async () => {
    const user = userEvent.setup();
    render(<Menu />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() =>
      expect(screen.getByText("Item one")).toBeInTheDocument(),
    );

    expect(document.body.style.pointerEvents).not.toBe("none");
  });

  it("still allows a caller to explicitly opt back into modal behavior", async () => {
    const user = userEvent.setup();
    render(<Menu modal />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() =>
      expect(screen.getByText("Item one")).toBeInTheDocument(),
    );

    expect(document.body.style.pointerEvents).toBe("none");
  });

  it("outside click still dismisses the menu", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <Menu />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() =>
      expect(screen.getByText("Item one")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() =>
      expect(screen.queryByText("Item one")).not.toBeInTheDocument(),
    );
  });

  it("Escape still dismisses the menu", async () => {
    const user = userEvent.setup();
    render(<Menu />);

    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() =>
      expect(screen.getByText("Item one")).toBeInTheDocument(),
    );

    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText("Item one")).not.toBeInTheDocument(),
    );
  });

  it("keyboard menu interaction (open, arrow to an item, select) still works", async () => {
    const user = userEvent.setup();
    render(<Menu />);

    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: "Item one" }),
      ).toBeInTheDocument(),
    );

    await user.keyboard("{ArrowDown}{Enter}");
    await waitFor(() =>
      expect(screen.queryByText("Item one")).not.toBeInTheDocument(),
    );
  });
});
