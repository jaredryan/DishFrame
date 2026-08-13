import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareCollectionDialog } from "@/components/domain/sharing/direct-share-collection-dialog";

const mockListShareableItems = vi.fn();
const mockSendCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  listShareableItemsForSender: (...args: unknown[]) =>
    mockListShareableItems(...args),
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
}));

const ITEMS = [
  {
    id: "r1",
    kind: "RECIPE",
    title: "Recipe One",
    stage: "ACTIVE",
    archivedAt: null,
    imageAssetId: null,
  },
  {
    id: "r2",
    kind: "RECIPE",
    title: "Recipe Two",
    stage: "IDEA",
    archivedAt: null,
    imageAssetId: null,
  },
  {
    id: "p1",
    kind: "PART",
    title: "Part One",
    stage: "ACTIVE",
    archivedAt: null,
    imageAssetId: null,
  },
];

describe("DirectShareCollectionDialog", () => {
  beforeEach(() => {
    mockListShareableItems.mockReset();
    mockSendCollection.mockReset();
    mockListShareableItems.mockResolvedValue({
      status: "success",
      items: ITEMS,
    });
  });

  it("preselects the current item when launched from a detail page", async () => {
    render(
      <DirectShareCollectionDialog
        open
        onOpenChange={() => {}}
        preselectedDishId="r1"
      />,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Select Recipe One")).toBeChecked(),
    );
    expect(screen.getByLabelText("Select Recipe Two")).not.toBeChecked();
  });

  it("starts with nothing selected when launched from /share", async () => {
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Select Recipe One")).not.toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).not.toBeChecked();
    expect(screen.getByLabelText("Select Part One")).not.toBeChecked();
  });

  it("Select all checks every loaded item (Recipes and Parts alike), and individual rows can be deselected", async () => {
    const user = userEvent.setup();
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByLabelText("Select Recipe One")).toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).toBeChecked();
    expect(screen.getByLabelText("Select Part One")).toBeChecked();

    await user.click(screen.getByLabelText("Select Recipe Two"));
    expect(screen.getByLabelText("Select Recipe One")).toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).not.toBeChecked();
  });

  it("does not expose whether the entered email belongs to an existing account", async () => {
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    expect(
      screen.queryByRole("button", { name: "Find" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/No DishFrame account/)).not.toBeInTheDocument();
  });

  it("enables Review once a plausible email is entered and an item is selected", async () => {
    const user = userEvent.setup();
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("Recipient's email"),
      "person@example.invalid",
    );
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    await user.click(screen.getByLabelText("Select Recipe One"));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(
      screen.getByText("person@example.invalid", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("titles the dialog by the preselected item's kind, and generically otherwise", async () => {
    const { rerender } = render(
      <DirectShareCollectionDialog
        open
        onOpenChange={() => {}}
        preselectedDishKind="RECIPE"
      />,
    );
    expect(screen.getByText("Send this recipe")).toBeInTheDocument();

    rerender(
      <DirectShareCollectionDialog
        open
        onOpenChange={() => {}}
        preselectedDishKind="PART"
      />,
    );
    expect(screen.getByText("Send this part")).toBeInTheDocument();

    rerender(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    expect(screen.getByText("Send")).toBeInTheDocument();
  });
});
