import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishCompactCard } from "@/components/domain/dish/dish-compact-card";
import type { DishCardItem } from "@/components/domain/dish/dish-card";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const dish: DishCardItem = {
  id: "dish1",
  currentTitle: "Weeknight Ragu",
  stage: "ACTIVE",
  cuisineNames: [],
  updatedAt: new Date("2026-01-01"),
  imageAssetId: null,
};

// Nav/details QA batch item 3: the whole row is also a click target for
// View (the leftmost/primary icon action); Edit stays a separate explicit
// control that must keep performing its own action.
describe("DishCompactCard row click", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("makes the whole row a link to View, alongside the explicit icon", () => {
    render(<DishCompactCard dish={dish} kind="RECIPE" />);
    expect(
      screen.getByRole("link", { name: "View Weeknight Ragu" }),
    ).toHaveAttribute("href", "/recipes/dish1");
  });

  it("keeps Edit as its own explicit action, independent of the row link", async () => {
    const user = userEvent.setup();
    render(<DishCompactCard dish={dish} kind="RECIPE" />);

    await user.click(
      screen.getByRole("button", { name: "Edit Weeknight Ragu" }),
    );

    expect(push).toHaveBeenCalledWith("/recipes/dish1/edit");
    expect(push).not.toHaveBeenCalledWith("/recipes/dish1");
  });
});
