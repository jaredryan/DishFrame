import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasteImportFlow } from "@/components/domain/dish/paste-import-flow";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import {
  proposeImportFromPaste,
  proposeImportFromUrl,
  confirmImport,
  confirmImportBatch,
} from "@/lib/importExport/actions";
import { extractRecipesFromArchiveFile } from "@/lib/importExport/file-sources";

const push = vi.fn();

// PasteImportFlow renders DishEditor, which renders CoachMark — requires an
// ancestor OnboardingProvider (useOnboarding() throws without one). The
// batch/single-import completion paths also call `useToast()`, which throws
// without an ancestor ToastProvider — `<Toaster />` is included so toast
// text is queryable from the DOM.
function render(ui: ReactElement) {
  return rtlRender(
    <>
      {ui}
      <Toaster />
    </>,
    {
      wrapper: ({ children }) => (
        <OnboardingProvider initialState={{}}>
          <ToastProvider>{children}</ToastProvider>
        </OnboardingProvider>
      ),
    },
  );
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
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
  proposeImportFromUrl: vi.fn(),
  confirmImport: vi.fn(async () => ({ status: "idle" })),
  confirmImportBatch: vi.fn(async () => []),
}));

// Archive extraction (.rga) runs entirely client-side now — no Server
// Action to mock — but it's still not real archive bytes in these
// component tests (that's recipe-gallery-import.test.ts's job); only
// `extractRecipesFromArchiveFile` is mocked, so `.md`/`.txt` extraction
// (`extractTextFromImportFile`) stays real, exercising actual `File.text()`
// reads in jsdom.
vi.mock("@/lib/importExport/file-sources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/importExport/file-sources")>();
  return { ...actual, extractRecipesFromArchiveFile: vi.fn() };
});

const mockedPropose = vi.mocked(proposeImportFromPaste);
const mockedProposeFromUrl = vi.mocked(proposeImportFromUrl);
const mockedExtractArchive = vi.mocked(extractRecipesFromArchiveFile);
const mockedConfirmImport = vi.mocked(confirmImport);
const mockedConfirmImportBatch = vi.mocked(confirmImportBatch);

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

// Has real content (one ingredient), unlike `blankVersionValues` — needed
// for any test that actually clicks the review editor's Save button, since
// `hasMinimumContent` blocks an empty draft from saving.
const filledVersionValues = {
  ...blankVersionValues,
  sections: [
    {
      name: null,
      guidanceNote: null,
      position: 0,
      ingredients: [
        {
          name: "Ground beef",
          quantity: 1,
          quantityEnd: null,
          isApproximate: false,
          unit: "lb",
          displayText: null,
          preparationNote: null,
          isOptional: false,
          substitute: null,
        },
      ],
      instructions: [],
      partLinks: [],
    },
  ],
};

