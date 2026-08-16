import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkPublishDialog } from "@/components/domain/sharing/bulk-publish-dialog";

const mockListShareableItems = vi.fn();
const mockPublishDishes = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  listShareableItemsForSender: (...args: unknown[]) =>
    mockListShareableItems(...args),
  publishDishes: (...args: unknown[]) => mockPublishDishes(...args),
}));

Object.assign(navigator, { clipboard: { writeText: vi.fn() } });

const ITEMS = [
  {
    id: "r1",
    kind: "RECIPE",
    title: "Recipe One",
    versionLabel: "V1.0",
    stage: "ACTIVE",
    cuisine: null,
    archivedAt: null,
    imageAssetId: null,
    tagNames: [],
    rating: { kind: "none" },
  },
  {
    id: "p1",
    kind: "PART",
    title: "Part One",
    versionLabel: "V1.0",
    stage: "ACTIVE",
    cuisine: null,
    archivedAt: null,
    imageAssetId: null,
    tagNames: [],
    rating: { kind: "none" },
  },
];

describe("BulkPublishDialog", () => {
  beforeEach(() => {
    mockListShareableItems.mockReset();
    mockPublishDishes.mockReset();
    mockListShareableItems.mockResolvedValue({
      status: "success",
      items: ITEMS,
    });
  });

  it("Continue stays disabled until at least one item is selected", async () => {
    const user = userEvent.setup();
    render(<BulkPublishDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(screen.getByLabelText("Select Recipe One"));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("applies one shared settings payload and creates one independent link per selected item", async () => {
    mockPublishDishes.mockResolvedValue({
      status: "success",
      results: [
        {
          dishId: "r1",
          status: "success",
          dishKind: "RECIPE",
          title: "Recipe One",
          url: "https://dishframe.test/s/abc",
        },
        {
          dishId: "p1",
          status: "success",
          dishKind: "PART",
          title: "Part One",
          url: "https://dishframe.test/s/def",
        },
      ],
    });
    const onPublished = vi.fn();
    const user = userEvent.setup();
    render(
      <BulkPublishDialog
        open
        onOpenChange={() => {}}
        onPublished={onPublished}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Share latest version" }),
    );
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(mockPublishDishes).toHaveBeenCalledWith(
      expect.objectContaining({
        dishIds: expect.arrayContaining(["r1", "p1"]),
        mode: "CURRENT",
      }),
    );

    expect(
      await screen.findByText("https://dishframe.test/s/abc"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://dishframe.test/s/def"),
    ).toBeInTheDocument();
    expect(onPublished).toHaveBeenCalled();
  });

  it("reports a partial failure per item rather than hiding it behind the successful ones", async () => {
    mockPublishDishes.mockResolvedValue({
      status: "success",
      results: [
        {
          dishId: "r1",
          status: "success",
          dishKind: "RECIPE",
          title: "Recipe One",
          url: "https://dishframe.test/s/abc",
        },
        {
          dishId: "p1",
          status: "error",
          message: "This item has no saved content to share yet.",
        },
      ],
    });
    const user = userEvent.setup();
    render(<BulkPublishDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Publish" }));

    expect(
      await screen.findByText("https://dishframe.test/s/abc"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This item has no saved content to share yet."),
    ).toBeInTheDocument();
  });
});
