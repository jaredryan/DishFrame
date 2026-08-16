import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LibraryFilterBar } from "@/components/domain/dish/library-filter-bar";
import type { LibraryFilters } from "@/lib/dishes/library-filters";

const push = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => mockSearchParams,
}));

function baseFilters(overrides: Partial<LibraryFilters> = {}): LibraryFilters {
  return {
    search: "",
    stages: [],
    tagIds: [],
    cuisines: [],
    flavorProfileValueIds: [],
    rating: null,
    sort: "RECENTLY_UPDATED",
    sortDirection: "desc",
    sortIsExplicit: false,
    ...overrides,
  };
}

function renderBar(overrides: Partial<LibraryFilters> = {}) {
  return render(
    <LibraryFilterBar
      basePath="/recipes"
      filters={baseFilters(overrides)}
      tagOptions={[{ id: "tag1", displayName: "High Protein" }]}
      cuisineOptions={["Vietnamese", "Thai"]}
      flavorProfileOptions={[{ id: "fp1", displayName: "Spicy" }]}
    />,
  );
}

describe("LibraryFilterBar (URL/query-state)", () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    push.mockClear();
  });

  it("preserves an active `display` view param (owned by DishLibraryDisplay) across a filter navigation", async () => {
    mockSearchParams = new URLSearchParams("display=compact");
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Stage" }));
    await user.click(screen.getByText("Active"));

    expect(push).toHaveBeenCalledWith("/recipes?stage=ACTIVE&display=compact");
  });

  it("submits a typed search query as the q param", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.type(screen.getByRole("textbox", { name: "Search" }), "curry");
    await user.keyboard("{Enter}");

    expect(push).toHaveBeenCalledWith("/recipes?q=curry");
  });

  it("toggling a Stage checkbox navigates with that Stage in the query", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Stage" }));
    await user.click(screen.getByText("Active"));

    expect(push).toHaveBeenCalledWith("/recipes?stage=ACTIVE");
  });

  it("removing an active Stage chip toggles it back off", async () => {
    const user = userEvent.setup();
    renderBar({ stages: ["ACTIVE"] });

    await user.click(
      screen.getByRole("button", { name: "Remove Active filter" }),
    );

    expect(push).toHaveBeenCalledWith("/recipes");
  });

  it("selecting a cuisine checkbox navigates with the cuisine param", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "Cuisine" }));
    await user.click(screen.getByText("Vietnamese"));

    expect(push).toHaveBeenCalledWith("/recipes?cuisine=Vietnamese");
  });

  it("changing the rating select navigates with the mapped rating param", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("combobox", { name: "Rating filter" }));
    await user.click(screen.getByRole("option", { name: "4★ and up" }));

    expect(push).toHaveBeenCalledWith("/recipes?rating=4plus");
  });

  it("changing the sort select navigates with the mapped sort param", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(screen.getByRole("option", { name: "Rating" }));

    expect(push).toHaveBeenCalledWith("/recipes?sort=rating");
  });

  it("selecting the already-active Sort property again reverses its direction", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(screen.getByRole("option", { name: "Recently updated" }));

    // Recently updated is already active at its "desc" default — picking it
    // again reverses to "asc" rather than doing nothing, and (being a
    // genuine ordering change) still round-trips as explicit.
    expect(push).toHaveBeenCalledWith("/recipes?sort=recently-updated&dir=asc");
  });

  it("explicitly selecting the default Sort still writes it to the URL (Slice 10 correction)", async () => {
    const user = userEvent.setup();
    renderBar({ sort: "ALPHABETICAL" });

    await user.click(screen.getByRole("combobox", { name: "Sort" }));
    await user.click(screen.getByRole("option", { name: "Recently updated" }));

    // An explicit pick of the same value as the default must still
    // round-trip as explicit, since it changes ordering behavior while a
    // search is active (bypasses relevance-tier ranking entirely).
    expect(push).toHaveBeenCalledWith("/recipes?sort=recently-updated");
  });

  it("omits sort from the URL when it's already the default (Recently updated)", async () => {
    const user = userEvent.setup();
    renderBar({ search: "curry" });

    await user.click(
      screen.getByRole("button", { name: "Remove “curry” filter" }),
    );

    expect(push).toHaveBeenCalledWith("/recipes");
  });

  it("Clear all resets every filter but keeps the selected Sort", async () => {
    const user = userEvent.setup();
    renderBar({
      search: "curry",
      stages: ["ACTIVE"],
      sort: "ALPHABETICAL",
      sortDirection: "asc",
    });

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    expect(push).toHaveBeenCalledWith("/recipes?sort=alphabetical");
  });

  it("shows no active-filter chips row when every filter is at its default", () => {
    renderBar();
    expect(
      screen.queryByRole("button", { name: "Clear all" }),
    ).not.toBeInTheDocument();
  });
});
