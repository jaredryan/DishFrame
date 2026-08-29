import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountDialog } from "@/components/app/delete-account-dialog";
import { ToastProvider, Toaster } from "@/components/ui/toast";

function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <ToastProvider>
        {children}
        <Toaster />
      </ToastProvider>
    ),
  });
}

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

const mockDeleteAccountAction = vi.fn();
vi.mock("@/lib/account/actions", () => ({
  deleteAccountAction: (...args: unknown[]) => mockDeleteAccountAction(...args),
}));

const mockSignOut = vi.fn();
vi.mock("@/lib/auth/client", () => ({
  signOut: () => mockSignOut(),
}));

const EMAIL = "cook@example.invalid";

async function openDialog() {
  const user = userEvent.setup();
  render(<DeleteAccountDialog email={EMAIL} />);
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  return user;
}

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockDeleteAccountAction.mockClear();
    mockSignOut.mockClear();
  });

  it("keeps the destructive action disabled until the exact email is typed", async () => {
    const user = await openDialog();
    const confirmButton = screen.getByRole("button", {
      name: "Delete my account",
    });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Type/), "wrong@example.invalid");
    expect(confirmButton).toBeDisabled();

    await user.clear(screen.getByLabelText(/Type/));
    await user.type(screen.getByLabelText(/Type/), EMAIL);
    expect(confirmButton).toBeEnabled();
  });

  it("signs out and redirects home after a successful deletion", async () => {
    mockDeleteAccountAction.mockResolvedValueOnce({ status: "success" });
    const user = await openDialog();

    await user.type(screen.getByLabelText(/Type/), EMAIL);
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(mockDeleteAccountAction).toHaveBeenCalledWith({
      confirmEmail: EMAIL,
    });
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows a reauthentication prompt instead of deleting when the session isn't fresh", async () => {
    mockDeleteAccountAction.mockResolvedValueOnce({ status: "needs_reauth" });
    const user = await openDialog();

    await user.type(screen.getByLabelText(/Type/), EMAIL);
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(
      await screen.findByText("Sign in again to continue"),
    ).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("surfaces a server-rejected confirmation as an inline error", async () => {
    mockDeleteAccountAction.mockResolvedValueOnce({
      status: "error",
      message: "Type your account email exactly to confirm.",
    });
    const user = await openDialog();

    await user.type(screen.getByLabelText(/Type/), EMAIL);
    await user.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(
      await screen.findByText("Type your account email exactly to confirm."),
    ).toBeInTheDocument();
  });
});
