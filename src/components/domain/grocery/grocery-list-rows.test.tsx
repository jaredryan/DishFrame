import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  GroceryListCard,
  type GroceryListRowItem,
} from "@/components/domain/grocery/grocery-list-rows";
import { ToastProvider, Toaster } from "@/components/ui/toast";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const { deleteGroceryList, completeGroceryList, reopenGroceryList } =
  vi.hoisted(() => ({
    deleteGroceryList: vi.fn(async () => ({ status: "success" })),
    completeGroceryList: vi.fn(async () => ({ status: "success" })),
    reopenGroceryList: vi.fn(async () => ({ status: "success" })),
  }));

vi.mock("@/lib/grocery/list-actions", () => ({
  deleteGroceryList,
  completeGroceryList,
  reopenGroceryList,
}));

function renderCard(overrides: Partial<GroceryListRowItem> = {}) {
  const list: GroceryListRowItem = {
    id: "list-1",
    title: "This week",
    createdAt: new Date("2026-01-01"),
    completedAt: null,
    linkedMealPlanId: null,
    linkedMealPlan: null,
    _count: { items: 3 },
    ...overrides,
  };
  return render(
    <ToastProvider>
      <GroceryListCard list={list} />
      <Toaster />
    </ToastProvider>,
  );
}

describe("GroceryListCard", () => {
  it("uses 'View details' as the explicit primary action, and the whole card links there too", () => {
    renderCard();
    expect(
      screen.getByRole("link", { name: "View details for This week" }),
    ).toHaveAttribute("href", "/grocery-lists/list-1");
    expect(
      screen.getByRole("button", { name: "View details for This week" }),
    ).toBeInTheDocument();
  });

  it("shows Mark complete for an active list and Reopen for a completed one", () => {
    renderCard({ completedAt: null });
    expect(
      screen.getByRole("button", { name: "Mark This week complete" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Reopen/ }),
    ).not.toBeInTheDocument();
  });

  it("shows Reopen instead of Mark complete once the list is completed", () => {
    renderCard({ completedAt: new Date("2026-01-02") });
    expect(
      screen.getByRole("button", { name: "Reopen This week" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Mark .* complete/ }),
    ).not.toBeInTheDocument();
  });

  it("shows no linked-plan indicator for a standalone list", () => {
    renderCard();
    expect(screen.queryByText(/Linked to meal plan/)).not.toBeInTheDocument();
  });

  it("shows a primary-blue linked-plan indicator for a Meal-Plan-linked list, navigating to that plan", () => {
    renderCard({
      linkedMealPlanId: "plan-1",
      linkedMealPlan: { title: "Beach Week" },
    });
    const link = screen.getByRole("link", {
      name: "Linked to meal plan: Beach Week",
    });
    expect(link).toHaveAttribute("href", "/meal-plans/plan-1");
    expect(link.className).toContain("text-primary");
  });

  it("clicking Delete does not navigate to the list, and confirms before deleting", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: "Delete This week" }));
    expect(
      screen.getByRole("dialog", { name: /Delete.*This week/ }),
    ).toBeInTheDocument();
    expect(deleteGroceryList).not.toHaveBeenCalled();
  });
});
