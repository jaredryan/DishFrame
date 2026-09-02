import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareDialog } from "@/components/domain/sharing/share-dialog";
import { ToastProvider, Toaster } from "@/components/ui/toast";

vi.mock("@/lib/sharing/actions", () => ({
  createShareLink: vi.fn(),
}));
vi.mock("@/lib/dishes/actions", () => ({
  listDishVersionOptions: vi.fn(async () => ({
    status: "success",
    versions: [
      { id: "v1", majorVersion: 1, minorVersion: 0 },
      { id: "v2", majorVersion: 2, minorVersion: 0 },
    ],
    currentVersionId: "v2",
  })),
}));

function renderDialog() {
  return render(
    <ToastProvider>
      <ShareDialog
        open
        onOpenChange={vi.fn()}
        dishId="dish1"
        kind="RECIPE"
        currentVersionId="v2"
      />
      <Toaster />
    </ToastProvider>,
  );
}

// Nav/details QA batch item 9.
describe("ShareDialog (Publish)", () => {
  it("defaults to Share latest version, with the Version picker hidden", () => {
    renderDialog();
    expect(screen.getByRole("combobox", { name: "Mode" })).toHaveTextContent(
      "Share latest version",
    );
    expect(
      screen.queryByRole("combobox", { name: "Select a Version" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Version picker only after switching to Share a fixed version", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("combobox", { name: "Mode" }));
    await user.click(
      await screen.findByRole("option", { name: "Share a fixed version" }),
    );

    expect(
      await screen.findByRole("combobox", { name: "Select a Version" }),
    ).toBeInTheDocument();
  });

  it("on success, closes the modal and shows a persistent toast with the public URL — never the raw token", async () => {
    const { createShareLink } = await import("@/lib/sharing/actions");
    vi.mocked(createShareLink).mockResolvedValueOnce({
      status: "success",
      shareLinkId: "internal-id-should-not-appear",
      url: "https://dishframe.app/s/abc123",
    } as never);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ShareDialog
          open
          onOpenChange={onOpenChange}
          dishId="dish1"
          kind="RECIPE"
          currentVersionId="v2"
        />
        <Toaster />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Create link" }));

    expect(await screen.findByText("Published")).toBeInTheDocument();
    expect(
      screen.getByText("https://dishframe.app/s/abc123"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/internal-id-should-not-appear/),
    ).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // No auto-dismiss timer — stays until the user acts on it.
    expect(
      screen.getByRole("button", { name: "Copy link" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
  });
});
