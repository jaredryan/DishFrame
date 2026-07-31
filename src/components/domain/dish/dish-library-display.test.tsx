import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import type { LibraryFilters } from "@/lib/dishes/library-filters";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const dishes: DishCardItem[] = [
  {
    id: "1",
    currentTitle: "Ginger Bowl",
    stage: "ACTIVE",
    cuisine: "Japanese",
    updatedAt: new Date("2026-01-01"),
    imageAssetId: null,
  },
  {
    id: "2",
    currentTitle: "Old Stew",
    stage: "ARCHIVED",
    cuisine: null,
    updatedAt: new Date("2025-06-01"),
    imageAssetId: null,
  },
];

const defaultFilters: LibraryFilters = {
  search: "",
  stages: [],
  tagIds: [],
  cuisines: [],
  flavorProfileValueIds: [],
  rating: null,
  sort: "RECENTLY_UPDATED",
  sortIsExplicit: false,
};

function renderDisplay(overrides: Partial<LibraryFilters> = {}) {
  return render(
    <DishLibraryDisplay
      dishes={dishes}
      kind="RECIPE"
      label="recipe"
      basePath="/recipes"
      filters={{ ...defaultFilters, ...overrides }}
      tagOptions={[]}
      cuisineOptions={["Japanese"]}
      flavorProfileOptions={[]}
    />,
  );
}

describe("DishLibraryDisplay", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockClear();
  });

  it("defaults to the grid view", () => {
    renderDisplay();

    expect(screen.getByRole("radio", { name: "Grid view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Compact view" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("switches to the compact view without losing any dish from the (already server-filtered) list", async () => {
    const user = userEvent.setup();
    renderDisplay();

    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Compact view" }));

    expect(screen.getByRole("radio", { name: "Compact view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // Toggling presentation never touches the dish list itself — filtering
    // is resolved server-side, before this component ever receives `dishes`.
    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();
  });

  it("switching back to grid still shows every dish", async () => {
    const user = userEvent.setup();
    renderDisplay();

    await user.click(screen.getByRole("radio", { name: "Compact view" }));
    await user.click(screen.getByRole("radio", { name: "Grid view" }));

    expect(screen.getByRole("radio", { name: "Grid view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();
  });

  it("both views render the same dish IDs in the same order", () => {
    const { unmount } = renderDisplay();
    const gridOrder = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    unmount();

    window.localStorage.setItem("dishframe:library-view-mode", "compact");
    renderDisplay();
    const compactOrder = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));

    expect(compactOrder).toEqual(gridOrder);
  });

  it("switching views never navigates — active search/filter/sort criteria and scope survive untouched", async () => {
    const user = userEvent.setup();
    renderDisplay({
      search: "curry",
      tagIds: ["tag1"],
      sort: "ALPHABETICAL",
      sortIsExplicit: true,
    });

    // The active-filter chip row (rendered by LibraryFilterBar, fed the same
    // `filters` prop) is present before switching views.
    expect(screen.getByText("“curry”")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Compact view" }));

    // View toggling is local (React state + localStorage) only — it must
    // never call the router, which would be the only way search/filter/sort
    // params or the Recipe/Part scope (encoded in the URL, not touched here)
    // could be lost.
    expect(push).not.toHaveBeenCalled();
    // The same `filters` prop still flows into LibraryFilterBar post-switch.
    expect(screen.getByText("“curry”")).toBeInTheDocument();
  });

  it("shows an ordinarily-empty-library message when no filters are active and there are no dishes", () => {
    render(
      <DishLibraryDisplay
        dishes={[]}
        kind="RECIPE"
        label="recipe"
        basePath="/recipes"
        filters={defaultFilters}
        tagOptions={[]}
        cuisineOptions={[]}
        flavorProfileOptions={[]}
      />,
    );

    expect(screen.getByText("No recipes yet")).toBeInTheDocument();
  });

  it("shows a distinct no-matches message when a filter is active and there are no dishes (§50.3)", () => {
    render(
      <DishLibraryDisplay
        dishes={[]}
        kind="RECIPE"
        label="recipe"
        basePath="/recipes"
        filters={{ ...defaultFilters, search: "lasagna" }}
        tagOptions={[]}
        cuisineOptions={[]}
        flavorProfileOptions={[]}
      />,
    );

    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.queryByText("No recipes yet")).not.toBeInTheDocument();
  });
});
