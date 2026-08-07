import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";
import { listCookablePickerItems } from "@/lib/cooking/actions";
import type { CookablePickerItem } from "@/lib/dishes/queries";

vi.mock("@/lib/cooking/actions", () => ({
  listCookablePickerItems: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedListCookablePickerItems = vi.mocked(listCookablePickerItems);

const RAGU: CookablePickerItem = {
  id: "recipe-1",
  kind: "RECIPE",
  currentTitle: "Weeknight Ragu",
  tags: ["Weeknight", "Comfort food"],
};
const SAUCE: CookablePickerItem = {
  id: "part-1",
  kind: "PART",
  currentTitle: "Tomato Sauce",
  tags: [],
};

/**
 * "Select something to cook" picker: modeled after PartAttachPicker's own
 * fresh-fetch-per-opening convention (part-attach-picker.test.tsx), plus the
 * All/Recipes/Parts tabs and select-then-Cook flow this picker adds on top.
 * Home and Cook each render this same component — see home-dashboard.test.tsx
 * for the entry-point-only coverage that leans on this file for the rest.
 */
describe("StartCookingButton picker", () => {
  beforeEach(() => {
    mockedListCookablePickerItems.mockReset();
    push.mockReset();
  });

  it("does not fetch until opened, and opens the Select something to cook dialog", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);

    expect(mockedListCookablePickerItems).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    expect(
      await screen.findByRole("dialog", { name: "Select something to cook" }),
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

    await user.type(
      screen.getByPlaceholderText("Search your Recipes and Parts"),
      "sauce",
    );
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
    await user.type(
      screen.getByPlaceholderText("Search your Recipes and Parts"),
      "Ragu",
    );
    expect(
      screen.getByText("Nothing matches that search."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Recipes" }));
    expect(screen.getByText("Weeknight Ragu")).toBeInTheDocument();
  });

  it("keeps Cook disabled until a result is selected, then gives it a selected state", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    const cookButton = screen.getByRole("button", { name: "Cook" });
    expect(cookButton).toBeDisabled();

    const row = await screen.findByRole("button", { name: /Weeknight Ragu/ });
    await user.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
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
      screen.queryByRole("dialog", { name: "Select something to cook" }),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Cook navigates into the selected Recipe's own Cooking setup route", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("button", { name: /Weeknight Ragu/ }),
    );
    await user.click(screen.getByRole("button", { name: "Cook" }));

    expect(push).toHaveBeenCalledWith("/recipes/recipe-1/cook");
  });

  it("Cook navigates into the selected Part's own Cooking setup route", async () => {
    const user = userEvent.setup();
    mockedListCookablePickerItems.mockResolvedValue({
      status: "success",
      items: [RAGU, SAUCE],
    });
    render(<StartCookingButton />);
    await user.click(screen.getByRole("button", { name: "Start cooking" }));
    await user.click(
      await screen.findByRole("button", { name: /Tomato Sauce/ }),
    );
    await user.click(screen.getByRole("button", { name: "Cook" }));

    expect(push).toHaveBeenCalledWith("/parts/part-1/cook");
  });
});
