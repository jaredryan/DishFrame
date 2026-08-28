import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReceivedShareNotifier } from "@/components/domain/sharing/received-share-notifier";
import { ToastProvider, Toaster } from "@/components/ui/toast";

let mockPathname = "/home";
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
}));

const mockAcknowledge = vi.fn();
vi.mock("@/lib/preferences/actions", () => ({
  acknowledgeShareNotifications: (...args: unknown[]) =>
    mockAcknowledge(...args),
}));

function renderNotifier(newShareCount: number) {
  return render(
    <ToastProvider>
      <ReceivedShareNotifier newShareCount={newShareCount} />
      <Toaster />
    </ToastProvider>,
  );
}

describe("ReceivedShareNotifier", () => {
  beforeEach(() => {
    mockPathname = "/home";
    mockPush.mockClear();
    mockAcknowledge.mockReset();
    mockAcknowledge.mockResolvedValue({ status: "success" });
  });

  it("shows a consolidated toast on a main page when there are new shares", async () => {
    renderNotifier(3);
    expect(
      await screen.findByText("You have 3 new shared recipes"),
    ).toBeInTheDocument();
  });

  it("does not show a toast when there are no new shares", () => {
    renderNotifier(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not interrupt a nested creation/editing/import flow", () => {
    mockPathname = "/recipes/new";
    renderNotifier(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not show a toast while already on the Share page", () => {
    mockPathname = "/share";
    renderNotifier(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("acknowledges (and never shows again) once explicitly dismissed", async () => {
    const user = userEvent.setup();
    renderNotifier(1);
    await screen.findByText("You have a new shared recipe");

    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );
  });

  it("following the action link also acknowledges and navigates to Share's Received section", async () => {
    const user = userEvent.setup();
    renderNotifier(1);
    await screen.findByText("You have a new shared recipe");

    await user.click(
      screen.getByRole("button", { name: "View received shares" }),
    );

    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/share#received");
  });
});
