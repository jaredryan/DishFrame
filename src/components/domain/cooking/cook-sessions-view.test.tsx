import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CookSessionsView,
  CookActiveSessionCard,
  CookCompletedSessionCard,
} from "@/components/domain/cooking/cook-sessions-view";
import type {
  CrossDishActiveSessionData,
  CrossDishCompletedSessionData,
} from "@/lib/cooking/queries";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/cooking/actions", () => ({
  endCookingSession: vi.fn(async () => ({ status: "success" })),
  deleteCookingSession: vi.fn(async () => ({ status: "success" })),
}));

const activeSession: CrossDishActiveSessionData = {
  id: "session-active",
  dishId: "dish-1",
  dishTitle: "Weeknight Ragu",
  dishKind: "RECIPE",
  startedAt: new Date(Date.now() - 90 * 60 * 1000),
  unitLabels: ["Prep", "Sauce"],
  cookingNotes: "Simmering now.",
};

const completedSession: CrossDishCompletedSessionData = {
  id: "session-completed",
  dishId: "dish-2",
  dishTitle: "Sourdough Loaf",
  dishKind: "PART",
  state: "COMPLETED",
  startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  endedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  isFullRecipe: true,
  includedUnitLabels: ["Prep", "Bake"],
  cookingNotes: "Used bigger pot.",
  whatWentWell: "Great crust",
  whatDidNotGoWell: null,
  anythingElse: null,
  ratings: [
    { tasterId: "owner", tasterName: "You", isOwner: true, value: 5 },
    { tasterId: "mom", tasterName: "Mom", isOwner: false, value: 4 },
  ],
};

/**
 * Cooking session cards + navigation/profile follow-up item 2: `/cook`'s
 * cross-dish cards upgraded to the dish-history card pattern — Recipe/Part
 * name as title (no repeated kind badge), a relative-time chip in place of
 * the dish-scoped page's absolute timestamp, and the shared Ratings/Notes
 * disclosures.
 */
describe("CookActiveSessionCard", () => {
  it("titles the card with the dish name and shows relative-started/elapsed chips", () => {
    render(<CookActiveSessionCard session={activeSession} />);

    expect(screen.getByText("Weeknight Ragu")).toBeInTheDocument();
    // activeSession started 90 minutes ago: formatRelativeAge floors to "1
    // hour ago" while formatElapsedLabel rounds to "2 hours elapsed".
    expect(screen.getByText(/hour.*ago/)).toBeInTheDocument();
    expect(screen.getByText(/hours elapsed/)).toBeInTheDocument();
  });

  it("expands Notes to show the currently-cooking units and current Cooking notes", async () => {
    const user = userEvent.setup();
    render(<CookActiveSessionCard session={activeSession} />);

    expect(screen.queryByText(/Cooking: Prep, Sauce/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Notes/ }));

    expect(screen.getByText("Cooking: Prep, Sauce")).toBeInTheDocument();
    expect(screen.getByText("Simmering now.")).toBeInTheDocument();
  });

  it("keeps Resume and End actions", () => {
    render(<CookActiveSessionCard session={activeSession} />);

    expect(
      screen.getByRole("button", { name: "Resume Weeknight Ragu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End Weeknight Ragu" }),
    ).toBeInTheDocument();
  });
});

describe("CookCompletedSessionCard", () => {
  it("titles the card with the dish name, without a repeated kind badge, and shows a relative-time chip", () => {
    render(<CookCompletedSessionCard session={completedSession} />);

    expect(screen.getByText("Sourdough Loaf")).toBeInTheDocument();
    expect(screen.getByText(/hour.*ago/)).toBeInTheDocument();
    expect(screen.queryByText("Part")).not.toBeInTheDocument();
  });

  it("summarizes ratings in the collapsed control and expands to the per-Taster breakdown", async () => {
    const user = userEvent.setup();
    render(<CookCompletedSessionCard session={completedSession} />);

    const ratingsButton = screen.getByRole("button", { name: /4\.5/ });
    expect(ratingsButton).toHaveTextContent("4.5");
    expect(screen.queryByText("Mom")).not.toBeInTheDocument();

    await user.click(ratingsButton);
    expect(screen.getByText("Mom")).toBeInTheDocument();
  });

  it("expands Notes to show the Cooked summary and review note sections", async () => {
    const user = userEvent.setup();
    render(<CookCompletedSessionCard session={completedSession} />);

    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.getByText("Full recipe")).toBeInTheDocument();
    expect(screen.getByText("Great crust")).toBeInTheDocument();
  });

  it("keeps View and Delete actions", () => {
    render(<CookCompletedSessionCard session={completedSession} />);

    expect(
      screen.getByRole("button", { name: "View Sourdough Loaf" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete Sourdough Loaf" }),
    ).toBeInTheDocument();
  });
});

describe("CookSessionsView", () => {
  it("renders cross-dish Active and Completed sessions together", () => {
    render(
      <CookSessionsView
        active={[activeSession]}
        completed={[completedSession]}
      />,
    );

    expect(screen.getByText("Weeknight Ragu")).toBeInTheDocument();
    expect(screen.getByText("Sourdough Loaf")).toBeInTheDocument();
  });

  it("shows the generic empty state when there are no sessions and no scoped dish", () => {
    render(<CookSessionsView active={[]} completed={[]} />);

    expect(
      screen.getByText(/Open a Recipe or Part and choose/),
    ).toBeInTheDocument();
  });
});
