import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareCollectionReviewDialog } from "@/components/domain/sharing/direct-share-collection-review-dialog";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockGetDetail = vi.fn();
const mockFinalize = vi.fn();
const mockGetPreview = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  getDirectShareCollectionDetail: (...args: unknown[]) =>
    mockGetDetail(...args),
  finalizeDirectShareCollection: (...args: unknown[]) => mockFinalize(...args),
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
    mockFinalize.mockReset();
    mockGetDetail.mockResolvedValue({ status: "success", detail: DETAIL });
  });

  it("defaults every pending Recipe to selected (Accept all is one click)", async () => {
    render(
      <DirectShareCollectionReviewDialog
        open
        onOpenChange={() => {}}
        collectionId="col1"
      />,
    );

    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());
    expect(screen.getByText("Accept all")).toBeInTheDocument();
  });

  it("subset selection switches to explicit decline-rest wording, and submits the correct accepted set", async () => {
    const user = userEvent.setup();
    mockFinalize.mockResolvedValue({
      status: "success",
      result: { accepted: [], declined: [] },
    });
    render(
      <DirectShareCollectionReviewDialog
        open
        onOpenChange={() => {}}
        collectionId="col1"
      />,
    );
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

    expect(mockFinalize).toHaveBeenCalledWith({
      collectionId: "col1",
      acceptedShareIds: ["c1"],
    });
  });

  it("Decline all submits an empty accepted set", async () => {
    const user = userEvent.setup();
    mockFinalize.mockResolvedValue({
      status: "success",
      result: { accepted: [], declined: [] },
    });
    render(
      <DirectShareCollectionReviewDialog
        open
        onOpenChange={() => {}}
        collectionId="col1"
      />,
    );
    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Decline all" }));

    expect(mockFinalize).toHaveBeenCalledWith({
      collectionId: "col1",
      acceptedShareIds: [],
    });
  });

  it("shows correct frozen Recipe titles and total count from the loaded detail", async () => {
    render(
      <DirectShareCollectionReviewDialog
        open
        onOpenChange={() => {}}
        collectionId="col1"
      />,
    );
    await waitFor(() => expect(screen.getByText("Soup")).toBeInTheDocument());
    expect(screen.getByText("Salad")).toBeInTheDocument();
    expect(screen.getByText(/From Jordan/)).toBeInTheDocument();
  });
});
