import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GroceryListDetailView } from "@/components/domain/grocery/grocery-list-detail-view";
import type {
  GroceryContributionDto,
  GroceryListDetailDto,
  GroceryListItemDto,
} from "@/lib/grocery/list-schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { selectGroceryItemVariant, acknowledgeGroceryItemSync } = vi.hoisted(
  () => ({
    selectGroceryItemVariant: vi.fn(async () => ({ status: "success" })),
    acknowledgeGroceryItemSync: vi.fn(async () => ({ status: "success" })),
  }),
);

vi.mock("@/lib/grocery/list-actions", () => ({
  toggleGroceryItem: vi.fn(async () => ({ status: "success" })),
  addManualGroceryItem: vi.fn(async () => ({ status: "success" })),
  editGroceryItem: vi.fn(async () => ({ status: "success" })),
  removeGroceryItem: vi.fn(async () => ({ status: "success" })),
  recategorizeGroceryItem: vi.fn(async () => ({ status: "success" })),
  reorderGroceryListItems: vi.fn(async () => ({ status: "success" })),
  combineGroceryItems: vi.fn(async () => ({ status: "success" })),
  uncombineGroceryItem: vi.fn(async () => ({ status: "success" })),
  selectGroceryItemVariant,
  renameGroceryList: vi.fn(async () => ({ status: "success" })),
  completeGroceryList: vi.fn(async () => ({ status: "success" })),
  reopenGroceryList: vi.fn(async () => ({ status: "success" })),
  duplicateGroceryList: vi.fn(async () => ({ status: "success" })),
  deleteGroceryList: vi.fn(async () => ({ status: "success" })),
  previewGroceryListSourceRefresh: vi.fn(async () => ({
    status: "success",
    preview: {
      hasNewerMinor: false,
      targetVersionId: "v1",
      targetVersionLabel: "V1.0",
      added: [],
      removed: [],
      changed: [],
    },
  })),
  applyGroceryListSourceRefresh: vi.fn(async () => ({ status: "success" })),
  acknowledgeGroceryItemSync,
}));

vi.mock("@/lib/mealplans/actions", () => ({
  resyncMealPlanGroceryLists: vi.fn(async () => ({ status: "success" })),
}));

function contribution(
  overrides: Partial<GroceryContributionDto> = {},
): GroceryContributionDto {
  return {
    id: "contribution-1",
    groceryListSourceId: "source-1",
    originalName: "Butter",
    quantityText: "1 cup",
    unit: "cup",
    isOptional: false,
    hasSubstitute: false,
    selectedVariant: "PRIMARY",
    syncState: null,
    previousQuantityText: null,
    ...overrides,
  };
}

function item(overrides: Partial<GroceryListItemDto> = {}): GroceryListItemDto {
  return {
    id: "item-1",
    name: "Butter",
    quantityText: "1 cup",
    unit: "cup",
    isOptional: false,
    isManual: false,
    checkedAt: null,
    position: 0,
    category: null,
    contributions: [contribution()],
    syncFlag: "UNCHANGED",
    flagAcknowledgedAt: null,
    ...overrides,
  };
}

function renderList(
  items: GroceryListItemDto[],
  listOverrides: Partial<GroceryListDetailDto> = {},
) {
  const list: GroceryListDetailDto = {
    id: "list-1",
    title: "This week",
    createdAt: new Date().toISOString(),
    completedAt: null,
    mode: "STANDALONE",
    linkedMealPlanId: null,
    sources: [],
    items,
    ...listOverrides,
  };
  return render(<GroceryListDetailView list={list} categoryOptions={[]} />);
}

