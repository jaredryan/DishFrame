import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders title, description, and calls onConfirm from the confirm button", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChangeAction={() => {}}
        title="Delete this?"
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        onConfirmAction={onConfirm}
      />,
    );
    expect(screen.getByText("Delete this?")).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("Cancel calls onOpenChange(false) without calling onConfirm", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChangeAction={onOpenChange}
        title="Archive this?"
        onConfirmAction={onConfirm}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows loading on the confirm button and disables Cancel while pending", () => {
    render(
      <ConfirmDialog
        open
        onOpenChangeAction={() => {}}
        title="Delete this?"
        confirmLabel="Delete"
        loading
        onConfirmAction={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows an inline error between the description and the footer", () => {
    render(
      <ConfirmDialog
        open
        onOpenChangeAction={() => {}}
        title="Delete this?"
        error="Could not delete."
        onConfirmAction={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not delete.");
  });
});
