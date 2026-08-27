import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishDetailActions } from "@/components/domain/dish/dish-detail-actions";

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
}));

async function openExportDialog() {
  const user = userEvent.setup();
  render(
    <DishDetailActions
      dishId="dish1"
      dishTitle="Test Recipe"
      kind="RECIPE"
      stage="ACTIVE"
      currentVersionId="v2"
    />,
  );
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Export" }));
  await waitFor(() =>
    expect(screen.getByRole("combobox")).toHaveTextContent("V2.0 (current)"),
  );
  return user;
}

describe("DishDetailActions — contextual sharing stays single-item", () => {
  it("Send opens a dialog locked to this item, with no searchable item selector", async () => {
    const user = userEvent.setup();
    render(
      <DishDetailActions
        dishId="dish1"
        dishTitle="Grandma's Chili"
        kind="RECIPE"
        stage="ACTIVE"
        currentVersionId="v2"
      />,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Send" }));

    expect(
      await screen.findByRole("heading", { name: "Send this recipe" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Grandma's Chili")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search your items…"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Select all" }),
    ).not.toBeInTheDocument();
  });

  it("Publish stays single-item, offering the fixed/latest version wording", async () => {
    const user = userEvent.setup();
    render(
      <DishDetailActions
        dishId="dish1"
        dishTitle="Grandma's Chili"
        kind="RECIPE"
        stage="ACTIVE"
        currentVersionId="v2"
      />,
    );
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

describe("DishDetailActions overflow menu — Cooking history", () => {
  it("links a Recipe's 'Cooking history' action to its own dedicated history page", async () => {
    const user = userEvent.setup();
    render(
      <DishDetailActions
        dishId="dish1"
        dishTitle="Test Recipe"
        kind="RECIPE"
        stage="ACTIVE"
        currentVersionId="v2"
      />,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));

    const link = await screen.findByRole("menuitem", {
      name: "Cooking history",
    });
    expect(link).toHaveAttribute("href", "/recipes/dish1/history");
  });

  it("also offers a Part's own 'Cooking history' action, distinct from its composition-based history", async () => {
    const user = userEvent.setup();
    render(
      <DishDetailActions
        dishId="part1"
        dishTitle="Test Part"
        kind="PART"
        stage="ACTIVE"
        currentVersionId="v2"
      />,
    );
    await user.click(screen.getByRole("button", { name: "More actions" }));

    const link = await screen.findByRole("menuitem", {
      name: "Cooking history",
    });
    expect(link).toHaveAttribute("href", "/parts/part1/history");
  });
});

// Each privacy-tier row renders its own "Download" link with an identical
// accessible name (no shared aria-label with the tier heading) — the
// dialog always renders them Standard, Detailed, Full private history, in
// that fixed order.
function downloadLinks() {
  return screen.getAllByRole("link", { name: "Download" });
}
function standardDownloadLink() {
  return downloadLinks()[0];
}

describe("DishDetailActions export dialog — Version selection (Slice 11 correction pass)", () => {
  it("defaults to the current Version", async () => {
    await openExportDialog();
    expect(screen.getByRole("combobox")).toHaveTextContent("V2.0 (current)");
    const href = standardDownloadLink().getAttribute("href")!;
    expect(href).toContain("versionMode=SINGLE");
    expect(href).toContain("versionId=v2");
  });

  it("switches to an explicit historical Version", async () => {
    const user = await openExportDialog();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "V1.0" }));

    const href = standardDownloadLink().getAttribute("href")!;
    expect(href).toContain("versionMode=SINGLE");
    expect(href).toContain("versionId=v1");
  });

  it("switches to Include all Versions with no versionId, never both at once", async () => {
    const user = await openExportDialog();
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Include all Versions" }),
    );

    const href = standardDownloadLink().getAttribute("href")!;
    expect(href).toContain("versionMode=ALL");
    expect(href).not.toContain("versionId=");
  });

  it("resets back to the current Version after closing and reopening the dialog", async () => {
    const user = await openExportDialog();
    await user.click(screen.getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Include all Versions" }),
    );
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export" }));

    expect(screen.getByRole("combobox")).toHaveTextContent("V2.0 (current)");
  });

  it("applies the selected Version to every privacy tier's download link", async () => {
    const user = await openExportDialog();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "V1.0" }));

    for (const link of downloadLinks()) {
      expect(link.getAttribute("href")).toContain("versionId=v1");
    }
  });
});
