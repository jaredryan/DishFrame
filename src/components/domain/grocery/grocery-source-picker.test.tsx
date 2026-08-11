import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GrocerySourcePickerProvider,
  GrocerySourcePickerTrigger,
  GrocerySourcePickerPanel,
} from "@/components/domain/grocery/grocery-source-picker";
import type { GrocerySourceCandidate } from "@/lib/grocery/queries";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/grocery/list-actions", () => ({
  generateGroceryList: vi.fn(async () => ({
    status: "success",
    listId: "list-1",
  })),
}));

const RECIPE_CANDIDATE: GrocerySourceCandidate = {
  dishId: "dish-1",
  kind: "RECIPE",
  title: "Weeknight Stir-Fry",
  dishVersionId: "version-1",
  yieldQuantity: 4,
  yieldUnit: "servings",
};

function renderPicker(candidates: GrocerySourceCandidate[]) {
  return render(
    <GrocerySourcePickerProvider>
      <GrocerySourcePickerTrigger hasCandidates={candidates.length > 0} />
      <GrocerySourcePickerPanel candidates={candidates} />
    </GrocerySourcePickerProvider>,
  );
}

/**
 * Slice 21 empty-account audit: a brand-new account has zero Recipes/Parts,
 * so `SourceGroup` (below) renders nothing for either group and the form
 * offered no way to satisfy "Select at least one Recipe or Part." — a
 * dead-end. Covers the fix (disabled entry point with an explanation)
 * alongside the pre-existing populated-account path.
 */
describe("GrocerySourcePicker", () => {
  it("disables the entry point with an explanation when there are no Recipes or Parts", async () => {
    const user = userEvent.setup();
    renderPicker([]);

    // getByRole is ambiguous here: the DisabledActionHint wrapper span now
    // also carries role="button" (for Enter/Space parity), matching the
    // inner disabled <button> too. getByText only checks direct text-node
    // children, so it uniquely resolves to the real button.
    const button = screen.getByText("Make grocery list");
    expect(button).toBeDisabled();

    await user.click(button.closest("span")!);
    expect(
      await screen.findByText(
        "Create a Recipe or Part first — a grocery list is generated from what you've saved.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the picker and lists candidates when at least one Recipe or Part exists", async () => {
    const user = userEvent.setup();
    renderPicker([RECIPE_CANDIDATE]);

    const button = screen.getByRole("button", { name: "Make grocery list" });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(screen.getByText("Weeknight Stir-Fry")).toBeInTheDocument();
  });
});
