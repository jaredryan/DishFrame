import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareMenuButton } from "@/components/domain/sharing/share-menu-button";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const mockListShareableItems = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  listShareableItemsForSender: (...args: unknown[]) =>
    mockListShareableItems(...args),
  sendDirectShareCollection: vi.fn(),
  publishDishes: vi.fn(),
}));

describe("ShareMenuButton", () => {
  it("opens a dropdown exposing Send and Publish, and opens the generalized Send flow", async () => {
    mockListShareableItems.mockResolvedValue({ status: "success", items: [] });
    const user = userEvent.setup();
    render(<ShareMenuButton />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("menuitem", { name: "Send" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Publish" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: "Send" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Send" })).toBeInTheDocument(),
    );
  });

  it("opens the generalized Publish flow, starting on item selection", async () => {
    mockListShareableItems.mockResolvedValue({ status: "success", items: [] });
    const user = userEvent.setup();
    render(<ShareMenuButton />);

    await user.click(screen.getByRole("button", { name: "Share" }));
    await user.click(screen.getByRole("menuitem", { name: "Publish" }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Publish" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Choose which Recipes and Parts to publish."),
    ).toBeInTheDocument();
  });
});
