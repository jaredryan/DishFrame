import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";
import { ToastProvider, Toaster } from "@/components/ui/toast";

function renderActions(props: React.ComponentProps<typeof DishDetailActions>) {
  return render(
    <ToastProvider>
      <DishDetailActions {...props} />
      <Toaster />
    </ToastProvider>,
  );
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const versions = [
  { id: "v1", majorVersion: 1, minorVersion: 0 },
  { id: "v2", majorVersion: 2, minorVersion: 0 },
];

vi.mock("@/lib/dishes/actions", () => ({
  archiveDish: vi.fn(async () => ({ status: "idle" })),
  duplicateDish: vi.fn(async () => ({ status: "idle" })),
  deleteDish: vi.fn(async () => ({ status: "idle" })),
  restoreDish: vi.fn(async () => ({ status: "idle" })),
  // Code-audit fix (2026-08-27, second follow-up): the export dialog's
  // Version list is now fetched on demand (`listExportableDishVersions`)
  // instead of arriving as a prop — this fixture returns both fixture
  // Versions in one page, `hasMore: false`, matching every existing
  // assertion below (which predates the switch to on-demand loading and
  // never exercised "Show earlier versions" pagination).
  listExportableDishVersions: vi.fn(async () => ({
    status: "success",
    versions,
    hasMore: false,
  })),
  listDishVersionOptions: vi.fn(async () => ({
    status: "success",
    versions,
    currentVersionId: "v2",
  })),
}));

function versionCombobox() {
  return screen.getByRole("combobox", { name: "Select a Version" });
}

async function openExportDialog() {
  const user = userEvent.setup();
  renderActions({
    dishId: "dish1",
    dishTitle: "Test Recipe",
    kind: "RECIPE",
    stage: "ACTIVE",
    currentVersionId: "v2",
  });
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Export" }));
  await waitFor(() =>
    expect(versionCombobox()).toHaveTextContent("V2.0 (current)"),
  );
  return user;
}

describe("DishDetailActions — contextual sharing stays single-item", () => {
  it("Send opens a dialog locked to this item, with no searchable item selector", async () => {
    const user = userEvent.setup();
    renderActions({
      dishId: "dish1",
      dishTitle: "Grandma's Chili",
      kind: "RECIPE",
      stage: "ACTIVE",
      currentVersionId: "v2",
    });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Send" }));

    expect(
      await screen.findByRole("heading", { name: "Send this recipe" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Grandma's Chili", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search your items…"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();
  });

  it("Publish stays single-item, offering the fixed/latest version wording", async () => {
    const user = userEvent.setup();
    renderActions({
      dishId: "dish1",
      dishTitle: "Grandma's Chili",
      kind: "RECIPE",
      stage: "ACTIVE",
      currentVersionId: "v2",
    });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Publish" }));

    expect(
      await screen.findByRole("heading", { name: "Publish this recipe" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    expect(
      await screen.findByRole("option", {
        name: "Share a fixed version",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Share latest version" }),
    ).toBeInTheDocument();
  });
});

describe("DishDetailActions — operation failures use a toast, not an inline message", () => {
  it("on Archive failure, keeps the dialog open and shows an error toast", async () => {
    const { archiveDish } = await import("@/lib/dishes/actions");
    vi.mocked(archiveDish).mockResolvedValueOnce({
      status: "error",
      message: "Could not archive — try again.",
    } as never);
    const user = userEvent.setup();
    renderActions({
      dishId: "dish1",
      dishTitle: "Grandma's Chili",
      kind: "RECIPE",
      stage: "ACTIVE",
      currentVersionId: "v2",
    });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(
      await screen.findByText("Could not archive — try again."),
    ).toBeInTheDocument();
    expect(screen.getByText("Archive this recipe?")).toBeInTheDocument();
  });

  it("on Archive success, closes the dialog and shows a success toast (nav/details QA batch item 11)", async () => {
    const { archiveDish } = await import("@/lib/dishes/actions");
    vi.mocked(archiveDish).mockResolvedValueOnce({
      status: "success",
    } as never);
    const user = userEvent.setup();
    renderActions({
      dishId: "dish1",
      dishTitle: "Grandma's Chili",
      kind: "RECIPE",
      stage: "ACTIVE",
      currentVersionId: "v2",
    });
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(
      await screen.findByText('Archived "Grandma\'s Chili".'),
    ).toBeInTheDocument();
    expect(screen.queryByText("Archive this recipe?")).not.toBeInTheDocument();
  });
});

describe("DishDetailActions overflow menu — Cooking history", () => {
  it("links a Recipe's 'Cooking history' action to its own dedicated history page", async () => {
    const user = userEvent.setup();
    renderActions({
      dishId: "dish1",
      dishTitle: "Test Recipe",
      kind: "RECIPE",
      stage: "ACTIVE",
      currentVersionId: "v2",
    });
    await user.click(screen.getByRole("button", { name: "More actions" }));

    const link = await screen.findByRole("menuitem", {
      name: "Cooking history",
    });
    expect(link).toHaveAttribute("href", "/recipes/dish1/history");
  });

  it("also offers a Part's own 'Cooking history' action, distinct from its composition-based history", async () => {
    const user = userEvent.setup();
    renderActions({
      dishId: "part1",
      dishTitle: "Test Part",
      kind: "PART",
      stage: "ACTIVE",
      currentVersionId: "v2",
    });
    await user.click(screen.getByRole("button", { name: "More actions" }));

    const link = await screen.findByRole("menuitem", {
      name: "Cooking history",
    });
    expect(link).toHaveAttribute("href", "/parts/part1/history");
  });
});

// Each privacy-tier row renders its own "Download" button with an identical
// accessible name — the dialog always renders them Standard, Detailed, Full
// private history, in that fixed order.
function downloadButtons() {
  return screen.getAllByRole("button", { name: "Download" });
}
function standardDownloadButton() {
  return downloadButtons()[0];
}

function mockFetchOnce(
  response: Partial<Response> & { ok: boolean },
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => response as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("DishDetailActions export dialog — Version selection (Slice 11 correction pass, nav/details QA batch item 10)", () => {
  it("defaults to the current Version", async () => {
    await openExportDialog();
    expect(versionCombobox()).toHaveTextContent("V2.0 (current)");
  });

  it("switches to an explicit historical Version, hides the picker once scope is Include all Versions", async () => {
    const user = await openExportDialog();
    await user.click(versionCombobox());
    await user.click(await screen.findByRole("option", { name: "V1.0" }));
    expect(versionCombobox()).toHaveTextContent("V1.0");

    await user.click(screen.getByRole("combobox", { name: "Version scope" }));
    await user.click(
      await screen.findByRole("option", { name: "Include all Versions" }),
    );
    expect(
      screen.queryByRole("combobox", { name: "Select a Version" }),
    ).not.toBeInTheDocument();
  });
});

describe("DishDetailActions export dialog — Download (nav/details QA batch item 10)", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.unstubAllGlobals();
  });

  it("fetches the selected Version/tier, closes the dialog, and shows a success toast with the filename", async () => {
    const user = await openExportDialog();
    const fetchMock = mockFetchOnce({
      ok: true,
      headers: {
        get: (key: string) =>
          key === "Content-Disposition"
            ? 'attachment; filename="test-recipe.json"'
            : null,
      } as Headers,
      blob: async () => new Blob(["{}"]),
    });

    await user.click(standardDownloadButton());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("tier=STANDARD");
    expect(requestedUrl).toContain("versionMode=SINGLE");
    expect(requestedUrl).toContain("versionId=v2");

    expect(await screen.findByText("Export downloaded")).toBeInTheDocument();
    expect(screen.getByText("test-recipe.json")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Export this recipe" }),
    ).not.toBeInTheDocument();
  });

  it("prevents a duplicate submission while a download is in flight", async () => {
    await openExportDialog();
    let resolveFetch: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const button = standardDownloadButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch!({
      ok: true,
      headers: { get: () => null } as unknown as Headers,
      blob: async () => new Blob(["{}"]),
    } as Response);
    await screen.findByText("Export downloaded");
  });

  it("omits versionId when the scope is Include all Versions", async () => {
    const user = await openExportDialog();
    await user.click(screen.getByRole("combobox", { name: "Version scope" }));
    await user.click(
      await screen.findByRole("option", { name: "Include all Versions" }),
    );

    const fetchMock = mockFetchOnce({
      ok: true,
      headers: { get: () => null } as unknown as Headers,
      blob: async () => new Blob(["{}"]),
    });

    await user.click(standardDownloadButton());

    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("versionMode=ALL");
    expect(requestedUrl).not.toContain("versionId=");
  });

  it("on failure, shows the error toast and keeps the dialog open and usable", async () => {
    const user = await openExportDialog();
    mockFetchOnce({
      ok: false,
      json: async () => ({ message: "Could not export." }),
    } as never);

    await user.click(standardDownloadButton());

    expect(await screen.findByText("Could not export.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Export this recipe" }),
    ).toBeInTheDocument();
  });
});
