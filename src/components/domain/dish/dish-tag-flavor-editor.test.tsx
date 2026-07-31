import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishTagFlavorEditor } from "@/components/domain/dish/dish-tag-flavor-editor";
import { setDishTags, setDishFlavorProfiles } from "@/lib/dishes/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  setDishTags: vi.fn(async () => ({ status: "success", dishId: "d1" })),
  setDishFlavorProfiles: vi.fn(async () => ({
    status: "success",
    dishId: "d1",
  })),
}));

function renderEditor() {
  return render(
    <DishTagFlavorEditor
      dishId="d1"
      kind="RECIPE"
      tagOptions={[{ id: "tag1", displayName: "Quick", isFavorite: false }]}
      flavorProfileOptions={[{ id: "fp1", displayName: "Spicy" }]}
      selectedTagIds={[]}
      selectedFlavorProfileValueIds={[]}
    />,
  );
}

describe("DishTagFlavorEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the selected tags and Flavor profiles", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Tags & Flavors" }));
    await user.click(screen.getByText("Quick"));
    await user.click(screen.getByText("Spicy"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setDishTags).toHaveBeenCalledWith("RECIPE", {
      dishId: "d1",
      tagIds: ["tag1"],
    });
    expect(setDishFlavorProfiles).toHaveBeenCalledWith("RECIPE", {
      dishId: "d1",
      flavorProfileValueIds: ["fp1"],
    });
  });

  it("Cancel discards in-progress selections without saving", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Tags & Flavors" }));
    await user.click(screen.getByText("Quick"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(setDishTags).not.toHaveBeenCalled();

    // Reopening starts fresh from the original (unsaved) selection.
    await user.click(screen.getByRole("button", { name: "Tags & Flavors" }));
    expect(screen.getByRole("checkbox", { name: "Quick" })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
  });
});
