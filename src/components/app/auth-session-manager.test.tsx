import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthSessionManager } from "@/components/app/auth-session-manager";
import type { AuthSessionSummary } from "@/lib/account/service";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const mockRevoke = vi.fn();
const mockRevokeOthers = vi.fn();
vi.mock("@/lib/account/actions", () => ({
  revokeAuthSessionAction: (...args: unknown[]) => mockRevoke(...args),
  revokeOtherAuthSessionsAction: (...args: unknown[]) =>
    mockRevokeOthers(...args),
}));

const SESSIONS: AuthSessionSummary[] = [
  {
    id: "current",
    isCurrent: true,
    description: "Chrome on macOS",
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  },
  {
    id: "other",
    isCurrent: false,
    description: "Safari on iOS",
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  },
];

describe("AuthSessionManager", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockRevoke.mockClear();
    mockRevokeOthers.mockClear();
  });

  it("marks the current session and only offers Sign out for other sessions", () => {
    render(<AuthSessionManager sessions={SESSIONS} />);
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("revokes a specific other session and refreshes", async () => {
    mockRevoke.mockResolvedValueOnce({ status: "success" });
    const user = userEvent.setup();
    render(<AuthSessionManager sessions={SESSIONS} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(mockRevoke).toHaveBeenCalledWith({ sessionId: "other" });
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("revokes every other session at once", async () => {
    mockRevokeOthers.mockResolvedValueOnce({ status: "success" });
    const user = userEvent.setup();
    render(<AuthSessionManager sessions={SESSIONS} />);

    await user.click(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    );

    expect(mockRevokeOthers).toHaveBeenCalled();
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it("surfaces a revoke failure inline", async () => {
    mockRevoke.mockResolvedValueOnce({
      status: "error",
      message: "That session isn't available to revoke.",
    });
    const user = userEvent.setup();
    render(<AuthSessionManager sessions={SESSIONS} />);

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByText("That session isn't available to revoke."),
    ).toBeInTheDocument();
  });
});
