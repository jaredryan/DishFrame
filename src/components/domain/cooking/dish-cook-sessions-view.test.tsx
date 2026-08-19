import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DishCookSessionsView,
  DishActiveSessionCard,
  DishCompletedSessionCard,
} from "@/components/domain/cooking/dish-cook-sessions-view";
import type {
  DishActiveSessionData,
  DishCompletedSessionData,
} from "@/lib/cooking/queries";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Mirrors the component's own formatters (dish-cook-sessions-view.tsx) so
// expected strings reflect the host's local timezone rather than assuming
// a fixed offset — the component has no `timeZone` override either.
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

vi.mock("@/lib/cooking/actions", () => ({
  endCookingSession: vi.fn(async () => ({ status: "success" })),
  deleteCookingSession: vi.fn(async () => ({ status: "success" })),
}));

const activeSession: DishActiveSessionData = {
  id: "session-active",
  startedAt: new Date("2026-08-14T11:12:00-04:00"),
  unitLabels: ["Prep", "Sauce"],
  cookingNotes: "Simmering now.",
};

const fullReviewSession: DishCompletedSessionData = {
  id: "session-full",
  state: "COMPLETED",
  startedAt: new Date("2026-08-13T17:00:00-04:00"),
  endedAt: new Date("2026-08-13T18:42:00-04:00"),
  isFullRecipe: true,
  includedUnitLabels: ["Prep", "Sauce"],
  cookingNotes: "Used bigger pot.",
  whatWentWell: "Great texture",
  whatDidNotGoWell: null,
  anythingElse: null,
  ratings: [
    { tasterId: "owner", tasterName: "You", isOwner: true, value: 5 },
    { tasterId: "mom", tasterName: "Mom", isOwner: false, value: 4 },
  ],
};

const partialUnratedSession: DishCompletedSessionData = {
  id: "session-partial",
  state: "ENDED_EARLY",
  startedAt: new Date("2026-08-10T10:00:00-04:00"),
  endedAt: new Date("2026-08-10T10:30:00-04:00"),
  isFullRecipe: false,
  includedUnitLabels: ["Prep"],
  cookingNotes: null,
  whatWentWell: null,
  whatDidNotGoWell: "Sauce split",
  anythingElse: null,
  ratings: [],
};

/**
 * Post-cook review + Cooking history refinement item 6: the dish-scoped
 * Cooking history page's own tailored cards — absolute timestamps, no
 * repeated dish name/kind badge, and independently-expandable
 * Ratings/Notes disclosures on Completed cards.
 */
