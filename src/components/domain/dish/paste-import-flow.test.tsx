import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasteImportFlow } from "@/components/domain/dish/paste-import-flow";
import { proposeImportFromPaste } from "@/lib/importExport/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(async () => ({ status: "idle" })),
  editDish: vi.fn(async () => ({ status: "idle" })),
  updateVersionNote: vi.fn(async () => ({ status: "success" })),
  setDefaultScale: vi.fn(async () => ({ status: "success" })),
}));

vi.mock("@/lib/sections/actions", () => ({
  getPartLinkDisplay: vi.fn(),
  getPartLinkPreview: vi.fn(),
  listAttachablePartVersions: vi.fn(async () => ({
    status: "success",
    versions: [],
  })),
  listAttachableParts: vi.fn(async () => ({ status: "success", parts: [] })),
  validatePartAttachment: vi.fn(),
  resolvePartVersionForDetach: vi.fn(),
}));

vi.mock("@/lib/importExport/actions", () => ({
  proposeImportFromPaste: vi.fn(),
  confirmImport: vi.fn(async () => ({ status: "idle" })),
}));

const mockedPropose = vi.mocked(proposeImportFromPaste);

const blankVersionValues = {
  title: "",
  stage: "IDEA" as const,
  cuisine: null,
  description: null,
  yieldQuantity: null,
  yieldUnit: null,
  prepTimeMinutes: null,
  cookTimeMinutes: null,
  difficulty: null,
  imageAssetId: null,
  sections: [
    {
      name: null,
      guidanceNote: null,
      ingredients: [],
      instructions: [],
      partLinks: [],
      position: 0,
    },
  ],
  partLinks: [],
};

describe("PasteImportFlow", () => {
  it("parses pasted text and shows the review editor pre-filled with the proposal", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
      },
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);

    await user.type(
      screen.getByLabelText("Pasted recipe text"),
      "Weeknight Tacos\n1 lb ground beef",
    );
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));

    expect(mockedPropose).toHaveBeenCalledWith(
      "Weeknight Tacos\n1 lb ground beef",
    );
    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Weeknight Tacos")).toBeInTheDocument();
  });

  it("shows a needs-review banner when the parser flags ambiguous lines", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: blankVersionValues,
        needsReviewCount: 2,
      },
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.type(screen.getByLabelText("Pasted recipe text"), "Some text");
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));

    expect(
      await screen.findByText(/2 lines couldn't be confidently structured/),
    ).toBeInTheDocument();
  });

  it("returns to the paste step on Discard and start over", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: { values: blankVersionValues, needsReviewCount: 0 },
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.type(screen.getByLabelText("Pasted recipe text"), "Some text");
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));
    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Discard and start over" }),
    );
    expect(screen.getByLabelText("Pasted recipe text")).toBeInTheDocument();
  });

  it("surfaces a parse error without advancing to review", async () => {
    mockedPropose.mockResolvedValue({
      status: "error",
      message: "Paste some recipe text first.",
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.type(screen.getByLabelText("Pasted recipe text"), "x");
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));

    expect(
      await screen.findByText("Paste some recipe text first."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Review imported recipe"),
    ).not.toBeInTheDocument();
  });
});
