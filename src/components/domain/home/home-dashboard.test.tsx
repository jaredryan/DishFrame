import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  HomeDashboard,
  type RecentlyUpdatedDishItem,
} from "@/components/domain/home/home-dashboard";
import type { SessionRowData } from "@/components/domain/cooking/cook-sessions-view";
import type { MealPlanRowData } from "@/components/domain/mealplans/meal-plan-list-view";
import type { GroceryListRowItem } from "@/components/domain/grocery/grocery-list-rows";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("@/lib/cooking/actions", () => ({
  endCookingSession: vi.fn(async () => ({ status: "idle" })),
  deleteCookingSession: vi.fn(async () => ({ status: "idle" })),
  listCookablePickerItems: vi.fn(async () => ({
    status: "success",
    items: [],
  })),
}));

vi.mock("@/lib/mealplans/actions", () => ({
  deleteMealPlan: vi.fn(async () => ({ status: "idle" })),
  completeMealPlan: vi.fn(async () => ({ status: "idle" })),
  reactivateMealPlan: vi.fn(async () => ({ status: "idle" })),
}));

vi.mock("@/lib/grocery/list-actions", () => ({
  deleteGroceryList: vi.fn(async () => ({ status: "idle" })),
}));

const noSessions: SessionRowData[] = [];
const noDishes: RecentlyUpdatedDishItem[] = [];
const noMealPlans: MealPlanRowData[] = [];
const noGroceryLists: GroceryListRowItem[] = [];

// RTL's `getByText` only matches an element's own direct text-node
// children, so text split across an inline element (e.g. the "Cook" span
// in the Continue cooking empty state) needs the full-text function-matcher
// pattern from the Testing Library FAQ rather than a plain string/regex.
function fullText(text: string) {
  return (_content: string, node: Element | null) => {
    if (!node) return false;
    const hasText = (n: Element) => n.textContent === text;
    return (
      hasText(node) &&
      Array.from(node.children).every((child) => !hasText(child))
    );
  };
}

function section(heading: string): HTMLElement {
  return screen.getByRole("heading", { name: heading }).closest("section")!;
}

function baseProps() {
  return {
    activeSessions: noSessions,
    recentlyUpdated: noDishes,
    activeMealPlans: noMealPlans,
    hasCompletedMealPlans: false,
    activeGroceryLists: noGroceryLists,
  };
}

function activeSession(
  overrides: Partial<SessionRowData> = {},
): SessionRowData {
  return {
    id: "session-1",
    dishTitle: "Weeknight Ragu",
    dishKind: "RECIPE",
    startedAt: new Date(),
    ...overrides,
  };
}

function dishItem(
  overrides: Partial<RecentlyUpdatedDishItem> = {},
): RecentlyUpdatedDishItem {
  return {
    id: "dish-1",
    kind: "RECIPE",
    currentTitle: "Weeknight Ragu",
    stage: "ACTIVE",
    cuisine: null,
    updatedAt: new Date(),
    imageAssetId: null,
    ...overrides,
  };
}

function mealPlan(overrides: Partial<MealPlanRowData> = {}): MealPlanRowData {
  return {
    id: "plan-1",
    title: "This week",
    startDate: new Date("2026-01-01"),
    endDate: new Date("2026-01-07"),
    completedAt: null,
    _count: { entries: 3 },
    ...overrides,
  };
}

function groceryList(
  overrides: Partial<GroceryListRowItem> = {},
): GroceryListRowItem {
  return {
    id: "list-1",
    title: "Weekly groceries",
    createdAt: new Date("2026-01-01"),
    _count: { items: 5 },
    ...overrides,
  };
}

