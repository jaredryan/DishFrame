import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishLibraryDisplay } from "@/components/domain/dish/dish-library-display";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import type { LibraryFilters } from "@/lib/dishes/library-filters";

const push = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => mockSearchParams,
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
  sortDirection: "desc",
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
    mockSearchParams = new URLSearchParams();
    push.mockClear();
    vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
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

  it("reads the initial view from the `display` query param", () => {
    mockSearchParams = new URLSearchParams("display=compact");
    renderDisplay();

    expect(screen.getByRole("radio", { name: "Compact view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("switches to the compact view without losing any dish from the (already server-filtered) list, and records it in the URL as `display=compact`", async () => {
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
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/recipes?display=compact",
    );
  });

  it("switching back to grid still shows every dish, and drops `display` from the URL (grid is the default)", async () => {
    mockSearchParams = new URLSearchParams("display=compact");
    const user = userEvent.setup();
    renderDisplay();

    await user.click(screen.getByRole("radio", { name: "Grid view" }));

    expect(screen.getByRole("radio", { name: "Grid view" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByText("Ginger Bowl")).toBeInTheDocument();
    expect(screen.getByText("Old Stew")).toBeInTheDocument();
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/recipes",
    );
  });

  it("both views render the same dishes in the same order", () => {
    const { unmount } = renderDisplay();
    const gridOrder = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    unmount();

    mockSearchParams = new URLSearchParams("display=compact");
    renderDisplay();
    // Compact view rows are no longer a row-level Link — read order off the
    // View button's aria-label (which embeds the dish title) instead.
    const compactOrder = screen
      .getAllByRole("button", { name: /^View / })
      .map((btn) => btn.getAttribute("aria-label")?.replace(/^View /, ""));

    expect(compactOrder).toEqual(
      gridOrder.map(
        (href) => dishes.find((d) => `/recipes/${d.id}` === href)?.currentTitle,
      ),
    );
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

    // View toggling updates the URL via a shallow `history.replaceState`
    // (see above), not `router.push` — it must never call the router, which
    // would be the only way search/filter/sort params or the Recipe/Part
    // scope (encoded in the URL, not touched here) could be lost.
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
