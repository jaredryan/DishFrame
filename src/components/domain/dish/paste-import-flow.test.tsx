import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import { createTag } from "@/lib/tags/actions";
import { createFlavorProfile } from "@/lib/flavor-profiles/actions";
import { createCuisine } from "@/lib/cuisines/actions";

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

vi.mock("@/lib/importExport/actions", () => ({
  proposeImportFromPaste: vi.fn(),
  proposeImportFromUrl: vi.fn(),
  confirmImport: vi.fn(async () => ({ status: "idle" })),
  confirmImportBatch: vi.fn(async () => []),
}));

// Source-metadata mapping (task §5) creates Tags/Flavor profiles/Cuisines
// through these exact Settings actions — mocked here so a "Create new"
// mapping resolves deterministically without hitting a real database.
vi.mock("@/lib/tags/actions", () => ({
  createTag: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("@/lib/flavor-profiles/actions", () => ({
  createFlavorProfile: vi.fn(async () => ({ status: "idle" })),
}));
vi.mock("@/lib/cuisines/actions", () => ({
  createCuisine: vi.fn(async () => ({ status: "idle" })),
}));

const mockedPropose = vi.mocked(proposeImportFromPaste);
const mockedProposeFromUrl = vi.mocked(proposeImportFromUrl);
const mockedExtractArchive = vi.mocked(extractRecipesFromArchiveFile);
const mockedConfirmImport = vi.mocked(confirmImport);
const mockedConfirmImportBatch = vi.mocked(confirmImportBatch);
const mockedCreateTag = vi.mocked(createTag);
const mockedCreateFlavorProfile = vi.mocked(createFlavorProfile);
const mockedCreateCuisine = vi.mocked(createCuisine);

const blankVersionValues = {
  title: "",
  stage: "IDEA" as const,
  cuisineIds: [],
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
    mockedCreateTag.mockClear();
    mockedCreateFlavorProfile.mockClear();
    mockedCreateCuisine.mockClear();
  });

  it("parses pasted text and shows the review editor pre-filled with the proposal", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
        cuisineGuess: null,
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
        cuisineGuess: null,
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

  it("returns to the paste step on Discard import", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: blankVersionValues,
        needsReviewCount: 0,
        cuisineGuess: null,
      },
    });

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.type(screen.getByLabelText("Pasted recipe text"), "Some text");
    await user.click(screen.getByRole("button", { name: "Parse recipe" }));
    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard import" }));
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
        cuisineGuess: null,
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
      null,
    );
    // Task §14: once persistence reports success, the expected
    // post-success navigation completes exactly once — no duplicate save,
    // no missing/duplicate navigation.
    expect(mockedConfirmImport).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/recipes/d1");
  });

  it("Cancel on the Save dialog closes it without losing edits", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...filledVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
        cuisineGuess: null,
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
        cuisineGuess: null,
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
      null,
    );
  });

  it("drags a file onto the drop zone and shows the review editor", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
        cuisineGuess: null,
      },
    });

    render(<PasteImportFlow cuisineOptions={[]} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Upload file" }));

    const file = new File(["Weeknight Tacos\n1 lb ground beef"], "tacos.md", {
      type: "text/markdown",
    });
    const dropzone = screen.getByRole("button", {
      name: /Drop a recipe file here/,
    });
    const dataTransfer = { files: [file] };

    dropzone.dispatchEvent(
      Object.assign(new Event("drop", { bubbles: true, cancelable: true }), {
        dataTransfer,
      }),
    );

    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();
    expect(mockedPropose).toHaveBeenCalledWith(
      "Weeknight Tacos\n1 lb ground beef",
    );
  });

  it("extracts text from an uploaded .md file (via the picker) and shows the review editor", async () => {
    mockedPropose.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Weeknight Tacos" },
        needsReviewCount: 0,
        cuisineGuess: null,
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

  // Task §1: DishFrame's own Recipe/Part JSON export round-trips through
  // Import — the real (unmocked) `extractDishFromJsonFile` normalizer
  // routes it into the same batch review list `.rga` uses.
  it("uploads DishFrame's own JSON export and shows it in the batch review list", async () => {
    const exportJson = {
      format: "dishframe.dish-export",
      formatVersion: 2,
      kind: "RECIPE",
      title: "Weeknight Tacos",
      stage: "IDEA",
      cuisine: null,
      tags: [],
      flavorProfiles: [],
      versions: [
        {
          title: "Weeknight Tacos",
          sections: [
            {
              ingredients: [{ name: "Ground beef" }],
              instructions: [{ text: "Brown it." }],
            },
          ],
        },
      ],
    };

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));

    const file = new File(
      [JSON.stringify(exportJson)],
      "weeknight-tacos.json",
      { type: "application/json" },
    );
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);

    expect(await screen.findByText("1 ready to import")).toBeInTheDocument();
    expect(screen.getByText("Weeknight Tacos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Import 1 recipe" }),
    ).toBeInTheDocument();
  });

  // Follow-up: DishFrame JSON linked Parts are intentionally dropped (not
  // reconnected) — this must be surfaced before the user commits the
  // import, and again on a successful result.
  it("surfaces dropped linked Parts before commit (Needs review) and again on a successful result", async () => {
    const exportJson = {
      format: "dishframe.dish-export",
      formatVersion: 2,
      kind: "RECIPE",
      title: "Weeknight Tacos",
      stage: "IDEA",
      cuisine: null,
      tags: [],
      flavorProfiles: [],
      versions: [
        {
          title: "Weeknight Tacos",
          sections: [
            {
              ingredients: [{ name: "Ground beef" }],
              instructions: [{ text: "Brown it." }],
            },
          ],
          topLevelLinkedParts: [
            { targetDishId: "part-1", targetDishVersionId: "v1" },
          ],
        },
      ],
    };
    mockedConfirmImportBatch.mockResolvedValue([
      {
        sourceRef: "dishframe-json:Weeknight Tacos",
        status: "success",
        dishId: "d1",
      },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(
      [JSON.stringify(exportJson)],
      "weeknight-tacos.json",
      { type: "application/json" },
    );
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);

    expect(
      await screen.findByText("1 ready to import (1 need review)"),
    ).toBeInTheDocument();
    const needsReviewSection = screen
      .getByRole("heading", { name: "Needs review" })
      .closest("section")!;
    expect(
      within(needsReviewSection).getByText(
        /linked Parts won't be restored — reconnect them manually after import/,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    expect(
      await screen.findByText("1 recipe was imported."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /linked Parts weren't restored — reconnect them manually/,
      ),
    ).toBeInTheDocument();
  });

  it("imports from a website URL and shows the review editor", async () => {
    mockedProposeFromUrl.mockResolvedValue({
      status: "success",
      result: {
        values: { ...blankVersionValues, title: "Site Recipe" },
        needsReviewCount: 0,
        cuisineGuess: null,
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

  it("uploading a .rga file groups rows into Needs review / Ready to import, with error rows unselectable", async () => {
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
            cuisineGuess: null,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Soup" },
            needsReviewCount: 1,
            cuisineGuess: null,
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

    expect(
      await screen.findByText("2 ready to import (1 need review)"),
    ).toBeInTheDocument();

    const needsReviewSection = screen
      .getByRole("heading", { name: "Needs review" })
      .closest("section")!;
    const readySection = screen
      .getByRole("heading", { name: "Ready to import" })
      .closest("section")!;
    expect(within(needsReviewSection).getByText("Soup")).toBeInTheDocument();
    expect(
      within(needsReviewSection).getByText("Couldn't be read"),
    ).toBeInTheDocument();
    expect(
      within(readySection).getByText("Baked Potatoes"),
    ).toBeInTheDocument();
    // Recipe Gallery Category surfaced as a non-persisted hint.
    expect(within(readySection).getByText("Vegetables")).toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    // Both "ok" drafts default-selected, the error draft is disabled.
    expect(
      checkboxes.filter((box) => box.getAttribute("aria-checked") === "true"),
    ).toHaveLength(2);
    expect(checkboxes.some((box) => box.hasAttribute("disabled"))).toBe(true);

    // Every "ok" row defaults to Recipe, both default-selected.
    expect(screen.getByText("2 / 2 selected")).toBeInTheDocument();
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
            cuisineGuess: null,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Marinara Sauce" },
            needsReviewCount: 0,
            cuisineGuess: null,
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
    await screen.findByText("2 ready to import");

    await user.click(
      within(
        screen.getByRole("radiogroup", { name: 'Save "Marinara Sauce" as' }),
      ).getByRole("radio", { name: "Part" }),
    );

    expect(
      screen.getByRole("button", { name: "Import 2 items" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Import 2 items" }));

    expect(
      await screen.findByText("1 recipe and 1 part were imported."),
    ).toBeInTheDocument();
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
      screen.getByRole("heading", { name: "Successfully imported" }),
    ).toBeInTheDocument();
    // The Results screen is the landing point — no auto-navigation away.
    expect(push).not.toHaveBeenCalled();
  });

  it("reviewing a batch row updates the pending draft and returns to the list via Finish review, without persisting", async () => {
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
            cuisineGuess: null,
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
    await screen.findByText("1 ready to import");

    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(
      await screen.findByText("Review imported recipe"),
    ).toBeInTheDocument();
    // Task §6: the batch-review top nav reads "Back to import list", not
    // "Discard and start over".
    expect(
      screen.getByRole("button", { name: "Back to import list" }),
    ).toBeInTheDocument();

    const titleInput = screen.getByLabelText("Recipe title");
    await user.clear(titleInput);
    await user.type(titleInput, "Crispy Baked Potatoes");
    // Task §7: "Save" reads "Finish review" in this context.
    await user.click(screen.getByRole("button", { name: "Finish review" }));

    // Back on the batch list, with the edit retained — no dialog, no
    // network create call.
    expect(
      await screen.findByText("Crispy Baked Potatoes"),
    ).toBeInTheDocument();
    expect(mockedConfirmImport).not.toHaveBeenCalled();
    expect(mockedConfirmImportBatch).not.toHaveBeenCalled();
  });

  it("Cancel in batch Review discards the current edits and returns to the import list", async () => {
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
            cuisineGuess: null,
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
    await screen.findByText("1 ready to import");

    await user.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByText("Review imported recipe");

    const titleInput = screen.getByLabelText("Recipe title");
    await user.clear(titleInput);
    await user.type(titleInput, "Discarded Title");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Back on the batch list — the original title, not the discarded edit.
    expect(await screen.findByText("Baked Potatoes")).toBeInTheDocument();
    expect(screen.queryByText("Discarded Title")).not.toBeInTheDocument();
  });

  it("Discard import confirms before discarding once a draft was reviewed, and preserves work on Keep editing", async () => {
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
            cuisineGuess: null,
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
    await screen.findByText("1 ready to import");

    // Reclassifying a row counts as pending work worth confirming about.
    await user.click(
      within(
        screen.getByRole("radiogroup", { name: 'Save "Baked Potatoes" as' }),
      ).getByRole("radio", { name: "Part" }),
    );

    await user.click(screen.getByRole("button", { name: "Discard import" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/Discard this import\?/),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Still on the list — nothing was thrown away.
    expect(screen.getByText("Baked Potatoes")).toBeInTheDocument();
  });

  it("shows a partial-failure summary in the redesigned Results/Failed sections without navigating away", async () => {
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
            cuisineGuess: null,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Soup" },
            needsReviewCount: 0,
            cuisineGuess: null,
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
    await screen.findByText("2 ready to import");

    await user.click(screen.getByRole("button", { name: "Import 2 recipes" }));

    expect(
      await screen.findByText(
        "1 recipe was imported. 1 item failed to import.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Failed to import" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Could not save.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Successfully imported" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Go to recipes" }),
    ).not.toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });

  it("Retry failed imports moves a successful retry into Successfully imported and leaves remaining failures in place", async () => {
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
            cuisineGuess: null,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Soup" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedConfirmImportBatch.mockResolvedValueOnce([
      { sourceRef: "AAA.rgr", status: "error", message: "Could not save." },
      { sourceRef: "BBB.rgr", status: "error", message: "Could not save." },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("2 ready to import");
    await user.click(screen.getByRole("button", { name: "Import 2 recipes" }));
    await screen.findByText("Nothing was imported. 2 items failed to import.");

    mockedConfirmImportBatch.mockResolvedValueOnce([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
      { sourceRef: "BBB.rgr", status: "error", message: "Still broken." },
    ]);
    await user.click(
      screen.getByRole("button", { name: "Retry failed imports" }),
    );

    expect(
      await screen.findByText(
        "1 recipe was imported. 1 item failed to import.",
      ),
    ).toBeInTheDocument();
    const addedSection = screen
      .getByRole("heading", { name: "Successfully imported" })
      .closest("section")!;
    expect(
      within(addedSection).getByText("Baked Potatoes"),
    ).toBeInTheDocument();
    const failedSection = screen
      .getByRole("heading", { name: "Failed to import" })
      .closest("section")!;
    expect(within(failedSection).getByText("Soup")).toBeInTheDocument();
    expect(
      within(failedSection).getByText("Still broken."),
    ).toBeInTheDocument();
  });

  it("maps a source category to an existing Tag and applies it to the bulk-import payload", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Desserts",
          result: {
            values: { ...blankVersionValues, title: "Cake" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
    ]);

    const user = userEvent.setup();
    render(
      <PasteImportFlow
        cuisineOptions={[]}
        tagOptions={[{ id: "tag-1", displayName: "Desserts" }]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Desserts" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Tag" }));

    // A normalized-name match against the existing "Desserts" tag is
    // pre-selected — no "Create new tag" call needed (case-insensitive
    // dedup via normalized-name matching, same as Settings' Tag manager).
    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    expect(mockedCreateTag).not.toHaveBeenCalled();
    expect(mockedConfirmImportBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceRef: "AAA.rgr",
        tags: [{ id: "tag-1", displayName: "Desserts" }],
      }),
    ]);
  });

  it("surfaces a metadata-attachment warning on an otherwise-successful import, with no duplicate-risk Retry offered for it", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Desserts",
          result: {
            values: { ...blankVersionValues, title: "Cake" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedConfirmImportBatch.mockResolvedValue([
      {
        sourceRef: "AAA.rgr",
        status: "success",
        dishId: "d1",
        metadataWarnings: ['Tag "Desserts" could not be applied.'],
      },
    ]);

    const user = userEvent.setup();
    render(
      <PasteImportFlow
        cuisineOptions={[]}
        tagOptions={[{ id: "tag-1", displayName: "Desserts" }]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Desserts" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Tag" }));
    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    // The Dish itself imported successfully — no Failed section, no Retry.
    expect(
      await screen.findByText("1 recipe was imported."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Failed to import" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry failed imports" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Imported, but some metadata could not be applied\./),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Tag "Desserts" could not be applied\./),
    ).toHaveLength(2);
    expect(screen.getByRole("link", { name: "View" })).toBeInTheDocument();
  });

  // PRODUCT_SPEC.md §46 (owner decision, 2026-09-02): Cuisine has no
  // create/existing sub-picker in the Classifications mapping UI the way
  // Tag/Flavor profile do (a single guessed name per item, not an
  // ambiguous multi-way choice) — mapping a category to "Cuisine" just
  // sets `draft.result.cuisineGuess` to the raw category text; the actual
  // Cuisine get-or-create happens only at commit time
  // (`resolveMetadataMappingsForCommit`), same dedup-by-normalized-name
  // rule Settings' Cuisine manager uses.
  it("applies a category→Cuisine mapping, resolving/creating the Cuisine only once Import begins", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Tex-Mex",
          result: {
            values: { ...filledVersionValues, title: "Enchiladas" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedCreateCuisine.mockResolvedValueOnce({
      status: "success",
      cuisine: { id: "cuisine-new-1", displayName: "Tex-Mex", position: 0 },
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Tex-Mex" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Cuisine" }));

    // Not yet resolved/created — only happens once Import actually begins,
    // same "no account data written until commit" rule as Tag/Flavor
    // profile "Create new" mappings.
    expect(mockedCreateCuisine).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    expect(mockedCreateCuisine).toHaveBeenCalledTimes(1);
    expect(mockedConfirmImportBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceRef: "AAA.rgr",
        cuisines: [{ id: "cuisine-new-1", displayName: "Tex-Mex" }],
      }),
    ]);
  });

  it("maps a source category to an existing Cuisine without creating a new one", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Vietnamese",
          result: {
            values: { ...filledVersionValues, title: "Pho" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
    ]);

    const user = userEvent.setup();
    render(
      <PasteImportFlow
        cuisineOptions={[{ id: "cuisine-1", displayName: "Vietnamese" }]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Vietnamese" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Cuisine" }));

    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    // A normalized-name match against the existing "Vietnamese" Cuisine is
    // resolved directly — no "Create new" call needed.
    expect(mockedCreateCuisine).not.toHaveBeenCalled();
    expect(mockedConfirmImportBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceRef: "AAA.rgr",
        cuisines: [{ id: "cuisine-1", displayName: "Vietnamese" }],
      }),
    ]);
  });

  it('choosing "Create new Tag" and then discarding the import never creates account data', async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Holiday",
          result: {
            values: { ...blankVersionValues, title: "Gingerbread" },
            needsReviewCount: 0,
            cuisineGuess: null,
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
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Holiday" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Tag" }));
    // No existing "Holiday" tag — the "New" checkbox defaults to checked.
    expect(mockedCreateTag).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard import" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Discard import" }),
    );

    expect(mockedCreateTag).not.toHaveBeenCalled();
    expect(screen.queryByText("1 ready to import")).not.toBeInTheDocument();
  });

  it('choosing "Create new Flavor profile" and then discarding the import never creates account data', async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Spicy",
          result: {
            values: { ...blankVersionValues, title: "Buffalo Wings" },
            needsReviewCount: 0,
            cuisineGuess: null,
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
    await screen.findByText("1 ready to import");

    await user.click(screen.getByRole("combobox", { name: 'Map "Spicy" to' }));
    await user.click(
      await screen.findByRole("option", { name: "Flavor profile" }),
    );
    // No existing "Spicy" Flavor profile — the "New" checkbox defaults to
    // checked.
    expect(mockedCreateFlavorProfile).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard import" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Discard import" }),
    );

    expect(mockedCreateFlavorProfile).not.toHaveBeenCalled();
    expect(screen.queryByText("1 ready to import")).not.toBeInTheDocument();
  });

  it("resolves/creates a pending new Tag only once Import actually begins", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Holiday",
          result: {
            values: { ...blankVersionValues, title: "Gingerbread" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedCreateTag.mockResolvedValueOnce({
      status: "success",
      message: "Added Holiday.",
      tag: {
        id: "tag-new-1",
        displayName: "Holiday",
        isFavorite: false,
        dishCount: 0,
        position: 0,
      },
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Holiday" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Tag" }));
    expect(mockedCreateTag).not.toHaveBeenCalled();

    // Choosing the mapping itself never creates anything — only Import does.
    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    expect(mockedCreateTag).toHaveBeenCalledTimes(1);
    expect(mockedConfirmImportBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceRef: "AAA.rgr",
        tags: [{ id: "tag-new-1", displayName: "Holiday" }],
      }),
    ]);
  });

  it("resolves/creates a pending new Flavor profile only once Import actually begins", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Spicy",
          result: {
            values: { ...blankVersionValues, title: "Buffalo Wings" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedCreateFlavorProfile.mockResolvedValueOnce({
      status: "success",
      message: "Added Spicy.",
      flavorProfile: { id: "fp-new-1", displayName: "Spicy", position: 0 },
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(screen.getByRole("combobox", { name: 'Map "Spicy" to' }));
    await user.click(
      await screen.findByRole("option", { name: "Flavor profile" }),
    );
    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    expect(mockedCreateFlavorProfile).toHaveBeenCalledTimes(1);
    expect(mockedConfirmImportBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        sourceRef: "AAA.rgr",
        flavorProfiles: [{ id: "fp-new-1", displayName: "Spicy" }],
      }),
    ]);
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
    expect(screen.queryByText(/ready to import/)).not.toBeInTheDocument();
  });

  // Task §3: entering the batch review flow from Import Parts defaults
  // every row to Part, not Recipe — a source adapter with no kind of its
  // own (.rga) always falls back to the route.
  it("defaults every batch row to Part when entered from Import Parts", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Marinara Sauce" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });

    const user = userEvent.setup();
    render(<PasteImportFlow kind="PART" cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a part file/), file);
    await screen.findByText("1 ready to import");

    expect(
      within(
        screen.getByRole("radiogroup", { name: 'Save "Marinara Sauce" as' }),
      ).getByRole("radio", { name: "Part" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "Import 1 part" }),
    ).toBeInTheDocument();
  });

  // Task §4: "Finish review" on a Needs-review row flips its badge to
  // "Reviewed" and moves it below any still-unreviewed row in the same
  // group, immediately (no visible reorder after the fact).
  it("marks a Needs-review row Reviewed after Finish review and sinks it to the bottom of the group", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: null,
          result: {
            values: { ...filledVersionValues, title: "Flagged First" },
            needsReviewCount: 1,
            cuisineGuess: null,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...filledVersionValues, title: "Flagged Second" },
            needsReviewCount: 1,
            cuisineGuess: null,
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
    await screen.findByText("2 ready to import (2 need review)");

    const needsReviewSection = () =>
      screen.getByRole("heading", { name: "Needs review" }).closest("section")!;
    // Review the *first* row — it should end up below the still-unreviewed
    // second row once back on the list.
    await user.click(
      within(needsReviewSection()).getAllByRole("button", {
        name: /Review/,
      })[0],
    );
    await screen.findByText("Review imported recipe");
    await user.click(screen.getByRole("button", { name: "Finish review" }));

    await screen.findByText("Flagged First");
    const rows = within(needsReviewSection()).getAllByRole("listitem");
    const rowTitles = rows.map((row) => row.textContent);
    const firstIndex = rowTitles.findIndex((t) => t?.includes("Flagged First"));
    const secondIndex = rowTitles.findIndex((t) =>
      t?.includes("Flagged Second"),
    );
    expect(firstIndex).toBeGreaterThan(secondIndex);
    expect(
      within(needsReviewSection()).getByText("Reviewed"),
    ).toBeInTheDocument();
  });

  // Task §8: the progress modal must render on the very first tick of the
  // click — before the (async) "Create new" mapping resolution and the
  // chunked confirm call ever resolve — not only once a server round trip
  // lands.
  it("shows the batch-progress modal immediately on Import, before any async work resolves", async () => {
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
            cuisineGuess: null,
          },
        },
      ],
    });
    let resolveConfirm!: (
      value: Awaited<ReturnType<typeof mockedConfirmImportBatch>>,
    ) => void;
    mockedConfirmImportBatch.mockReturnValue(
      new Promise((resolve) => {
        resolveConfirm = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    expect(await screen.findByText("Importing…")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Import 1 recipe" }),
    ).not.toBeInTheDocument();

    resolveConfirm([{ sourceRef: "AAA.rgr", status: "success", dishId: "d1" }]);
    expect(
      await screen.findByText("1 recipe was imported."),
    ).toBeInTheDocument();
  });

  // Task §5/§6: the "Apply mappings" button and its "one implementation
  // shifts the second dropdown next to the first" pattern are both gone.
  it("has no Apply mappings button and no Source categories heading", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Desserts",
          result: {
            values: { ...blankVersionValues, title: "Cake" },
            needsReviewCount: 0,
            cuisineGuess: null,
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
    await screen.findByText("1 ready to import");

    expect(
      screen.getByRole("heading", { name: "Classifications" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Source categories" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply mappings" }),
    ).not.toBeInTheDocument();
  });

  // Task §12: what happened to a mapped classification is reported on the
  // results page, not just silently applied.
  it("reports a created Tag's outcome under Classifications on the results page", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: "Holiday",
          result: {
            values: { ...blankVersionValues, title: "Gingerbread" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
      ],
    });
    mockedCreateTag.mockResolvedValueOnce({
      status: "success",
      message: "Added Holiday.",
      tag: {
        id: "tag-new-1",
        displayName: "Holiday",
        isFavorite: false,
        dishCount: 0,
        position: 0,
      },
    });
    mockedConfirmImportBatch.mockResolvedValue([
      { sourceRef: "AAA.rgr", status: "success", dishId: "d1" },
    ]);

    const user = userEvent.setup();
    render(<PasteImportFlow cuisineOptions={[]} />);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    const file = new File(["zip-bytes"], "export.rga", {
      type: "application/octet-stream",
    });
    await user.upload(screen.getByLabelText(/Upload a recipe file/), file);
    await screen.findByText("1 ready to import");

    await user.click(
      screen.getByRole("combobox", { name: 'Map "Holiday" to' }),
    );
    await user.click(await screen.findByRole("option", { name: "Tag" }));
    await user.click(screen.getByRole("button", { name: "Import 1 recipe" }));

    await screen.findByText("1 recipe was imported.");
    expect(
      screen.getByRole("heading", { name: "Classifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Tag "Holiday" created, applied to 1 item\./),
    ).toBeInTheDocument();
    // View opens the ordinary Recipe Details page in a new tab — the
    // results page (and its own context) stays intact in this one.
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  // Task §2: the global controls affect every selectable row; each
  // subsection's own Select all/Select none only ever touch that group.
  it("scopes Needs review's Select none to that group, leaving Ready to import's selection untouched", async () => {
    mockedExtractArchive.mockResolvedValue({
      status: "success",
      drafts: [
        {
          status: "ok",
          sourceRef: "AAA.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Ready Item" },
            needsReviewCount: 0,
            cuisineGuess: null,
          },
        },
        {
          status: "ok",
          sourceRef: "BBB.rgr",
          sourceCategory: null,
          result: {
            values: { ...blankVersionValues, title: "Flagged Item" },
            needsReviewCount: 1,
            cuisineGuess: null,
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
    await screen.findByText("2 / 2 selected");

    const needsReviewSection = screen
      .getByRole("heading", { name: "Needs review" })
      .closest("section")!;
    await user.click(
      within(needsReviewSection).getByRole("button", { name: "Select none" }),
    );

    expect(
      within(needsReviewSection).getByText("0 / 1 selected"),
    ).toBeInTheDocument();
    const readySection = screen
      .getByRole("heading", { name: "Ready to import" })
      .closest("section")!;
    expect(
      within(readySection).getByText("1 / 1 selected"),
    ).toBeInTheDocument();
    // Global count reflects the scoped change.
    expect(screen.getByText("1 / 2 selected")).toBeInTheDocument();
  });
});
