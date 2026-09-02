import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishTagFlavorEditor } from "@/components/domain/dish/dish-tag-flavor-editor";
import {
  setDishTags,
  setDishFlavorProfiles,
  setDishCuisines,
} from "@/lib/dishes/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  setDishTags: vi.fn(async () => ({ status: "success", dishId: "d1" })),
  setDishFlavorProfiles: vi.fn(async () => ({
    status: "success",
    dishId: "d1",
  })),
  setDishCuisines: vi.fn(async () => ({ status: "success", dishId: "d1" })),
}));

function renderEditor(
  overrides: Partial<React.ComponentProps<typeof DishTagFlavorEditor>> = {},
) {
  return render(
    <DishTagFlavorEditor
      dishId="d1"
      kind="RECIPE"
      tagOptions={[{ id: "tag1", displayName: "Quick", isFavorite: false }]}
      flavorProfileOptions={[{ id: "fp1", displayName: "Spicy" }]}
      cuisineOptions={[{ id: "cuisine1", displayName: "Vietnamese" }]}
      selectedTagIds={[]}
      selectedFlavorProfileValueIds={[]}
      selectedCuisineIds={[]}
      {...overrides}
    />,
  );
}

describe("DishTagFlavorEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves the selected tags, Flavor profiles, and Cuisines", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    await user.click(screen.getByText("Quick"));
    await user.click(screen.getByText("Spicy"));
    await user.click(screen.getByText("Vietnamese"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setDishTags).toHaveBeenCalledWith("RECIPE", {
      dishId: "d1",
      tagIds: ["tag1"],
    });
    expect(setDishFlavorProfiles).toHaveBeenCalledWith("RECIPE", {
      dishId: "d1",
      flavorProfileValueIds: ["fp1"],
    });
    expect(setDishCuisines).toHaveBeenCalledWith("RECIPE", {
      dishId: "d1",
      cuisineIds: ["cuisine1"],
    });
  });

  // PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): zero Cuisines is an
  // ordinary valid state (a generic Part where Cuisine isn't meaningful) —
  // saving with none selected still calls setDishCuisines with an empty
  // array, clearing any previously assigned Cuisine, not skipping the call.
  it("saves an empty Cuisine selection when a Dish's Cuisine is cleared", async () => {
    const user = userEvent.setup();
    renderEditor({ selectedCuisineIds: ["cuisine1"] });

    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    expect(
      screen.getByRole("checkbox", { name: "Vietnamese" }),
    ).toHaveAttribute("data-state", "checked");
    await user.click(screen.getByText("Vietnamese"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(setDishCuisines).toHaveBeenCalledWith("RECIPE", {
      dishId: "d1",
      cuisineIds: [],
    });
  });

  it("Cancel discards in-progress selections without saving", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    await user.click(screen.getByText("Quick"));
    await user.click(screen.getByText("Vietnamese"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(setDishTags).not.toHaveBeenCalled();
    expect(setDishCuisines).not.toHaveBeenCalled();

    // Reopening starts fresh from the original (unsaved) selection.
    await user.click(
      screen.getByRole("button", { name: "Tags, Flavors & Cuisine" }),
    );
    expect(screen.getByRole("checkbox", { name: "Quick" })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(
      screen.getByRole("checkbox", { name: "Vietnamese" }),
    ).toHaveAttribute("data-state", "unchecked");
  });
});
