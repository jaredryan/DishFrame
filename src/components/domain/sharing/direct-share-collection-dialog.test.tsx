import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareCollectionDialog } from "@/components/domain/sharing/direct-share-collection-dialog";
import { ToastProvider, Toaster } from "@/components/ui/toast";

function renderDialog(onOpenChange: (open: boolean) => void = () => {}) {
  return render(
    <ToastProvider>
      <DirectShareCollectionDialog open onOpenChange={onOpenChange} />
      <Toaster />
    </ToastProvider>,
  );
}

const mockListShareableItems = vi.fn();
const mockSendCollection = vi.fn();
const mockGetRecipientHistory = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  listShareableItemsForSender: (...args: unknown[]) =>
    mockListShareableItems(...args),
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
  getDirectShareRecipientHistory: (...args: unknown[]) =>
    mockGetRecipientHistory(...args),
}));

const mockListDishVersionOptions = vi.fn();
vi.mock("@/lib/dishes/actions", () => ({
  listDishVersionOptions: (...args: unknown[]) =>
    mockListDishVersionOptions(...args),
}));

// Distinct per-dish Version lists so a test can prove each selected item's
// Version picker is independent — never one global Version applied to the
// whole batch.
const VERSIONS_BY_DISH_ID: Record<
  string,
  {
    versions: { id: string; majorVersion: number; minorVersion: number }[];
    currentVersionId: string;
  }
> = {
  r1: {
    versions: [
      { id: "r1-v1", majorVersion: 1, minorVersion: 0 },
      { id: "r1-v2", majorVersion: 2, minorVersion: 0 },
    ],
    currentVersionId: "r1-v1",
  },
  r2: {
    versions: [{ id: "r2-v1", majorVersion: 1, minorVersion: 0 }],
    currentVersionId: "r2-v1",
  },
  p1: {
    versions: [{ id: "p1-v1", majorVersion: 1, minorVersion: 0 }],
    currentVersionId: "p1-v1",
  },
};

const ITEMS = [
  {
    id: "r1",
    kind: "RECIPE",
    title: "Recipe One",
    versionLabel: "V1.0",
    stage: "ACTIVE",
    cuisineNames: [],
    archivedAt: null,
    imageAssetId: null,
    tagNames: [],
    rating: { kind: "none" },
  },
  {
    id: "r2",
    kind: "RECIPE",
    title: "Recipe Two",
    versionLabel: "V1.0",
    stage: "IDEA",
    cuisineNames: [],
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
    cuisineNames: [],
    archivedAt: null,
    imageAssetId: null,
    tagNames: [],
    rating: { kind: "none" },
  },
];

