import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishEditor } from "@/components/domain/dish/dish-editor";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(async () => ({ status: "idle" })),
  editDish: vi.fn(async () => ({ status: "idle" })),
}));

describe("DishEditor unsaved-changes guard", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  it("shows the discard-changes dialog when an in-app link is clicked while dirty, and navigates on Discard", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");

    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Cancel" }));

    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(push).toHaveBeenCalledWith("/recipes");
  });

  it("keeps editing and dismisses the dialog without navigating", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not show the dialog when the form is clean", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    // A clean form lets the guard's click listener pass the click through
    // untouched (§15.3 — only dirty-form navigation is intercepted).
    await user.click(screen.getByRole("link", { name: "Cancel" }));

    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
  });
});
