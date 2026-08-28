import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";
import { listCookablePickerItems } from "@/lib/cooking/actions";
import type { CookablePickerItem } from "@/lib/dishes/queries";

vi.mock("@/lib/cooking/actions", () => ({
  listCookablePickerItems: vi.fn(),
}));

const { listDishVersionOptions } = vi.hoisted(() => ({
  listDishVersionOptions: vi.fn(async () => ({
    status: "success" as const,
    versions: [{ id: "v1", majorVersion: 1, minorVersion: 0 }],
    currentVersionId: "v1" as string | null,
  })),
}));

vi.mock("@/lib/dishes/actions", () => ({
  listDishVersionOptions,
}));

const push = vi.fn();
let mockPathname = "/home";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => mockPathname,
}));

const mockedListCookablePickerItems = vi.mocked(listCookablePickerItems);

const RAGU: CookablePickerItem = {
  id: "recipe-1",
  kind: "RECIPE",
  stage: "ACTIVE",
  cuisine: null,
  currentTitle: "Weeknight Ragu",
  versionLabel: "V1.0",
  imageAssetId: null,
  tags: ["Weeknight", "Comfort food"],
  isFavorite: false,
  rating: { kind: "none" },
};
const SAUCE: CookablePickerItem = {
  id: "part-1",
  kind: "PART",
  stage: "ACTIVE",
  cuisine: null,
  currentTitle: "Tomato Sauce",
  versionLabel: "V1.0",
  imageAssetId: null,
  tags: [],
  isFavorite: false,
  rating: { kind: "none" },
};

/**
 * "What will you cook?" picker: modeled after PartAttachPicker's own
 * fresh-fetch-per-opening convention (part-attach-picker.test.tsx), plus the
 * All/Recipes/Parts tabs and select-then-choose-Version-then-Cook flow this
 * picker adds on top. Home and Cook each render this same component — see
 * home-dashboard.test.tsx for the entry-point-only coverage that leans on
 * this file for the rest.
 */
describe("StartCookingButton picker", () => {
  beforeEach(() => {
    mockedListCookablePickerItems.mockReset();
    listDishVersionOptions.mockClear();
    push.mockReset();
    mockPathname = "/home";
  });

  it("does not fetch until opened, and opens the What will you cook? dialog", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);

    expect(mockedListCookablePickerItems).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    expect(
      await screen.findByRole("dialog", { name: "What will you cook?" }),
    ).toBeInTheDocument();
    expect(mockedListCookablePickerItems).toHaveBeenCalledTimes(1);
  });

  it("shows both Recipe and Part results, each with its kind distinction and tags", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));

    expect(await screen.findByText("Weeknight Ragu")).toBeInTheDocument();
    expect(screen.getByText("Tomato Sauce")).toBeInTheDocument();
    expect(screen.getByText("Recipe")).toBeInTheDocument();
    expect(screen.getByText("Part")).toBeInTheDocument();
    expect(screen.getByText("Weeknight")).toBeInTheDocument();
    expect(screen.getByText("Comfort food")).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await screen.findByText("Weeknight Ragu");

    await user.type(screen.getByPlaceholderText("Search"), "sauce");
    expect(screen.queryByText("Weeknight Ragu")).not.toBeInTheDocument();
    expect(screen.getByText("Tomato Sauce")).toBeInTheDocument();
  });

  it("filters by the All/Recipes/Parts tabs, and search applies within the active tab", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await screen.findByText("Weeknight Ragu");

    await user.click(screen.getByRole("tab", { name: "Parts" }));
    expect(screen.queryByText("Weeknight Ragu")).not.toBeInTheDocument();
    expect(screen.getByText("Tomato Sauce")).toBeInTheDocument();

    // Searching for the Recipe's own title while scoped to Parts finds
    // nothing — the tab restricts what search can match.
    await user.type(screen.getByPlaceholderText("Search"), "Ragu");
    expect(
      screen.getByText("Nothing matches that search."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Recipes" }));
    expect(screen.getByText("Weeknight Ragu")).toBeInTheDocument();
  });

  it("selecting a result transitions to a separate Version-selection screen, not an inline control, with the current Version preselected", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    const cookButton = screen.getByRole("button", { name: "Cook" });
    expect(cookButton).toBeDisabled();

    const row = await screen.findByRole("radio", { name: /Weeknight Ragu/ });
    await user.click(row);

    // The search results (and the radio row itself) are gone — replaced by
    // the Version-selection screen for just this one item.
    expect(screen.queryByText("Tomato Sauce")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /Weeknight Ragu/ }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Weeknight Ragu")).toBeInTheDocument();

    // Current Version (V1.0) is preselected once it loads.
    await screen.findByText(/\(current\)/);
    expect(cookButton).toBeEnabled();
  });

  it("Cancel closes the dialog without starting anything", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await screen.findByText("Weeknight Ragu");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("dialog", { name: "What will you cook?" }),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Cook navigates into the selected Recipe's own Cooking setup route at the chosen Version, tagged with the Home origin so Cancel returns here", async () => {
    mockPathname = "/home";
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("radio", { name: /Weeknight Ragu/ }),
    );
    await screen.findByText(/\(current\)/);
    await user.click(screen.getByRole("button", { name: "Cook" }));

    expect(push).toHaveBeenCalledWith(
      "/recipes/recipe-1/cook?from=home&versionId=v1",
    );
  });

  it("Cook navigates into the selected Part's own Cooking setup route at the chosen Version, tagged with the Cook-page origin so Cancel returns here", async () => {
    mockPathname = "/cook";
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("radio", { name: /Tomato Sauce/ }),
    );
    await screen.findByText(/\(current\)/);
    await user.click(screen.getByRole("button", { name: "Cook" }));

    expect(push).toHaveBeenCalledWith(
      "/parts/part-1/cook?from=cook&versionId=v1",
    );
  });

  it("Back returns from the Version-selection screen to the search results, clearing the chosen Version", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("radio", { name: /Weeknight Ragu/ }),
    );
    await screen.findByText(/\(current\)/);

    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(await screen.findByText("Tomato Sauce")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cook" })).toBeDisabled();
  });
});