describe("DirectShareCollectionDialog", () => {
  beforeEach(() => {
    mockListShareableItems.mockReset();
    mockSendCollection.mockReset();
    mockListDishVersionOptions.mockReset();
    mockGetRecipientHistory.mockReset();
    mockListShareableItems.mockResolvedValue({
      status: "success",
      items: ITEMS,
    });
    mockGetRecipientHistory.mockResolvedValue({
      status: "success",
      history: {},
    });
    mockListDishVersionOptions.mockImplementation(
      (_kind: unknown, dishId: string) => {
        const entry = VERSIONS_BY_DISH_ID[dishId];
        return Promise.resolve(
          entry
            ? { status: "success", ...entry }
            : { status: "error", message: "Not found." },
        );
      },
    );
  });

  it("is the generalized flow: `/share`'s Send opens with nothing preselected", async () => {
    renderDialog();

    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Select Recipe One")).not.toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).not.toBeChecked();
    expect(screen.getByLabelText("Select Part One")).not.toBeChecked();
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  it("Select all checks every loaded item (Recipes and Parts alike), and individual rows can be deselected", async () => {
    const user = userEvent.setup();
    renderDialog();
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
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    expect(
      screen.queryByRole("button", { name: "Find" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/No DishFrame account/)).not.toBeInTheDocument();
  });

  it("enables Next once a recipient chip is added and an item is selected", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.type(
      screen.getByLabelText("Recipients"),
      "person@example.invalid{Enter}",
    );
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByLabelText("Select Recipe One"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("person@example.invalid", { selector: "span" }),
    ).toBeInTheDocument();
  });

  it("accepts more than one recipient chip", async () => {
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipients"),
      "a@example.invalid,b@example.invalid,",
    );
    expect(screen.getByText("a@example.invalid")).toBeInTheDocument();
    expect(screen.getByText("b@example.invalid")).toBeInTheDocument();
  });

  it("sends each selected item with its own independently chosen Version, not one shared Version for the whole batch", async () => {
    mockSendCollection.mockResolvedValue({
      status: "success",
      results: [
        {
          recipientEmail: "person@example.invalid",
          status: "success",
          collectionId: "collection1",
        },
      ],
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipients"),
      "person@example.invalid{Enter}",
    );
    await user.click(screen.getByLabelText("Select Recipe One"));
    await user.click(screen.getByLabelText("Select Recipe Two"));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    // Change only Recipe One's Version — Recipe Two's picker is left alone.
    // Both default to their own current Version once loaded.
    const versionTriggers = await screen.findAllByRole("combobox");
    await waitFor(() => expect(versionTriggers[0]).not.toBeDisabled());
    await user.click(versionTriggers[0]);
    await user.click(await screen.findByRole("option", { name: "V2.0" }));

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mockSendCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmails: ["person@example.invalid"],
        items: expect.arrayContaining([
          { dishId: "r1", dishVersionId: "r1-v2" },
          { dishId: "r2", dishVersionId: "r2-v1" },
        ]),
      }),
    );

    // Closes and hands off to a toast instead of a dedicated Sent screen.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText("Sent 2 items to person@example.invalid."),
    ).toBeInTheDocument();
  });

  it("on operation-level failure, keeps the dialog open and shows an error toast", async () => {
    mockSendCollection.mockResolvedValue({
      status: "error",
      message: "Could not send — try again.",
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipients"),
      "person@example.invalid{Enter}",
    );
    await user.click(screen.getByLabelText("Select Recipe One"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    const versionTrigger = await screen.findByRole("combobox");
    await waitFor(() => expect(versionTrigger).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Could not send — try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("on a per-recipient failure, keeps only the failed recipient chip so it can be retried", async () => {
    mockSendCollection.mockResolvedValue({
      status: "success",
      results: [
        {
          recipientEmail: "ok@example.invalid",
          status: "success",
          collectionId: "c1",
        },
        {
          recipientEmail: "bad@example.invalid",
          status: "error",
          message: "Already shared.",
        },
      ],
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog(onOpenChange);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipients"),
      "ok@example.invalid,bad@example.invalid,",
    );
    await user.click(screen.getByLabelText("Select Recipe One"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));

    const versionTrigger = await screen.findByRole("combobox");
    await waitFor(() => expect(versionTrigger).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByText("Already shared.")).toBeInTheDocument();
  });

  it("disables items already shared (accepted or pending) to the single entered recipient and excludes them from Select all", async () => {
    mockGetRecipientHistory.mockResolvedValue({
      status: "success",
      history: { r1: "ACCEPTED", p1: "PENDING" },
    });
    const user = userEvent.setup();
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipients"),
      "sister@example.invalid{Enter}",
    );

    await waitFor(
      () => expect(screen.getByText("Already shared")).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Recipe One")).toBeDisabled();
    expect(screen.getByLabelText("Select Part One")).toBeDisabled();
    expect(screen.getByLabelText("Select Recipe Two")).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "Select all (1 eligible)" }),
    );
    expect(screen.getByLabelText("Select Recipe One")).not.toBeChecked();
    expect(screen.getByLabelText("Select Part One")).not.toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).toBeChecked();
  });
});
