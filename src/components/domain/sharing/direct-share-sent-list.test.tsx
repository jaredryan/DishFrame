import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareSentList } from "@/components/domain/sharing/direct-share-sent-list";
import type { SentItemView } from "@/lib/sharing/view-model";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockCancelDirectShare = vi.fn();
const mockCancelCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  cancelDirectShare: (...args: unknown[]) => mockCancelDirectShare(...args),
  cancelDirectShareCollection: (...args: unknown[]) =>
    mockCancelCollection(...args),
}));

const SINGLE: SentItemView = {
  kind: "single",
  id: "share-1",
  dishKind: "RECIPE",
  dishTitleSnapshot: "Ramen",
  recipientName: "Alex",
  recipientLookup: "alex@example.invalid",
  hasJoined: true,
  note: "Enjoy!",
  status: "PENDING",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const GROUP: SentItemView = {
  kind: "group",
  id: "col-1",
  recipientName: "Jordan",
  recipientLookup: "jordan@example.invalid",
  hasJoined: false,
  note: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  children: [
    { id: "c1", dishTitleSnapshot: "Tacos", status: "PENDING" },
    { id: "c2", dishTitleSnapshot: "Chili", status: "ACCEPTED" },
  ],
};

const ONE_RECIPE_GROUP: SentItemView = {
  kind: "group",
  id: "col-2",
  recipientName: "Sam",
  recipientLookup: "sam@example.invalid",
  hasJoined: true,
  note: null,
  createdAt: "2026-01-03T00:00:00.000Z",
  children: [{ id: "c3", dishTitleSnapshot: "Ramen", status: "PENDING" }],
};

describe("DirectShareSentList", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockCancelDirectShare.mockReset();
    mockCancelCollection.mockReset();
  });

  it("renders a single item as a normal card and cancels via cancelDirectShare", async () => {
    const user = userEvent.setup();
    mockCancelDirectShare.mockResolvedValue({ status: "success" });
    render(<DirectShareSentList items={[SINGLE]} />);

    expect(screen.getByText("Ramen")).toBeInTheDocument();
    expect(screen.getByText(/To Alex/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockCancelDirectShare).toHaveBeenCalledWith({
      directShareId: "share-1",
    });
  });

  it("flags a recipient who hasn't joined yet, and stays silent when they have", () => {
    render(<DirectShareSentList items={[SINGLE, GROUP]} />);
    expect(screen.getByText("Hasn't joined DishFrame yet")).toBeInTheDocument();
    // SINGLE has hasJoined: true, so only one badge should render.
    expect(screen.getAllByText("Hasn't joined DishFrame yet")).toHaveLength(1);
  });

  it("renders a multi-item group collapsed by default, expandable to show child statuses", async () => {
    const user = userEvent.setup();
    render(<DirectShareSentList items={[GROUP]} />);

    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(screen.getByText(/2 recipes/)).toBeInTheDocument();
    expect(screen.queryByText("Tacos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show recipes" }));
    expect(screen.getByText("Tacos")).toBeInTheDocument();
    expect(screen.getByText("Chili")).toBeInTheDocument();
  });

  it("cancels a group's pending children via cancelDirectShareCollection", async () => {
    const user = userEvent.setup();
    mockCancelCollection.mockResolvedValue({ status: "success" });
    render(<DirectShareSentList items={[GROUP]} />);

    await user.click(screen.getByRole("button", { name: "Cancel pending" }));
    expect(mockCancelCollection).toHaveBeenCalledWith({
      collectionId: "col-1",
    });
  });

  it("keeps the Show recipes control for a one-recipe collection", async () => {
    const user = userEvent.setup();
    render(<DirectShareSentList items={[ONE_RECIPE_GROUP]} />);

    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getByText(/1 recipe(?!s)/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show recipes" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show recipes" }));
    expect(screen.getByText("Ramen")).toBeInTheDocument();
  });

  it("shows an empty-state message when nothing has been sent", () => {
    render(<DirectShareSentList items={[]} />);
    expect(
      screen.getByText("You haven't sent anything yet."),
    ).toBeInTheDocument();
  });
});
