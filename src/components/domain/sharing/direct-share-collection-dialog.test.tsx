import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareCollectionDialog } from "@/components/domain/sharing/direct-share-collection-dialog";

const mockListShareableRecipes = vi.fn();
const mockLookupRecipient = vi.fn();
const mockSendCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  listShareableRecipesForSender: (...args: unknown[]) =>
    mockListShareableRecipes(...args),
  lookupDirectShareRecipient: (...args: unknown[]) =>
    mockLookupRecipient(...args),
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
}));

const RECIPES = [
  {
    id: "r1",
    title: "Recipe One",
    stage: "ACTIVE",
    archivedAt: null,
    imageAssetId: null,
  },
  {
    id: "r2",
    title: "Recipe Two",
    stage: "IDEA",
    archivedAt: null,
    imageAssetId: null,
  },
];

describe("DirectShareCollectionDialog", () => {
  beforeEach(() => {
    mockListShareableRecipes.mockReset();
    mockLookupRecipient.mockReset();
    mockSendCollection.mockReset();
    mockListShareableRecipes.mockResolvedValue({
      status: "success",
      recipes: RECIPES,
    });
  });

  it("preselects the current Recipe when launched from a Recipe's detail page", async () => {
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
  });

  it("Select all checks every loaded Recipe, and individual rows can be deselected", async () => {
    const user = userEvent.setup();
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByLabelText("Select Recipe One")).toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).toBeChecked();

    await user.click(screen.getByLabelText("Select Recipe Two"));
    expect(screen.getByLabelText("Select Recipe One")).toBeChecked();
    expect(screen.getByLabelText("Select Recipe Two")).not.toBeChecked();
  });

  it("uses truthful wording for an existing DishFrame recipient", async () => {
    const user = userEvent.setup();
    mockLookupRecipient.mockResolvedValue({
      status: "success",
      recipient: { id: "u1", name: "Alex" },
    });
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipient's email"),
      "alex@example.invalid",
    );
    await user.click(screen.getByRole("button", { name: "Find" }));

    await waitFor(() =>
      expect(screen.getByText(/Sending to/)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "SPAN" && element.textContent === "Alex",
      ),
    ).toBeInTheDocument();
  });

  it("uses truthful wording for a not-yet-registered recipient and requires explicit confirmation before Review is enabled", async () => {
    const user = userEvent.setup();
    mockLookupRecipient.mockResolvedValue({
      status: "success",
      recipient: null,
    });
    render(<DirectShareCollectionDialog open onOpenChange={() => {}} />);
    await waitFor(() =>
      expect(screen.getByText("Recipe One")).toBeInTheDocument(),
    );

    await user.type(
      screen.getByLabelText("Recipient's email"),
      "newperson@example.invalid",
    );
    await user.click(screen.getByRole("button", { name: "Find" }));
    await waitFor(() =>
      expect(
        screen.getByText(/No DishFrame account found/),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByLabelText("Select Recipe One"));
    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();

    await user.click(screen.getByText(/They'll receive this after signing in/));
    expect(screen.getByRole("button", { name: "Review" })).toBeEnabled();
  });
});