describe("HomeDashboard", () => {
  it("renders all four dashboard sections", () => {
    render(<HomeDashboard {...baseProps()} />);
    expect(
      screen.getByRole("heading", { name: "Continue cooking" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recently updated" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Meal plans" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Grocery lists" }),
    ).toBeInTheDocument();
  });

  describe("Continue cooking", () => {
    it("shows the empty-state hint when there are no active sessions", () => {
      render(<HomeDashboard {...baseProps()} />);
      expect(
        screen.getByText(
          fullText(
            "Open a Recipe or Part and choose Cook to start a Cooking Session.",
          ),
        ),
      ).toBeInTheDocument();
    });

    it("surfaces active sessions", () => {
      render(
        <HomeDashboard
          {...baseProps()}
          activeSessions={[activeSession({ dishTitle: "Sourdough Loaf" })]}
        />,
      );
      expect(screen.getByText("Sourdough Loaf")).toBeInTheDocument();
    });

    it("renders a Start cooking primary action opening the What will you cook? picker, and a View cooking sessions link to /cook", async () => {
      const user = userEvent.setup();
      render(<HomeDashboard {...baseProps()} />);
      const scope = within(section("Continue cooking"));
      expect(
        scope.getByRole("link", { name: /View cooking sessions/i }),
      ).toHaveAttribute("href", "/cook");

      // Full picker behavior (search, tabs, selection, Cook navigation) is
      // covered by start-cooking-button.test.tsx — Home only needs to prove
      // it opens the same picker.
      await user.click(scope.getByRole("button", { name: "Start cooking" }));
      expect(
        await screen.findByRole("dialog", {
          name: "What will you cook?",
        }),
      ).toBeInTheDocument();
    });
  });

  describe("Recently updated", () => {
    it("shows the empty state linking to Recipe creation", () => {
      render(<HomeDashboard {...baseProps()} />);
      const link = screen.getByRole("link", {
        name: /create your first Recipe/i,
      });
      expect(link).toHaveAttribute("href", "/recipes/new");
    });

    it("combines Recipes and Parts, distinguishable by type", () => {
      render(
        <HomeDashboard
          {...baseProps()}
          recentlyUpdated={[
            dishItem({ id: "r1", kind: "RECIPE", currentTitle: "Ragu" }),
            dishItem({ id: "p1", kind: "PART", currentTitle: "Tomato Sauce" }),
          ]}
        />,
      );
      expect(screen.getByText("Ragu")).toBeInTheDocument();
      expect(screen.getByText("Tomato Sauce")).toBeInTheDocument();
      expect(screen.getAllByText("Recipe")).toHaveLength(1);
      expect(screen.getAllByText("Part")).toHaveLength(1);
    });

    it("preserves the given item order", () => {
      const { container } = render(
        <HomeDashboard
          {...baseProps()}
          recentlyUpdated={[
            dishItem({ id: "newest", currentTitle: "Newest Dish" }),
            dishItem({ id: "oldest", currentTitle: "Oldest Dish" }),
          ]}
        />,
      );
      const text = container.textContent ?? "";
      expect(text.indexOf("Newest Dish")).toBeGreaterThanOrEqual(0);
      expect(text.indexOf("Newest Dish")).toBeLessThan(
        text.indexOf("Oldest Dish"),
      );
    });

    it("opens a + Create menu with Create recipe then Create part, each linking into the real creation flow", async () => {
      const user = userEvent.setup();
      render(<HomeDashboard {...baseProps()} />);
      await user.click(screen.getByRole("button", { name: "Create" }));
      const items = await screen.findAllByRole("menuitem");
      expect(items.map((item) => item.textContent?.trim())).toEqual([
        "Create recipe",
        "Create part",
      ]);
      expect(
        screen.getByRole("menuitem", { name: "Create recipe" }),
      ).toHaveAttribute("href", "/recipes/new");
      expect(
        screen.getByRole("menuitem", { name: "Create part" }),
      ).toHaveAttribute("href", "/parts/new");
    });

    it("renders View recipes and View parts links", () => {
      render(<HomeDashboard {...baseProps()} />);
      expect(
        screen.getByRole("link", { name: /View recipes/i }),
      ).toHaveAttribute("href", "/recipes");
      expect(screen.getByRole("link", { name: /View parts/i })).toHaveAttribute(
        "href",
        "/parts",
      );
    });
  });

  describe("Meal plans", () => {
    it("shows 'No Meal Plans yet.' when there are no active or completed plans", () => {
      render(<HomeDashboard {...baseProps()} />);
      expect(screen.getByText("No Meal Plans yet.")).toBeInTheDocument();
    });

    it("shows the completed-plans hint when active is empty but completed exist", () => {
      render(<HomeDashboard {...baseProps()} hasCompletedMealPlans />);
      expect(
        screen.getByText(
          "No active Meal Plans — previous plans remain available from the Meal Plans page.",
        ),
      ).toBeInTheDocument();
    });

    it("surfaces active meal plans", () => {
      render(
        <HomeDashboard
          {...baseProps()}
          activeMealPlans={[mealPlan({ title: "Beach Week" })]}
        />,
      );
      expect(screen.getByText("Beach Week")).toBeInTheDocument();
    });

    it("renders the Plan meals primary action and a View meal plans link, both to /meal-plans", () => {
      render(<HomeDashboard {...baseProps()} />);
      expect(screen.getByRole("link", { name: /plan meals/i })).toHaveAttribute(
        "href",
        "/meal-plans",
      );
      expect(
        screen.getByRole("link", { name: /View meal plans/i }),
      ).toHaveAttribute("href", "/meal-plans");
    });
  });

  describe("Grocery lists", () => {
    it("shows the empty state", () => {
      render(<HomeDashboard {...baseProps()} />);
      expect(screen.getByText("No active grocery lists.")).toBeInTheDocument();
    });

    it("surfaces active grocery lists", () => {
      render(
        <HomeDashboard
          {...baseProps()}
          activeGroceryLists={[groceryList({ title: "Farmers Market" })]}
        />,
      );
      expect(screen.getByText("Farmers Market")).toBeInTheDocument();
    });

    it("renders the Make grocery list primary action and a View grocery lists link, both to /grocery-lists", () => {
      render(<HomeDashboard {...baseProps()} />);
      const links = screen.getAllByRole("link", { name: /grocery list/i });
      const makeListLink = links.find((link) =>
        link.textContent?.includes("Make grocery list"),
      );
      expect(makeListLink).toHaveAttribute("href", "/grocery-lists");
      expect(
        screen.getByRole("link", { name: /View grocery lists/i }),
      ).toHaveAttribute("href", "/grocery-lists");
    });
  });
});
