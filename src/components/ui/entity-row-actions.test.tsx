import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Eye, Trash2 } from "lucide-react";
import { EntityRowActions } from "@/components/ui/entity-row-actions";

/**
 * jsdom has no layout engine, so which state (visible icons vs. overflow
 * menu) a real browser shows for a given container width can't be asserted
 * here — that's a container-query CSS concern. These tests instead cover
 * what both states share: the overflow menu carries the same actions
 * (label, destructive styling, disabled state) as the visible icon group.
 */
describe("EntityRowActions", () => {
  it("renders a visible icon button per action, each calling its own onClick", async () => {
    const onView = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <EntityRowActions
        actions={[
          { key: "view", label: "View Sourdough", icon: Eye, onClick: onView },
          {
            key: "delete",
            label: "Delete Sourdough",
            icon: Trash2,
            onClick: onDelete,
            destructive: true,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "View Sourdough" }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("the overflow menu exposes the same actions, calling the same onClick", async () => {
    const onView = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <EntityRowActions
        actions={[
          { key: "view", label: "View Sourdough", icon: Eye, onClick: onView },
          {
            key: "delete",
            label: "Delete Sourdough",
            icon: Trash2,
            onClick: onDelete,
            destructive: true,
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "View Sourdough" }),
    ).toBeInTheDocument();
    const deleteItem = within(menu).getByRole("menuitem", {
      name: "Delete Sourdough",
    });
    expect(deleteItem).toBeInTheDocument();

    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it("disables an action in both the visible group and the overflow menu", async () => {
    const user = userEvent.setup();
    render(
      <EntityRowActions
        actions={[
          {
            key: "delete",
            label: "Delete Sourdough",
            icon: Trash2,
            onClick: vi.fn(),
            disabled: true,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Delete Sourdough" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("menuitem", { name: "Delete Sourdough" }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  // Settings QA pass (Taster responsive overflow): a disabled action can
  // carry an explanation. The overflow menu shows it as an always-visible
  // line under the label (no hover needed — a nested Tooltip/Popover inside
  // an already-open dropdown doesn't work well, and this reads fine on
  // touch too).
  it("shows a disabled action's explanation as visible text inside the overflow menu", async () => {
    const user = userEvent.setup();
    render(
      <EntityRowActions
        actions={[
          {
            key: "delete",
            label: "Delete You (unavailable)",
            icon: Trash2,
            onClick: vi.fn(),
            disabled: true,
            disabledHint:
              "This is the built-in Taster for your own ratings, so it can't be archived or deleted.",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menuItem = await screen.findByRole("menuitem", {
      name: /Delete You \(unavailable\)/,
    });
    expect(menuItem).toHaveTextContent(
      "This is the built-in Taster for your own ratings, so it can't be archived or deleted.",
    );
  });
});
