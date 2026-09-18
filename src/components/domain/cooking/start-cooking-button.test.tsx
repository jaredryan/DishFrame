import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";
import { listCookablePickerItems } from "@/lib/cooking/actions";
import { readAndClearMultiSourceSetupSelection } from "@/lib/cooking/multi-source-setup-handoff";
import type { CookablePickerItem } from "@/lib/dishes/queries";

vi.mock("@/lib/cooking/actions", () => ({
  listCookablePickerItems: vi.fn(),
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
  cuisineNames: [],
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
  cuisineNames: [],
  currentTitle: "Tomato Sauce",
  versionLabel: "V1.0",
  imageAssetId: null,
  tags: [],
  isFavorite: false,
  rating: { kind: "none" },
};

/**
 * "What will you cook?" picker (completion pass, 2026-09-18 — collapsed
 * back to a single checkbox-multi-select step): modeled after
 * PartAttachPicker's own fresh-fetch-per-opening convention
 * (part-attach-picker.test.tsx), plus the All/Recipes/Parts tabs this
 * picker adds on top. Continuing hands off to the dedicated multi-source
 * Cooking Setup route (`/cook/setup`) via `sessionStorage` — no Version or
 * scale step lives in this dialog; Setup owns that.
 */
describe("StartCookingButton picker", () => {
  beforeEach(() => {
    mockedListCookablePickerItems.mockReset();
    push.mockReset();
    mockPathname = "/home";
    window.sessionStorage.clear();
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

  it("allows checking multiple Recipes/Parts at once, with Continue disabled until at least one is checked", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    await user.click(
      await screen.findByRole("checkbox", { name: /Weeknight Ragu/ }),
    );
    expect(continueButton).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: /Tomato Sauce/ }));

    // Both stay checked and visible — no transition to a second step.
    expect(
      screen.getByRole("checkbox", { name: /Weeknight Ragu/ }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /Tomato Sauce/ }),
    ).toBeChecked();
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

  it("Continue navigates directly to the multi-source Cooking Setup route with every checked source, tagged with the Home origin", async () => {
    mockPathname = "/home";
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("checkbox", { name: /Weeknight Ragu/ }),
    );
    await user.click(screen.getByRole("checkbox", { name: /Tomato Sauce/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(push).toHaveBeenCalledWith("/cook/setup");
    const selection = readAndClearMultiSourceSetupSelection();
    expect(selection?.from).toBe("home");
    expect(selection?.sources).toEqual([
      { dishId: "recipe-1", dishVersionId: null },
      { dishId: "part-1", dishVersionId: null },
    ]);
  });

  it("tags the handoff with the Cook-page origin when opened from /cook", async () => {
    mockPathname = "/cook";
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("checkbox", { name: /Weeknight Ragu/ }),
    );
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const selection = readAndClearMultiSourceSetupSelection();
    expect(selection?.from).toBe("cook");
  });
});
