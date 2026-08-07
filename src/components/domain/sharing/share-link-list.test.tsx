import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShareLinkList } from "@/components/domain/sharing/share-link-list";
import type { ShareLinkSummary } from "@/components/domain/sharing/share-link-list";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockRevoke = vi.fn();
const mockRegenerate = vi.fn();
const mockUpdateSettings = vi.fn();
vi.mock("@/lib/sharing/actions", () => ({
  revokeShareLink: (...args: unknown[]) => mockRevoke(...args),
  regenerateShareLink: (...args: unknown[]) => mockRegenerate(...args),
  updateShareLinkSettings: (...args: unknown[]) => mockUpdateSettings(...args),
}));

const ACTIVE: ShareLinkSummary = {
  id: "link-1",
  mode: "FIXED_SNAPSHOT",
  dishTitleSnapshot: "Ramen",
  url: "https://dishframe.test/s/abc.def",
  revokedAt: null,
  expiresAt: null,
  showCreatorName: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ShareLinkList", () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockRevoke.mockReset();
    mockRegenerate.mockReset();
    mockUpdateSettings.mockReset();
  });

  it("displays the complete public URL, and copies that full URL", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ShareLinkList shareLinks={[ACTIVE]} />);
    expect(
      screen.getByText("https://dishframe.test/s/abc.def"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://dishframe.test/s/abc.def");
  });

  it("uses the humanized mode terminology and 'Show my name on shared page'", () => {
    render(
      <ShareLinkList
        shareLinks={[ACTIVE, { ...ACTIVE, id: "link-2", mode: "CURRENT" }]}
      />,
    );
    expect(screen.getByText("Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Always up to date")).toBeInTheDocument();
    expect(screen.getAllByText("Show my name on shared page")).toHaveLength(2);
  });

  it("labels a revoked link Disabled and offers Replace link but not Disable link", () => {
    render(
      <ShareLinkList
        shareLinks={[{ ...ACTIVE, revokedAt: "2026-01-05T00:00:00.000Z" }]}
      />,
    );
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Replace link" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable link" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the Expired label, hides Disable link, and offers Replace link that regenerates and refreshes", async () => {
    const user = userEvent.setup();
    mockRegenerate.mockResolvedValue({
      status: "success",
      url: "https://dishframe.test/s/new.token",
    });
    render(
      <ShareLinkList
        shareLinks={[{ ...ACTIVE, expiresAt: "2020-01-01T00:00:00.000Z" }]}
      />,
    );
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable link" }),
    ).not.toBeInTheDocument();

    const replaceButton = screen.getByRole("button", { name: "Replace link" });
    await user.click(replaceButton);
    expect(mockRegenerate).toHaveBeenCalledWith({ shareLinkId: "link-1" });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("renames Regenerate/Revoke to Replace link/Disable link on an active link", () => {
    render(<ShareLinkList shareLinks={[ACTIVE]} />);
    expect(
      screen.getByRole("button", { name: "Replace link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disable link" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Regenerate")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoke")).not.toBeInTheDocument();
  });
});
