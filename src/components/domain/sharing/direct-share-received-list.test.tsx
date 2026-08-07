import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareReceivedList } from "@/components/domain/sharing/direct-share-received-list";
import type { ReceivedItemView } from "@/lib/sharing/view-model";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockAccept = vi.fn();
const mockDecline = vi.fn();
const mockGetPreview = vi.fn();
const mockGetDetail = vi.fn();
const mockFinalize = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  acceptDirectShare: (...args: unknown[]) => mockAccept(...args),
  declineDirectShare: (...args: unknown[]) => mockDecline(...args),
  getDirectSharePreview: (...args: unknown[]) => mockGetPreview(...args),
  getDirectShareCollectionDetail: (...args: unknown[]) =>
    mockGetDetail(...args),
  finalizeDirectShareCollection: (...args: unknown[]) => mockFinalize(...args),
}));

const PENDING_SINGLE: ReceivedItemView = {
  kind: "single",
  id: "rshare-1",
  dishKind: "RECIPE",
  dishTitleSnapshot: "Ramen",
  senderName: "Alex",
  note: null,
  status: "PENDING",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdDishId: null,
};

const ACCEPTED_SINGLE: ReceivedItemView = {
  kind: "single",
  id: "rshare-2",
  dishKind: "RECIPE",
  dishTitleSnapshot: "Salad",
  senderName: "Alex",
  note: null,
  status: "ACCEPTED",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdDishId: "dish-copy-1",
};

const GROUP: ReceivedItemView = {
  kind: "group",
  id: "rcol-1",
  senderName: "Jordan",
  note: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  children: [
    {
      id: "c1",
      dishKind: "RECIPE",
      dishTitleSnapshot: "Tacos",
      status: "PENDING",
      createdDishId: null,
    },
    {
      id: "c2",
      dishKind: "RECIPE",
      dishTitleSnapshot: "Chili",
      status: "ACCEPTED",
      createdDishId: "dish-copy-2",
    },
  ],
};

describe("DirectShareReceivedList", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockAccept.mockReset();
    mockDecline.mockReset();
    mockGetPreview.mockReset();
  });

  it("places Preview, Decline, Accept together in that order for a pending item", () => {
    render(<DirectShareReceivedList items={[PENDING_SINGLE]} />);
    const buttons = screen.getAllByRole("button");
    const labels = buttons.map((b) => b.textContent);
    expect(labels).toEqual(["Preview", "Decline", "Accept"]);
  });

  it("gives Decline the destructive-text treatment and Accept the primary treatment", () => {
    render(<DirectShareReceivedList items={[PENDING_SINGLE]} />);
    expect(
      screen.getByRole("button", { name: "Decline" }).dataset.variant,
    ).toBe("destructive");
    expect(screen.getByRole("button", { name: "Accept" }).dataset.variant).toBe(
      "default",
    );
    expect(
      screen.getByRole("button", { name: "Preview" }).dataset.variant,
    ).toBe("outline");
  });

  it("accepts a single item via acceptDirectShare using its own id", async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({
      status: "success",
      outcome: "accepted",
      dishId: "new-dish",
      dishKind: "RECIPE",
    });
    render(<DirectShareReceivedList items={[PENDING_SINGLE]} />);
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(mockAccept).toHaveBeenCalledWith({ directShareId: "rshare-1" });
    await waitFor(() =>
      expect(screen.getByText("View your copy")).toBeInTheDocument(),
    );
  });

  it("declines a single item via declineDirectShare", async () => {
    const user = userEvent.setup();
    mockDecline.mockResolvedValue({ status: "success", outcome: "declined" });
    render(<DirectShareReceivedList items={[PENDING_SINGLE]} />);
    await user.click(screen.getByRole("button", { name: "Decline" }));
    expect(mockDecline).toHaveBeenCalledWith({ directShareId: "rshare-1" });
  });

  it("shows a View your copy link once already accepted", () => {
    render(<DirectShareReceivedList items={[ACCEPTED_SINGLE]} />);
    const link = screen.getByRole("link", { name: "View your copy" });
    expect(link).toHaveAttribute("href", "/recipes/dish-copy-1");
  });

  it("renders a multi-item group collapsed, expandable to show child statuses and a Review action", async () => {
    const user = userEvent.setup();
    render(<DirectShareReceivedList items={[GROUP]} />);

    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(screen.getByText("1 pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(screen.queryByText("Tacos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show recipes" }));
    expect(screen.getByText("Tacos")).toBeInTheDocument();
    expect(screen.getByText("Chili")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View your copy" }),
    ).toHaveAttribute("href", "/recipes/dish-copy-2");
  });

  it("shows an empty-state message when nothing has been received", () => {
    render(<DirectShareReceivedList items={[]} />);
    expect(screen.getByText("Nothing sent to you yet.")).toBeInTheDocument();
  });
});
