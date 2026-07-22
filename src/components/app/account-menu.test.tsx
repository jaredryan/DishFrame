import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountMenu } from "@/components/app/account-menu";

const push = vi.fn();
const refresh = vi.fn();
const signOut = vi.fn().mockResolvedValue(undefined);

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/auth/client", () => ({
  signOut: (...args: unknown[]) => signOut(...args),
}));

describe("AccountMenu", () => {
  const user = { name: "Jamie Rivera", email: "jamie@example.com" };

  it("shows the signed-in user's name and email", async () => {
    const events = userEvent.setup();
    render(<AccountMenu user={user} />);

    await events.click(screen.getByRole("button", { name: "Account menu" }));

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("jamie@example.com")).toBeInTheDocument();
  });

  it("signs out and returns to the public site", async () => {
    const events = userEvent.setup();
    render(<AccountMenu user={user} />);

    await events.click(screen.getByRole("button", { name: "Account menu" }));
    await events.click(await screen.findByText("Sign out"));

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });
});
