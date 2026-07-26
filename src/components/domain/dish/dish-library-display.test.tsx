import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import type { DishCardItem } from "@/components/domain/dish/dish-card";

const dishes: DishCardItem[] = [
  {
    id: "1",
    currentTitle: "Ginger Bowl",
    stage: "ACTIVE",
    cuisine: "Japanese",
    updatedAt: new Date("2026-01-01"),
  },
  {
    id: "2",
    currentTitle: "Old Stew",
    stage: "ARCHIVED",
    cuisine: null,
    updatedAt: new Date("2025-06-01"),
  },
];

describe("DishLibraryDisplay", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to the grid view", () => {
    render(<DishLibraryDisplay dishes={dishes} kind="RECIPE" label="recipe" />);

    expect(screen.getByRole("radio", { name: "Grid view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "List view" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("switches to the list view without losing any dish from the (already archived-filtered) list", async () => {
    const user = userEvent.setup();
    render(<DishLibraryDisplay dishes={dishes} kind="RECIPE" label="recipe" />);

    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "List view" }));

    expect(screen.getByRole("radio", { name: "List view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Toggling presentation never touches the dish list itself — the
    // archived filter is resolved server-side, before this component ever
    // receives `dishes`.
    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();
  });

  it("switching back to grid still shows every dish", async () => {
    const user = userEvent.setup();
    render(<DishLibraryDisplay dishes={dishes} kind="RECIPE" label="recipe" />);

    await user.click(screen.getByRole("radio", { name: "List view" }));
    await user.click(screen.getByRole("radio", { name: "Grid view" }));

    expect(screen.getByRole("radio", { name: "Grid view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();
  });
});