describe("GroceryListDetailView — reversible substitute selection (Slice 12 correction 2)", () => {
  it("shows 'Use substitute' for an eligible primary-selected contribution and invokes selection with SUBSTITUTE", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({ hasSubstitute: true, selectedVariant: "PRIMARY" }),
        ],
      }),
    ]);

    const button = screen.getByRole("button", { name: "Use substitute" });
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();

    await user.click(button);
    expect(selectGroceryItemVariant).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "item-1",
      variant: "SUBSTITUTE",
    });
  });

  it("shows 'Use original' when the substitute is selected and invokes selection with PRIMARY", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({ hasSubstitute: true, selectedVariant: "SUBSTITUTE" }),
        ],
      }),
    ]);

    const button = screen.getByRole("button", { name: "Use original" });
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();

    await user.click(button);
    expect(selectGroceryItemVariant).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "item-1",
      variant: "PRIMARY",
    });
  });

  it("hides both actions when no substitute snapshot exists", () => {
    renderList([
      item({ contributions: [contribution({ hasSubstitute: false })] }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });

  it("hides both actions for a manual item even if it somehow carried substitute data", () => {
    renderList([
      item({
        isManual: true,
        contributions: [],
      }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });

  it("hides both actions for a multi-contribution (combined) item", () => {
    renderList([
      item({
        contributions: [
          contribution({ id: "c1", hasSubstitute: true }),
          contribution({ id: "c2", hasSubstitute: false }),
        ],
      }),
    ]);
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });

  it("hides both actions on a completed list", () => {
    renderList(
      [
        item({
          contributions: [
            contribution({ hasSubstitute: true, selectedVariant: "PRIMARY" }),
          ],
        }),
      ],
      { completedAt: new Date().toISOString() },
    );
    expect(
      screen.queryByRole("button", { name: "Use substitute" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use original" }),
    ).not.toBeInTheDocument();
  });
});

describe("GroceryListDetailView — mixed optionality display (Slice 12 correction 2)", () => {
  it("labels a manually-merged required+optional item 'Total (with optional)', not 'Optional'", () => {
    renderList([
      item({
        isOptional: false,
        contributions: [
          contribution({ id: "c1", isOptional: false }),
          contribution({ id: "c2", isOptional: true }),
        ],
      }),
    ]);
    expect(screen.getByText("Total (with optional)")).toBeInTheDocument();
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
  });

  it("keeps the normal Optional badge for a uniformly-optional combined item", () => {
    renderList([
      item({
        contributions: [
          contribution({ id: "c1", isOptional: true }),
          contribution({ id: "c2", isOptional: true }),
        ],
      }),
    ]);
    expect(screen.getByText("Optional")).toBeInTheDocument();
    expect(screen.queryByText("Total (with optional)")).not.toBeInTheDocument();
  });

  it("shows no optionality badge for a uniformly-required combined item", () => {
    renderList([
      item({
        contributions: [
          contribution({ id: "c1", isOptional: false }),
          contribution({ id: "c2", isOptional: false }),
        ],
      }),
    ]);
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
    expect(screen.queryByText("Total (with optional)")).not.toBeInTheDocument();
  });

  it("preserves each contribution's own optionality in the expanded source breakdown", async () => {
    const user = userEvent.setup();
    renderList([
      item({
        contributions: [
          contribution({
            id: "c1",
            originalName: "Cilantro",
            isOptional: true,
          }),
          contribution({
            id: "c2",
            originalName: "Basil",
            isOptional: false,
          }),
        ],
      }),
    ]);

    await user.click(screen.getByRole("button", { name: /Show sources/ }));
    const cilantroLine = screen.getByText(/Cilantro/).textContent ?? "";
    const basilLine = screen.getByText(/Basil/).textContent ?? "";
    expect(cilantroLine).toContain("optional");
    expect(basilLine).not.toContain("optional");
  });
});

describe("GroceryListDetailView — Meal-Plan sync flags (Slice 15, §81.4)", () => {
  it("flags a materially changed item without hiding it, and acknowledges on click", async () => {
    const user = userEvent.setup();
    renderList([item({ syncFlag: "CHANGED", flagAcknowledgedAt: null })], {
      mode: "MEAL_PLAN_LINKED",
      linkedMealPlanId: "plan-1",
    });

    expect(screen.getByText("Plan changed")).toBeInTheDocument();
    expect(screen.getByText(/Butter/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Acknowledge" }));
    expect(acknowledgeGroceryItemSync).toHaveBeenCalledWith({
      listId: "list-1",
      itemId: "item-1",
    });
  });

  it("flags a checked-off item whose contribution disappeared, preserving its checkmark and name (round-2 Correction 5)", async () => {
    renderList(
      [
        item({
          syncFlag: "REMOVED",
          checkedAt: new Date().toISOString(),
          flagAcknowledgedAt: null,
        }),
      ],
      { mode: "MEAL_PLAN_LINKED", linkedMealPlanId: "plan-1" },
    );

    expect(screen.getByText("No longer in the plan")).toBeInTheDocument();
    const checkbox = screen.getByRole("checkbox", { name: /Butter/ });
    expect(checkbox).toBeChecked();
  });

  it("shows no acknowledge affordance once already acknowledged", () => {
    renderList(
      [
        item({
          syncFlag: "CHANGED",
          flagAcknowledgedAt: new Date().toISOString(),
        }),
      ],
      { mode: "MEAL_PLAN_LINKED", linkedMealPlanId: "plan-1" },
    );
    expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).not.toBeInTheDocument();
  });

  it("shows no sync badges on an ordinary UNCHANGED item", () => {
    renderList([item({ syncFlag: "UNCHANGED" })]);
    expect(screen.queryByText("Plan changed")).not.toBeInTheDocument();
    expect(screen.queryByText("No longer in the plan")).not.toBeInTheDocument();
  });
});
