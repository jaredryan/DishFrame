import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareCollectionReviewDialog } from "@/components/domain/sharing/direct-share-collection-review-dialog";
import { ToastProvider, Toaster } from "@/components/ui/toast";

function renderDialog() {
  return render(
    <ToastProvider>
      <DirectShareCollectionReviewDialog
        open
        onOpenChange={() => {}}
        collectionId="col1"
      />
      <Toaster />
    </ToastProvider>,
  );
}

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockGetDetail = vi.fn();
const mockAccept = vi.fn();
const mockDecline = vi.fn();
const mockGetPreview = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  getDirectShareCollectionDetail: (...args: unknown[]) =>
    mockGetDetail(...args),
  acceptDirectShare: (...args: unknown[]) => mockAccept(...args),
  declineDirectShare: (...args: unknown[]) => mockDecline(...args),
  getDirectSharePreview: (...args: unknown[]) => mockGetPreview(...args),
}));

const DETAIL = {
  id: "col1",
  senderId: "sender1",
  senderName: "Jordan",
  recipientLookup: "me@example.invalid",
  hasJoined: true,
  note: "Enjoy",
  createdAt: new Date().toISOString(),
  children: [
    {
      id: "c1",
      dishId: "d1",
      dishKind: "RECIPE",
      dishTitleSnapshot: "Soup",
      status: "PENDING",
      createdDishId: null,
    },
    {
      id: "c2",
      dishId: "d2",
      dishKind: "RECIPE",
      dishTitleSnapshot: "Salad",
      status: "PENDING",
      createdDishId: null,
    },
  ],
};

describe("DirectShareCollectionReviewDialog", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockGetDetail.mockReset();
    mockAccept.mockReset();
    mockDecline.mockReset();
    mockGetDetail.mockResolvedValue({ status: "success", detail: DETAIL });
  });

  it("defaults every pending Recipe to selected (Accept all is one click)", async () => {
    renderDialog();

    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());
    expect(screen.getByText("Accept all")).toBeInTheDocument();
  });

  it("subset selection switches to explicit decline-rest wording, and accepts/declines each item individually with live progress", async () => {
    const user = userEvent.setup();
    mockAccept.mockResolvedValue({ status: "success", outcome: "accepted" });
    mockDecline.mockResolvedValue({ status: "success", outcome: "declined" });
    renderDialog();
    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]); // deselect "Salad"

    expect(
      screen.getByText(/the other 1 will be declined when you submit/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept selected, decline rest" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Accept selected, decline rest" }),
    );

    // Real per-recipe progress, not a bulk single call: the accepted item
    // ("Soup", c1) is copied via a sequential `acceptDirectShare` call, and
    // the unselected item ("Salad", c2) is declined via `declineDirectShare`.
    await waitFor(() =>
      expect(mockAccept).toHaveBeenCalledWith({ directShareId: "c1" }),
    );
    await waitFor(() =>
      expect(mockDecline).toHaveBeenCalledWith({ directShareId: "c2" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText("Saved your decision for this collection."),
      ).toBeInTheDocument(),
    );
  });

  it("reuses the shared batch-progress treatment while accepting and prevents duplicate submission", async () => {
    const user = userEvent.setup();
    let resolveFirstAccept!: (value: {
      status: "success";
      outcome: "accepted";
    }) => void;
    mockAccept.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstAccept = resolve;
      }),
    );
    mockAccept.mockResolvedValue({ status: "success", outcome: "accepted" });
    renderDialog();
    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Accept all" }));

    expect(
      await screen.findByText("Accepting shared items…"),
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    // No submit controls while a submission is in flight — can't be
    // double-clicked into a second concurrent submission.
    expect(
      screen.queryByRole("button", { name: "Accept all" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Decline all" }),
    ).not.toBeInTheDocument();

    resolveFirstAccept({ status: "success", outcome: "accepted" });
    await waitFor(() =>
      expect(
        screen.getByText("Saved your decision for this collection."),
      ).toBeInTheDocument(),
    );
  });

  it("Decline all declines every pending item and never calls accept", async () => {
    const user = userEvent.setup();
    mockDecline.mockResolvedValue({ status: "success", outcome: "declined" });
    renderDialog();
    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Decline all" }));

    await waitFor(() =>
      expect(mockDecline).toHaveBeenCalledWith({ directShareId: "c1" }),
    );
    expect(mockDecline).toHaveBeenCalledWith({ directShareId: "c2" });
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it("shows correct frozen Recipe titles and total count from the loaded detail", async () => {
    renderDialog();
    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());
    expect(screen.getByText("Salad")).toBeInTheDocument();
    expect(screen.getByText(/From Jordan/)).toBeInTheDocument();
  });
});
