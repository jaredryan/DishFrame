import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareSingleItemDialog } from "@/components/domain/sharing/direct-share-single-item-dialog";
import { ToastProvider, Toaster } from "@/components/ui/toast";

const mockSendCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
}));

function renderDialog(
  props: {
    onOpenChange?: (open: boolean) => void;
    dishId?: string;
    dishVersionId?: string;
    dishKind?: "RECIPE" | "PART";
    dishTitle?: string;
  } = {},
) {
  return render(
    <ToastProvider>
      <DirectShareSingleItemDialog
        open
        onOpenChange={props.onOpenChange ?? (() => {})}
        dishId={props.dishId ?? "r1"}
        dishVersionId={props.dishVersionId ?? "v1"}
        dishKind={props.dishKind ?? "RECIPE"}
        dishTitle={props.dishTitle ?? "Grandma's Chili"}
      />
      <Toaster />
    </ToastProvider>,
  );
}

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
    renderDialog({
      dishId: "part1",
      dishVersionId: "v1",
      dishKind: "PART",
      dishTitle: "Pizza Dough",
    });

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
        items: [{ dishId: "part1", dishVersionId: "v1" }],
      }),
    );
  });

  it("Review stays disabled until a plausible email is entered — no item selection required", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Review" })).toBeDisabled();
  });

  it("on success, closes the dialog and shows a success toast instead of a dedicated Sent screen", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange, dishTitle: "Grandma's Chili" });

    await user.type(
      screen.getByLabelText("Recipient's email"),
      "friend@example.invalid",
    );
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText(
        'Sent "Grandma\'s Chili" to friend@example.invalid.',
      ),
    ).toBeInTheDocument();
  });

  it("on failure, keeps the Send modal open on the review step and shows an error toast", async () => {
    mockSendCollection.mockResolvedValue({
      status: "error",
      message: "Could not send — try again.",
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.type(
      screen.getByLabelText("Recipient's email"),
      "friend@example.invalid",
    );
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Could not send — try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});
