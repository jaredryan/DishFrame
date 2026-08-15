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

    await events.click(
      screen.getByRole("button", { name: "JR, account menu" }),
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("jamie@example.com")).toBeInTheDocument();
  });

  it("signs out and returns to the public site", async () => {
    const events = userEvent.setup();
    render(<AccountMenu user={user} />);

    await events.click(
      screen.getByRole("button", { name: "JR, account menu" }),
    );
    await events.click(await screen.findByText("Sign out"));

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("includes the visible initials in the accessible name (WCAG 2.5.3)", () => {
    render(<AccountMenu user={user} />);

    const trigger = screen.getByRole("button", { name: "JR, account menu" });
    expect(trigger).toHaveTextContent("JR");
  });

  it("stays clickable while its own menu is open — clicking it again closes the menu", async () => {
    const events = userEvent.setup();
    render(<AccountMenu user={user} />);

    const trigger = screen.getByRole("button", { name: "JR, account menu" });
    expect(trigger).toHaveClass("cursor-pointer");

    await events.click(trigger);
    expect(await screen.findByText("Sign out")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("data-state", "open");
    expect(trigger).toHaveClass("cursor-pointer");

    await events.click(trigger);
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
  });

  it("leaves other controls on the page clickable while its menu is open (the traced non-modal bug)", async () => {
    const events = userEvent.setup();
    const onCookClick = vi.fn();
    render(
      <>
        <button type="button" onClick={onCookClick}>
          Cook
        </button>
        <AccountMenu user={user} />
      </>,
    );

    await events.click(
      screen.getByRole("button", { name: "JR, account menu" }),
    );
    expect(await screen.findByText("Sign out")).toBeInTheDocument();

    await events.click(screen.getByRole("button", { name: "Cook" }));
    expect(onCookClick).toHaveBeenCalled();
  });

  describe("sidebar variant", () => {
    it("shows the user's email directly in the trigger row (desktop left-nav placement)", () => {
      render(<AccountMenu user={user} variant="sidebar" />);

      expect(
        screen.getByRole("button", { name: "jamie@example.com" }),
      ).toBeInTheDocument();
    });

    it("opens the same Profile/sign-out menu as the icon trigger", async () => {
      const events = userEvent.setup();
      render(<AccountMenu user={user} variant="sidebar" />);

      await events.click(
        screen.getByRole("button", { name: "jamie@example.com" }),
      );

      expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
      expect(screen.getByText("Profile")).toBeInTheDocument();
      expect(screen.getByText("Sign out")).toBeInTheDocument();
    });

    it("stays clickable while open, and flips its state (driving the chevron from up to down) while open", async () => {
      const events = userEvent.setup();
      render(<AccountMenu user={user} variant="sidebar" />);

      const trigger = screen.getByRole("button", { name: "jamie@example.com" });
      expect(trigger).toHaveClass("cursor-pointer");
      expect(trigger).toHaveAttribute("data-state", "closed");

      await events.click(trigger);
      expect(await screen.findByText("Sign out")).toBeInTheDocument();
      expect(trigger).toHaveAttribute("data-state", "open");
      expect(trigger).toHaveClass("cursor-pointer");

      await events.click(trigger);
      expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    });
  });
});
