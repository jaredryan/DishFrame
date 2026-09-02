import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DirectShareSingleItemDialog } from "@/components/domain/sharing/direct-share-single-item-dialog";
import { ToastProvider, Toaster } from "@/components/ui/toast";

const mockSendCollection = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  sendDirectShareCollection: (...args: unknown[]) =>
    mockSendCollection(...args),
}));

const mockListDishVersionOptions = vi.fn();
vi.mock("@/lib/dishes/actions", () => ({
  listDishVersionOptions: (...args: unknown[]) =>
    mockListDishVersionOptions(...args),
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
    mockListDishVersionOptions.mockReset();
    mockListDishVersionOptions.mockResolvedValue({
      status: "success",
      versions: [{ id: "v1", majorVersion: 1, minorVersion: 0 }],
      currentVersionId: "v1",
    });
    mockSendCollection.mockResolvedValue({
      status: "success",
      results: [
        {
          recipientEmail: "friend@example.invalid",
          status: "success",
          collectionId: "c1",
        },
      ],
    });
  });

  it("titles itself by kind and locks the collection to exactly this dish — direct Send, no Review step", async () => {
    const user = userEvent.setup();
    renderDialog({
      dishId: "part1",
      dishVersionId: "v1",
      dishKind: "PART",
      dishTitle: "Pizza Dough",
    });

    expect(screen.getByText("Send this part")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review" }),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Recipients"),
      "friend@example.invalid{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mockSendCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmails: ["friend@example.invalid"],
        items: [{ dishId: "part1", dishVersionId: "v1" }],
      }),
    );
  });

  it("preselects the current Version, and sending after switching Versions sends the exact chosen Version", async () => {
    mockListDishVersionOptions.mockResolvedValue({
      status: "success",
      versions: [
        { id: "v1", majorVersion: 1, minorVersion: 0 },
        { id: "v2", majorVersion: 2, minorVersion: 0 },
      ],
      currentVersionId: "v1",
    });
    const user = userEvent.setup();
    renderDialog({ dishVersionId: "v1" });

    const versionTrigger = await screen.findByRole("combobox");
    await waitFor(() =>
      expect(versionTrigger).toHaveTextContent("V1.0 (current)"),
    );

    await user.click(versionTrigger);
    await user.click(await screen.findByRole("option", { name: "V2.0" }));
    await user.type(
      screen.getByLabelText("Recipients"),
      "friend@example.invalid{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(mockSendCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ dishId: "r1", dishVersionId: "v2" }],
      }),
    );
  });

  it("Send stays disabled until at least one recipient chip is added", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("on success, closes the dialog and shows a success toast instead of a dedicated Sent screen", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange, dishTitle: "Grandma's Chili" });

    await user.type(
      screen.getByLabelText("Recipients"),
      "friend@example.invalid{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(
      await screen.findByText(
        'Sent "Grandma\'s Chili" to friend@example.invalid.',
      ),
    ).toBeInTheDocument();
  });

  it("on operation-level failure, keeps the modal open and shows an error toast", async () => {
    mockSendCollection.mockResolvedValue({
      status: "error",
      message: "Could not send — try again.",
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.type(
      screen.getByLabelText("Recipients"),
      "friend@example.invalid{Enter}",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Could not send — try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });

  it("on a per-recipient failure, keeps only the failed recipient so it can be retried", async () => {
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
          message:
            "One or more selected items have already been shared with that person.",
        },
      ],
    });
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderDialog({ onOpenChange });

    await user.type(
      screen.getByLabelText("Recipients"),
      "ok@example.invalid,bad@example.invalid,",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        "One or more selected items have already been shared with that person.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("bad@example.invalid")).toBeInTheDocument();
    expect(screen.queryByText("ok@example.invalid")).not.toBeInTheDocument();
  });
});