describe("DishActiveSessionCard", () => {
  it("titles the card with the session-start timestamp and a noninteractive elapsed chip", () => {
    // formatElapsedLabel measures against real wall-clock time, and
    // activeSession.startedAt is a fixed historical date — pin "now" close
    // to it so the elapsed chip stays in "min elapsed" range regardless of
    // how much real time has passed since this fixture was written.
    vi.useFakeTimers();
    vi.setSystemTime(
      new Date(activeSession.startedAt.getTime() + 42 * 60 * 1000),
    );

    render(<DishActiveSessionCard session={activeSession} />);

    expect(
      screen.getByText(
        new RegExp(`Started ${dateFormatter.format(activeSession.startedAt)}`),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        new RegExp(timeFormatter.format(activeSession.startedAt)),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("42 min elapsed")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("expands Notes to show the currently-selected cooking units (present tense) and current Cooking notes", async () => {
    const user = userEvent.setup();
    render(<DishActiveSessionCard session={activeSession} />);

    expect(screen.queryByText(/Cooking: Prep, Sauce/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Notes/ }));

    expect(screen.getByText("Cooking: Prep, Sauce")).toBeInTheDocument();
    expect(screen.getByText("Simmering now.")).toBeInTheDocument();
  });

  it("keeps Resume and End actions", () => {
    render(<DishActiveSessionCard session={activeSession} />);

    expect(
      screen.getByRole("button", { name: "Resume this session" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End this session" }),
    ).toBeInTheDocument();
  });
});

describe("DishCompletedSessionCard", () => {
  it("titles the card with an absolute ended timestamp, without a status/duration chip", () => {
    render(<DishCompletedSessionCard session={fullReviewSession} />);

    const endedAt = fullReviewSession.endedAt ?? fullReviewSession.startedAt;
    expect(
      screen.getByText(new RegExp(dateFormatter.format(endedAt))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(timeFormatter.format(endedAt))),
    ).toBeInTheDocument();
    expect(screen.queryByText(/hour.*ago/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Completed ·/)).not.toBeInTheDocument();
  });

  it("summarizes ratings in the collapsed control and expands to the per-Taster breakdown", async () => {
    const user = userEvent.setup();
    render(<DishCompletedSessionCard session={fullReviewSession} />);

    const ratingsButton = screen.getByRole("button", { name: /Ratings/ });
    expect(ratingsButton).toHaveTextContent("4.5");
    expect(ratingsButton).toHaveTextContent("(2)");
    expect(screen.queryByText("Mom")).not.toBeInTheDocument();

    await user.click(ratingsButton);

    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("Mom")).toBeInTheDocument();
    expect(screen.getByText("5/5")).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
  });

  it("shows a disabled 'No ratings' control when the session has no ratings", () => {
    render(<DishCompletedSessionCard session={partialUnratedSession} />);

    const noRatings = screen.getByText("No ratings");
    expect(noRatings.closest("button")).toBeDisabled();
  });

  it("summarizes Full recipe when every unit was included, and shows the non-empty note sections in order", async () => {
    const user = userEvent.setup();
    render(<DishCompletedSessionCard session={fullReviewSession} />);

    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.getByText("Full recipe")).toBeInTheDocument();
    expect(screen.getByText("Used bigger pot.")).toBeInTheDocument();
    expect(screen.getByText("Great texture")).toBeInTheDocument();
    // Empty sections (What did not go well / Anything else) are omitted.
    expect(screen.queryByText("What did not go well")).not.toBeInTheDocument();
    expect(screen.queryByText("Anything else")).not.toBeInTheDocument();
  });

  it("summarizes a partial Cooked: list when not every unit was included", async () => {
    const user = userEvent.setup();
    render(<DishCompletedSessionCard session={partialUnratedSession} />);

    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.getByText("Cooked: Prep")).toBeInTheDocument();
    expect(screen.getByText("Sauce split")).toBeInTheDocument();
  });

  it("expands Ratings and Notes independently, and renders both — Ratings then Notes — when both are open", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DishCompletedSessionCard session={fullReviewSession} />,
    );

    await user.click(screen.getByRole("button", { name: /Ratings/ }));
    expect(screen.getByText("Mom")).toBeInTheDocument();
    expect(screen.queryByText("Full recipe")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Notes" }));
    expect(screen.getByText("Full recipe")).toBeInTheDocument();
    // Both stay open together.
    expect(screen.getByText("Mom")).toBeInTheDocument();

    // Fixed order: Ratings detail before Notes detail.
    const text = container.textContent ?? "";
    expect(text.indexOf("Mom")).toBeLessThan(text.indexOf("Full recipe"));
  });

  it("keeps View and Delete actions", () => {
    render(<DishCompletedSessionCard session={fullReviewSession} />);

    expect(
      screen.getByRole("button", { name: "View this session" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete this session" }),
    ).toBeInTheDocument();
  });
});

describe("DishCookSessionsView", () => {
  it("shows a brief empty state when there is no active session, alongside a populated Completed section", () => {
    render(
      <DishCookSessionsView
        active={[]}
        completed={[fullReviewSession]}
        emptyStateDishTitle="Weeknight Ragu"
      />,
    );

    expect(
      screen.getByText("No Cooking Sessions in progress."),
    ).toBeInTheDocument();
    const endedAt = fullReviewSession.endedAt ?? fullReviewSession.startedAt;
    expect(
      screen.getByText(new RegExp(dateFormatter.format(endedAt))),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(timeFormatter.format(endedAt))),
    ).toBeInTheDocument();
  });

  it("shows the dish-scoped empty state when there are no sessions at all", () => {
    render(
      <DishCookSessionsView
        active={[]}
        completed={[]}
        emptyStateDishTitle="Weeknight Ragu"
      />,
    );

    expect(
      screen.getByText("No Cooking Sessions for Weeknight Ragu yet."),
    ).toBeInTheDocument();
  });
});
