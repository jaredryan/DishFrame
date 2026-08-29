import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareSentList } from "@/components/domain/sharing/direct-share-sent-list";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import type { SentItemView } from "@/lib/sharing/view-model";

function renderList(items: SentItemView[]) {
  return render(
    <ToastProvider>
      <DirectShareSentList items={items} />
      <Toaster />
    </ToastProvider>,
  );
}

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockCancelCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  cancelDirectShareCollection: (...args: unknown[]) =>
    mockCancelCollection(...args),
}));

// A one-item Send — view-model.ts's `buildSentItems` always collapses these
// into `kind: "single"` (matching how Received already worked), using the
// parent collection's own id as the cancel target.
const SINGLE: SentItemView = {
  kind: "single",
  id: "col-1",
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
  id: "col-2",
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

describe("DirectShareSentList", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockCancelCollection.mockReset();
  });

  it("renders a single item as a normal card and cancels via its one-item collection", async () => {
    const user = userEvent.setup();
    mockCancelCollection.mockResolvedValue({ status: "success" });
    renderList([SINGLE]);

    expect(screen.getByText("Ramen")).toBeInTheDocument();
    expect(screen.getByText(/To Alex/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mockCancelCollection).toHaveBeenCalledWith({
      collectionId: "col-1",
    });
  });

  it("flags a recipient who hasn't joined yet, and stays silent when they have", () => {
    renderList([SINGLE, GROUP]);
    expect(screen.getByText("Hasn't joined DishFrame yet")).toBeInTheDocument();
    // SINGLE has hasJoined: true, so only one badge should render.
    expect(screen.getAllByText("Hasn't joined DishFrame yet")).toHaveLength(1);
  });

  it("renders a multi-item group collapsed by default, expandable to show child statuses", async () => {
    const user = userEvent.setup();
    renderList([GROUP]);

    expect(screen.getByText("Jordan")).toBeInTheDocument();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
    expect(screen.queryByText("Tacos")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show items" }));
    expect(screen.getByText("Tacos")).toBeInTheDocument();
    expect(screen.getByText("Chili")).toBeInTheDocument();
  });

  it("cancels a group's pending children via cancelDirectShareCollection", async () => {
    const user = userEvent.setup();
    mockCancelCollection.mockResolvedValue({ status: "success" });
    renderList([GROUP]);

    await user.click(screen.getByRole("button", { name: "Cancel pending" }));
    expect(mockCancelCollection).toHaveBeenCalledWith({
      collectionId: "col-2",
    });
  });

  it("shows an empty-state message when nothing has been sent", () => {
    renderList([]);
    expect(
      screen.getByText("You haven't sent anything yet."),
    ).toBeInTheDocument();
  });
});