describe("PasteImportFlow", () => {
  beforeEach(() => {
    push.mockClear();
    mockedConfirmImport.mockClear();
    mockedConfirmImportBatch.mockClear();
  });

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

  it("Save on a single-item import opens the Recipe/Part choice dialog; Save as recipe persists via confirmImport", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...filledVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
      },
    });
    mockedConfirmImport.mockResolvedValue({ status: "success", dishId: "d1" });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.type(
      screen.getByLabelText("Pasted recipe text"),
      "Weeknight Tacos\n1 lb ground beef",
    );
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));
    await screen.findByText("Review imported recipe");

    await user.click(screen.getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/How would you like to save it/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save as recipe" }));

    expect(mockedConfirmImport).toHaveBeenCalledWith(
      "RECIPE",
      expect.objectContaining({ title: "Weeknight Tacos" }),
      undefined,
    );
  });

  it("Cancel on the Save dialog closes it without losing edits", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...filledVersionValues, title: "Weeknight Tacos" },
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
    await screen.findByText("Review imported recipe");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Still on the review editor, edits (the pre-filled title) intact.
    expect(screen.getByDisplayValue("Weeknight Tacos")).toBeInTheDocument();
    expect(mockedConfirmImport).not.toHaveBeenCalled();
  });

  it("Save as Part persists via confirmImport with PART", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...filledVersionValues, title: "Marinara Sauce" },
        needsReviewCount: 0,
      },
    });
    mockedConfirmImport.mockResolvedValue({ status: "success", dishId: "p1" });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.type(
      screen.getByLabelText("Pasted recipe text"),
      "Marinara Sauce\n1 can tomatoes",
    );
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));
    await screen.findByText("Review imported recipe");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Save as Part" }));

    expect(mockedConfirmImport).toHaveBeenCalledWith(
      "PART",
      expect.objectContaining({ title: "Marinara Sauce" }),
      undefined,
    );
  });

  it("extracts text from an uploaded .md file and shows the review editor", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
      },
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));

    const file = new File(["Weeknight Tacos\n1 lb ground beef"], "tacos.md", {
      type: "text/markdown",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);

    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();
    expect(mockedPropose).toHaveBeenCalledWith(
      "Weeknight Tacos\n1 lb ground beef",
    );
  });

  it("imports from a website URL and shows the review editor", async () => {
    mockedProposeFromUrl.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Site Recipe" },
        needsReviewCount: 0,
      },
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Import from website" }));
    await user.type(
      screen.getByLabelText("Recipe URL"),
      "https://example.com/recipe",
    );
    await user.click(
      screen.getByRole("button", { name: "Import from website" }),
    );

    expect(mockedProposeFromUrl).toHaveBeenCalledWith(
      "https://example.com/recipe",
    );
    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();
  });

  it("surfaces a website import error without advancing to review", async () => {
    mockedProposeFromUrl.mockResolvedValue({
      status: "error",
      message: "Couldn't find a recipe on that page.",
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Import from website" }));
    await user.type(
      screen.getByLabelText("Recipe URL"),
      "https://example.com/recipe",
    );
    await user.click(
      screen.getByRole("button", { name: "Import from website" }),
    );

    expect(
      await screen.findByText("Couldn't find a recipe on that page."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Review imported recipe"),
    ).not.toBeInTheDocument();
  });

  it("uploading a .rga file shows the batch recipe list, with error rows unselectable", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Vegetables",
          result: {
            values: { ...blankVersionValues, title: "Baked Potatoes" },
            needsReviewCount: 0,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Soup" },
            needsReviewCount: 1,
          },
        },
        {
          status: "error",
          sourceRef: "CCC.rgr",
          message: "Couldn't read this recipe's data.",
        },
      ],
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));

    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);

    expect(await screen.findByText("3 recipes found")).toBeInTheDocument();
    expect(screen.getByText("Baked Potatoes")).toBeInTheDocument();
    expect(screen.getByText("Soup")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByText("Couldn't be read")).toBeInTheDocument();
    // Recipe Gallery Category surfaced as a non-persisted hint.
    expect(screen.getByText("Vegetables")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    // Both "ok" drafts default-selected, the error draft is disabled.
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(checkboxes[2]).toBeDisabled();

    // Every "ok" row defaults to Recipe.
    expect(screen.getByText("2 Recipes")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 2 recipes" }),
    ).toBeInTheDocument();
  });

  it("lets a row be reclassified as a Part, reflected in the counts and the bulk call", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Baked Potatoes" },
            needsReviewCount: 0,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Marinara Sauce" },
            needsReviewCount: 0,
          },
        },
      ],
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
      { sourceRef: "BBB.rgr", status: "success", dishId: "d2" },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("2 recipes found");

    await user.click(
      within(
        screen.getByRole("radiogroup", { name: 'Save "Marinara Sauce" as' }),
      ).getByRole("radio", { name: "Part" }),
    );

    expect(screen.getByText("1 Recipe · 1 Part")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 2 items" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import 2 items" }));

    expect(mockedConfirmImportBatch).toHaveBeenCalledTimes(1);
    expect(mockedConfirmImportBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceRef: "AAA.rgr",
        kind: "RECIPE",
        sourceLabel: expect.stringContaining("Baked Potatoes"),
      }),
      expect.objectContaining({
        sourceRef: "BBB.rgr",
        kind: "PART",
        sourceLabel: expect.stringContaining("Marinara Sauce"),
      }),
    ]);
    expect(
      await screen.findByText(/Imported 1 Recipe and 1 Part/),
    ).toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/recipes");
  });

  it("reviewing a batch row updates the pending draft and returns to the list without persisting", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: null,
          result: {
            values: { ...filledVersionValues, title: "Baked Potatoes" },
            needsReviewCount: 0,
          },
        },
      ],
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 recipe found");

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();

    const titleInput = screen.getByLabelText("Recipe title");
    await user.clear(titleInput);
    await user.type(titleInput, "Crispy Baked Potatoes");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Back on the batch list, with the edit retained — no dialog, no
    // network create call.
    expect(
      await screen.findByText("Crispy Baked Potatoes"),
    ).toBeInTheDocument();
    expect(mockedConfirmImport).not.toHaveBeenCalled();
    expect(mockedConfirmImportBatch).not.toHaveBeenCalled();
  });

  it("shows a partial-failure summary without navigating away", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Baked Potatoes" },
            needsReviewCount: 0,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Soup" },
            needsReviewCount: 0,
          },
        },
      ],
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
      { sourceRef: "BBB.rgr", status: "error", message: "Could not save." },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("2 recipes found");

    await user.click(screen.getByRole("button", { name: "Import 2 recipes" }));

    expect(
      await screen.findByText("1 imported, 1 failed."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to Recipes" }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalledWith("/recipes");
  });

  it("surfaces an archive import error without showing a recipe list", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "error",
      message:
        "That file doesn't look like a valid Recipe Gallery export (.rga).",
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["not a zip"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);

    expect(
      await screen.findByText(
        "That file doesn't look like a valid Recipe Gallery export (.rga).",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/recipes found/)).not.toBeInTheDocument();
  });
});
