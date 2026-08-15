import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareSingleItemDialog } from "@/components/domain/sharing/direct-share-single-item-dialog";

const mockSendCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
}));

describe("DirectShareSingleItemDialog", () => {
  beforeEach(() => {
    mockSendCollection.mockReset();
    mockSendCollection.mockResolvedValue({
      status: "success",
      collectionId: "c1",
    });
  });

  it("titles itself by kind and locks the collection to exactly this dish", async () => {
    const user = userEvent.setup();
    render(
      <DirectShareSingleItemDialog
        open
        onOpenChange={() => {}}
        dishId="part1"
        dishKind="PART"
        dishTitle="Pizza Dough"
      />,
    );

    expect(screen.getByText("Send this part")).toBeInTheDocument();
    expect(screen.getByText("Pizza Dough")).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Recipient's email"),
      "friend@example.invalid",
    );
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mockSendCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "friend@example.invalid",
        dishIds: ["part1"],
      }),
    );
  });

  it("Review stays disabled until a plausible email is entered — no item selection required", () => {
    render(
      <DirectShareSingleItemDialog
        open
        onOpenChange={() => {}}
        dishId="r1"
        dishKind="RECIPE"
        dishTitle="Grandma's Chili"
      />,
    );

    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });
});
