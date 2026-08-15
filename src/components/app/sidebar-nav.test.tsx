import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SidebarNav } from "@/components/app/sidebar-nav";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/home",
}));

vi.mock("@/lib/auth/client", () => ({
  signOut: vi.fn(),
}));

const user = { name: "Jamie Rivera", email: "jamie@example.com" };

/**
 * Post-cook review + Cooking history refinement item 2: the desktop
 * account trigger moves out of the header and into the bottom of the left
 * nav, reusing `AccountMenu`'s existing behavior rather than a second
 * account UI.
 */
describe("SidebarNav", () => {
  it("renders the primary nav links plus an account row at the bottom, after every nav link in document order", () => {
    const { container } = render(<SidebarNav user={user} />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Home/ })).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "jamie@example.com" }),
    ).toBeInTheDocument();

    // The account row sits after the primary nav in the DOM (bottom of the
    // sidebar), not interleaved with or before it.
    const text = container.textContent ?? "";
    expect(text.indexOf("Help")).toBeLessThan(
      text.indexOf("jamie@example.com"),
    );
  });

  it("clicking the account row opens the existing Profile/sign-out menu", async () => {
    const events = userEvent.setup();
    render(<SidebarNav user={user} />);

    await events.click(
      screen.getByRole("button", { name: "jamie@example.com" }),
    );

    expect(await screen.findByText("Jamie Rivera")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });
});
