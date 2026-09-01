import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { ToastProvider, Toaster } from "@/components/ui/toast";
import {
  createDish,
  editDish,
  updateVersionNote,
  setDefaultScale,
} from "@/lib/dishes/actions";
import {
  listAttachablePartVersions,
  listAttachableParts,
  validatePartAttachment,
} from "@/lib/sections/actions";
import type { DishFormValues } from "@/components/domain/dish/dish-form-values";

// DishEditor renders CoachMark, which requires an ancestor
// OnboardingProvider (useOnboarding() now throws without one) — this local
// `render` wrapper is the "explicit lightweight test provider" every call
// site below picks up automatically.
function render(ui: ReactElement) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <OnboardingProvider initialState={{}}>{children}</OnboardingProvider>
    ),
  });
}

// "Replace with Part" surfaces server-side eligibility failures via the app
// toast, which throws without an ancestor `ToastProvider` — the plain
// `render` above doesn't include one since no other DishEditor flow needs
// it.
function renderWithToast(ui: ReactElement) {
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

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(async () => ({ status: "idle" })),
  editDish: vi.fn(async () => ({ status: "idle" })),
  updateVersionNote: vi.fn(async () => ({ status: "success" })),
  setDefaultScale: vi.fn(async () => ({ status: "success" })),
  // "Replace with Part"'s Version picker (`RichDishVersionPicker`) fetches
  // this itself once a Part is selected.
  listDishVersionOptions: vi.fn(async () => ({
    status: "success",
    versions: [{ id: "target-part-v1", majorVersion: 1, minorVersion: 0 }],
    currentVersionId: "target-part-v1",
  })),
}));

vi.mock("@/lib/sections/actions", () => ({
  getPartLinkDisplay: vi.fn(async () => ({
    status: "success",
    title: "Nuoc Cham",
    majorVersion: 1,
    minorVersion: 0,
  })),
  getPartLinkPreview: vi.fn(async () => ({ status: "success", tree: null })),
  listAttachablePartVersions: vi.fn(async () => ({
    status: "success",
    versions: [{ id: "new-part-1-v1", majorVersion: 1, minorVersion: 0 }],
  })),
  // Slice 6A browser-review correction pass §5: PartAttachPicker fetches
  // this itself on open — not exercised by these tests, but the mock must
  // exist so an accidental open doesn't throw on a missing export.
  listAttachableParts: vi.fn(async () => ({ status: "success", parts: [] })),
  validatePartAttachment: vi.fn(),
  resolvePartVersionForDetach: vi.fn(),
}));

// The Reorder modal's own drag-and-drop rendering/mechanics are covered in
// `top-level-reorder-dialog.test.tsx`; here it's stubbed to a plain summary
// of the entries it received plus a "Test cancel"/"Test apply reversed"
// pair, so DishEditor's own wiring (which entries it hands over, and how it
// repositions the draft on Apply) can be tested without needing dnd-kit
// pointer/keyboard drag gestures to work in jsdom.
vi.mock("@/components/domain/dish/top-level-reorder-dialog", () => ({
  TopLevelReorderDialog: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    entries: Array<{ kind: string; fieldId: string; label?: string }>;
    onApply: (orderedFieldIds: string[]) => void;
  }) => {
    if (!props.open) return null;
    const labels = props.entries
      .map((entry) => (entry.kind === "section" ? entry.label : "linked Part"))
      .join(", ");
    return (
      <div>
        <p data-testid="reorder-entries">{labels}</p>
        <button type="button" onClick={() => props.onOpenChange(false)}>
          Test cancel
        </button>
        <button
          type="button"
          onClick={() => {
            props.onApply(
              props.entries
                .map((entry) => entry.fieldId)
                .slice()
                .reverse(),
            );
            props.onOpenChange(false);
          }}
        >
          Test apply reversed
        </button>
      </div>
    );
  },
}));

const mockedCreateDish = vi.mocked(createDish);
const mockedEditDish = vi.mocked(editDish);
const mockedUpdateVersionNote = vi.mocked(updateVersionNote);
const mockedSetDefaultScale = vi.mocked(setDefaultScale);
const mockedListAttachablePartVersions = vi.mocked(listAttachablePartVersions);
const mockedListAttachableParts = vi.mocked(listAttachableParts);
const mockedValidatePartAttachment = vi.mocked(validatePartAttachment);

const existingDish: {
  id: string;
  baseVersionId: string;
  baseMajorVersion: number;
  baseMinorVersion: number;
  highestMajorVersion: number;
  nextMinorVersion: number;
  isCurrent: boolean;
  note: string | null;
  defaultScale: number | null;
  values: DishFormValues;
} = {
  id: "dish-1",
  baseVersionId: "version-1",
  baseMajorVersion: 1,
  baseMinorVersion: 0,
  highestMajorVersion: 1,
  nextMinorVersion: 1,
  isCurrent: true,
  note: null,
  defaultScale: null,
  values: {
    title: "Ginger Bowl",
    stage: "IDEA",
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
        lineageId: "section-1",
        name: null,
        guidanceNote: null,
        position: 0,
        ingredients: [
          {
            lineageId: "ingredient-1",
            name: "Salt",
            quantity: null,
            quantityEnd: null,
            isApproximate: false,
            unit: null,
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
    partLinks: [],
  },
};

describe("DishEditor heading", () => {
  it("shows a New heading with no dish, and an Edit heading with one", () => {
    const { unmount } = render(<DishEditor kind="RECIPE" />);
    expect(
      screen.getByRole("heading", { name: "New recipe", level: 1 }),
    ).toBeInTheDocument();
    unmount();

    render(<DishEditor kind="PART" dish={existingDish} />);
    expect(
      screen.getByRole("heading", { name: "Edit part", level: 1 }),
    ).toBeInTheDocument();
  });

  // Nav/details QA batch items 7/13/14: "Recipe" names the ingredients/
  // instructions composition area for both entity kinds — never "Part".
  it("labels the composition area 'Recipe' even when editing a Part", () => {
    render(<DishEditor kind="PART" dish={existingDish} />);
    expect(
      screen.getByRole("heading", { name: "Recipe", level: 2 }),
    ).toBeInTheDocument();
  });
});

describe("DishEditor unsaved-changes guard", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
  });

  it("shows the discard-changes dialog when an in-app link is clicked while dirty, and navigates on Discard", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");

    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Cancel" }));

    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Discard changes" }));

    expect(push).toHaveBeenCalledWith("/recipes");
  });

  it("keeps editing and dismisses the dialog without navigating", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("link", { name: "Cancel" }));
    expect(screen.getByText("Discard unsaved changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not show the dialog when the form is clean", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    // A clean form lets the guard's click listener pass the click through
    // untouched (§15.3 — only dirty-form navigation is intercepted).
    await user.click(screen.getByRole("link", { name: "Cancel" }));

    expect(
      screen.queryByText("Discard unsaved changes?"),
    ).not.toBeInTheDocument();
  });
});

describe("DishEditor Sections", () => {
  // §7: "Add section" opens a blank draft in its own modal rather than
  // immediately adding an empty Section to the page — the new Section only
  // reaches the page's Section list once the modal is Finished.
  it("opens Add section as a modal draft, invisible on the page until Finished", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    expect(screen.queryByLabelText("Section name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Section/ }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add section" }));
    const nameInput = screen.getByLabelText("Section name");
    await user.type(nameInput, "Sauce");

    // Not yet part of the page's own Section list, behind the modal — the
    // modal's own dialog title (an h2) legitimately shows a live preview of
    // this same text as it's typed; only the page's own Section heading (an
    // h3, rendered by SectionFields) reflects a truly committed Section.
    expect(
      screen.queryByRole("heading", { name: /Section 1/, level: 3 }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish section" }));

    expect(
      screen.getByRole("heading", { name: "Section 1 — Sauce" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Section name")).not.toBeInTheDocument();
  });

  it("discards a new Section draft entirely on Cancel", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.type(screen.getByLabelText("Section name"), "Sauce");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Section name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /Section/ }),
    ).not.toBeInTheDocument();
  });

  it("removes a finished Section", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Finish section" }));
    expect(
      screen.getByRole("heading", { name: /Section 1/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove section 1" }));
    expect(
      screen.queryByRole("heading", { name: /Section 1/ }),
    ).not.toBeInTheDocument();
  });

  // §6: editing an existing Section is the same reversible modal session —
  // Finish commits the edits into the parent editor state; reopening shows
  // them.
  it("commits an edited existing Section's changes on Finish", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    await user.type(screen.getByLabelText("Section name"), "Sauce");
    await user.click(screen.getByRole("button", { name: "Finish section" }));

    expect(
      screen.getByRole("heading", { name: "Section 1 — Sauce" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Sauce" }));
    expect(screen.getByLabelText("Section name")).toHaveValue("Sauce");
  });

  // §6: Cancel restores the exact snapshot from modal-open time — name,
  // Ingredient edits, everything — with no partial edits left behind.
  it("reverts an edited existing Section's changes on Cancel", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    await user.type(screen.getByLabelText("Section name"), "Sauce");
    // A saved Ingredient (has a lineageId) starts collapsed — reveal its
    // fields before reading/editing them (Slice 6A collapsed-by-default).
    await user.click(screen.getByRole("button", { name: "Expand Salt" }));
    const ingredientName = screen.getByLabelText("Ingredient name");
    await user.clear(ingredientName);
    await user.type(ingredientName, "Kosher salt");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    // Unnamed default Section (§9.1) — heading reads "Section 1" alone.
    expect(
      screen.getByRole("heading", { name: "Section 1" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    expect(screen.getByLabelText("Section name")).toHaveValue("");
    // The modal remounted fresh, so the saved Ingredient is collapsed again.
    await user.click(screen.getByRole("button", { name: "Expand Salt" }));
    expect(screen.getByLabelText("Ingredient name")).toHaveValue("Salt");
  });

  // §6: the X and Escape are both treated as Cancel, the same as the
  // explicit Cancel button.
  it("treats Escape the same as Cancel", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    await user.type(screen.getByLabelText("Section name"), "Sauce");
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("heading", { name: "Section 1" }),
    ).toBeInTheDocument();
  });

  // Reordering itself is now drag-and-drop (dnd-kit), not a Move up/down
  // button — real pointer/keyboard drag gestures aren't reliably
  // simulable in jsdom (dnd-kit's sensors depend on real layout
  // measurement), so per this pass's testing policy, drag *mechanics* are
  // left to manual QA. What's still a stable, testable contract is that
  // every Section row exposes a correctly labeled drag handle.
  it("exposes an accessible drag handle for reordering a Section", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.type(screen.getByLabelText("Section name"), "Sauce");
    await user.click(screen.getByRole("button", { name: "Finish section" }));

    expect(
      screen.getByRole("button", { name: "Drag to reorder Sauce" }),
    ).toBeInTheDocument();
  });

  // Recipe/Part editor regression coverage: "Section N" numbering must
  // derive from the current position-sorted order among top-level Sections
  // only (skipping top-level linked Parts), not from `sections`' own
  // fieldArray/authoring index — a drag reorder only ever updates each
  // item's `position` (see `dish-editor.tsx`'s `handleTopLevelDragEnd`),
  // it never reshuffles the underlying fieldArray, so the stale-index bug
  // is fully reproducible from initial props alone (as if reopening the
  // editor after a save that persisted a reordered position sequence).
  it("numbers Sections by current position among top-level items, not by fieldArray order", async () => {
    const dishWithInterleavedOrder: typeof existingDish = {
      ...existingDish,
      values: {
        ...existingDish.values,
        sections: [
          {
            lineageId: "section-zebra",
            name: "Zebra section",
            guidanceNote: null,
            position: 2,
            ingredients: [],
            instructions: [],
            partLinks: [],
          },
          {
            lineageId: "section-apple",
            name: "Apple section",
            guidanceNote: null,
            position: 0,
            ingredients: [],
            instructions: [],
            partLinks: [],
          },
        ],
        partLinks: [
          {
            lineageId: "link-1",
            targetDishId: "part-1",
            targetDishVersionId: "part-1-v1",
            position: 1,
            multiplier: 1,
          },
        ],
      },
    };

    render(<DishEditor kind="RECIPE" dish={dishWithInterleavedOrder} />);

    // Position order is Apple section (0), linked Part (1), Zebra section
    // (2) — Apple renders first and must read "Section 1", Zebra renders
    // last and must read "Section 2", even though Zebra is first in the
    // authored `sections` array.
    expect(
      await screen.findByRole("heading", { name: "Section 1 — Apple section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Section 2 — Zebra section" }),
    ).toBeInTheDocument();
  });
});

describe("DishEditor Ingredients", () => {
  // §7: Ingredients are authored inside a Section's own modal session now,
  // not directly on the parent page — every test below opens a Section
  // first (via "Add section") to reach its "Add ingredient" control.
  it("adds and removes an Ingredient", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));

    const nameField = () => screen.queryAllByLabelText("Ingredient name");

    expect(nameField()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(nameField()[0], "Salt");
    expect(nameField()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Remove Salt" }));
    expect(nameField()).toHaveLength(0);
  });

  // See the Sections describe block above for why drag *mechanics* aren't
  // simulated here — this checks the same stable contract (an accessible
  // drag handle exists) for an Ingredient row.
  it("exposes an accessible drag handle for reordering an Ingredient", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Salt");

    expect(
      screen.getByRole("button", { name: "Drag to reorder Salt" }),
    ).toBeInTheDocument();
  });

  it("defaults to Single amount mode and switches to Range, exposing From/To fields", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Amount"));
    await user.click(await screen.findByRole("option", { name: "Range" }));

    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
  });

  it("switching back from Range to Single clears the stale quantityEnd", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.click(screen.getByLabelText("Amount"));
    await user.click(await screen.findByRole("option", { name: "Range" }));
    await user.type(screen.getByLabelText("From"), "1");
    await user.type(screen.getByLabelText("To"), "2");

    await user.click(screen.getByLabelText("Amount"));
    await user.click(
      await screen.findByRole("option", { name: "Single amount" }),
    );

    expect(screen.getByLabelText("Quantity")).toHaveValue("1");

    // Switch to Range again — the earlier "To" value must not silently
    // reappear; it was cleared, not just hidden.
    await user.click(screen.getByLabelText("Amount"));
    await user.click(await screen.findByRole("option", { name: "Range" }));
    expect(screen.getByLabelText("To")).toHaveValue("");
  });

  it("To taste and As needed modes show no amount inputs", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.click(screen.getByLabelText("Amount"));
    await user.click(await screen.findByRole("option", { name: "To taste" }));

    expect(screen.queryByLabelText("Quantity")).not.toBeInTheDocument();
    expect(
      screen.getByText(/To taste — no amount to enter/),
    ).toBeInTheDocument();
  });

  it("Free text mode exposes a text box for the amount description", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.click(screen.getByLabelText("Amount"));
    await user.click(await screen.findByRole("option", { name: "Free text" }));

    const describeField = screen.getByLabelText("Describe the amount");
    await user.type(describeField, "a splash");
    expect(describeField).toHaveValue("a splash");
  });
});

describe("DishEditor Instructions", () => {
  // §7: same relocation as Ingredients above — Instructions are authored
  // inside a Section's own modal session, reached via "Add section".
  it("adds and removes an Instruction", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));

    expect(screen.queryByLabelText("Instruction 1")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add instruction" }));
    expect(screen.getByLabelText("Instruction 1")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove instruction 1" }),
    );
    expect(screen.queryByLabelText("Instruction 1")).not.toBeInTheDocument();
  });

  // See the Sections describe block above for why drag *mechanics* aren't
  // simulated here — this checks the same stable contract (an accessible
  // drag handle exists) for an Instruction row.
  it("exposes an accessible drag handle for reordering an Instruction", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add instruction" }));

    expect(
      screen.getByRole("button", { name: "Drag to reorder instruction 1" }),
    ).toBeInTheDocument();
  });
});

describe("DishEditor minimum-content validation", () => {
  beforeEach(() => {
    mockedCreateDish.mockClear();
  });

  it("blocks save and shows an error when there is no ingredient or instruction", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Add at least one ingredient, instruction, or linked Part before saving.",
      ),
    ).toBeInTheDocument();
    expect(mockedCreateDish).not.toHaveBeenCalled();
  });

  // Slice 6A: a brand-new create form starts with one blank Section (no
  // ingredients/instructions yet) — this must never greet the user with
  // the minimum-content error before they've attempted to save.
  it("does not show the minimum-content error on an untouched create form", () => {
    render(<DishEditor kind="RECIPE" />);

    expect(
      screen.queryByText(
        "Add at least one ingredient, instruction, or linked Part before saving.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("DishEditor substitute handling", () => {
  beforeEach(() => {
    mockedCreateDish.mockClear();
    mockedCreateDish.mockResolvedValue({ status: "success", dishId: "dish-1" });
  });

  it("creates successfully when 'Add substitute' was clicked but left entirely blank", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Salt");
    await user.click(screen.getByRole("button", { name: "Add substitute" }));
    // Leave the substitute name blank, commit the Section, then save.
    await user.click(screen.getByRole("button", { name: "Finish section" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [, submitted] = mockedCreateDish.mock.calls[0];
    expect(submitted.sections[0].ingredients[0].substitute).toBeNull();
  });

  it("persists a fully completed substitute", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Soy sauce");
    await user.click(screen.getByRole("button", { name: "Add substitute" }));
    await user.type(screen.getByLabelText("Substitute name"), "Honey");
    await user.click(screen.getByRole("button", { name: "Finish section" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [, submitted] = mockedCreateDish.mock.calls[0];
    expect(submitted.sections[0].ingredients[0].substitute).toMatchObject({
      name: "Honey",
    });
  });

  // Section-local validation: a partial substitute is fully determinable
  // from the Section being edited alone, so it's caught at "Finish
  // section" — inside the modal's own form instance, where the offending
  // IngredientFields row is still mounted and the field-level error can
  // render right next to it (see `section-editor-dialog.tsx`'s
  // `handleFinish`).
  it("blocks Finish section and shows a field-level error for a partially completed substitute, until it's fixed", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("button", { name: "Add section" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Soy sauce");
    await user.click(screen.getByRole("button", { name: "Add substitute" }));

    // Fill in the substitute's unit but leave its name blank.
    const substituteGroup = screen.getByRole("group", { name: "Substitute" });
    await user.type(within(substituteGroup).getByLabelText("Unit"), "tbsp");
    await user.click(screen.getByRole("button", { name: "Finish section" }));

    // The modal stays open — Finish neither committed nor closed it — with
    // the field-level error visible right in the Substitute group, and the
    // user's edits (including the Section name field's presence) intact.
    expect(
      await within(substituteGroup).findByText(
        "Enter a substitute name, or remove the substitute.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Section name")).toBeInTheDocument();

    // Fixing the substitute name lets Finish succeed normally.
    await user.type(
      within(substituteGroup).getByLabelText("Substitute name"),
      "Honey",
    );
    await user.click(screen.getByRole("button", { name: "Finish section" }));
    expect(screen.queryByLabelText("Section name")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [, submitted] = mockedCreateDish.mock.calls[0];
    expect(submitted.sections[0].ingredients[0].substitute).toMatchObject({
      name: "Honey",
    });
  });

  // Defensive backstop (deliberately redundant with the Finish-time check
  // above): a partial substitute that reaches the parent form without ever
  // going through the Section modal — e.g. seeded from imported/malformed
  // state via `initialValues`, the same prop the paste-and-review importer
  // uses to pre-fill this editor — must still block final Save.
  it("defensively blocks final Save when a partial substitute reaches the parent form directly, bypassing the Section modal", async () => {
    const user = userEvent.setup();
    render(
      <DishEditor
        kind="RECIPE"
        initialValues={{
          ...existingDish.values,
          sections: [
            {
              ...existingDish.values.sections[0],
              ingredients: [
                {
                  ...existingDish.values.sections[0].ingredients[0],
                  substitute: {
                    name: "",
                    quantity: null,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: "tbsp",
                    displayText: null,
                    preparationNote: null,
                  },
                },
              ],
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Fix the highlighted substitute before saving — enter a name, or remove it.",
      ),
    ).toBeInTheDocument();
    expect(mockedCreateDish).not.toHaveBeenCalled();
  });
});

describe("DishEditor minor/major version choice", () => {
  beforeEach(() => {
    mockedEditDish.mockClear();
    mockedEditDish.mockResolvedValue({ status: "success", dishId: "dish-1" });
  });

  it("saves directly, without the choice dialog, when only a metadata field (title) changed", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.clear(screen.getByLabelText("Recipe title"));
    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl v2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.queryByText("How should this change be saved?"),
    ).not.toBeInTheDocument();
    expect(mockedEditDish).toHaveBeenCalledTimes(1);
    expect(mockedEditDish.mock.calls[0][4]).toBeUndefined();
  });

  it("shows the choice dialog when an Ingredient changed, and saves as a refinement on that choice", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    // A saved Section (has a lineageId) starts view-first — the pencil Edit
    // action reveals its editable fields (Slice 6A browser-review
    // correction pass: collapsed Sections show "Edit …", not "Expand …").
    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    // A saved Ingredient (has a lineageId) starts collapsed — reveal its
    // fields before reading/editing them (Slice 6A collapsed-by-default).
    await user.click(screen.getByRole("button", { name: "Expand Salt" }));
    const nameInput = screen.getByLabelText("Ingredient name");
    await user.clear(nameInput);
    await user.type(nameInput, "Kosher salt");
    // The Section modal is a transactional editing session — its edits only
    // reach the parent form (and become visible/saveable) once Finished.
    await user.click(screen.getByRole("button", { name: "Finish section" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("How should this change be saved?"),
    ).toBeInTheDocument();
    expect(mockedEditDish).not.toHaveBeenCalled();

    const refinementButton = screen.getByRole("button", {
      name: /Save as a refinement/,
    });
    expect(refinementButton).toHaveTextContent("Saves as V1.1");
    await user.click(refinementButton);

    expect(mockedEditDish).toHaveBeenCalledTimes(1);
    expect(mockedEditDish.mock.calls[0][4]).toBe("MINOR");
  });

  it("saves as a new major version when that choice is made", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    // A saved Ingredient (has a lineageId) starts collapsed — reveal its
    // fields before reading/editing them (Slice 6A collapsed-by-default).
    await user.click(screen.getByRole("button", { name: "Expand Salt" }));
    const nameInput = screen.getByLabelText("Ingredient name");
    await user.clear(nameInput);
    await user.type(nameInput, "Kosher salt");
    await user.click(screen.getByRole("button", { name: "Finish section" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("How should this change be saved?");
    const newVersionButton = screen.getByRole("button", {
      name: /Start a new version/,
    });
    expect(newVersionButton).toHaveTextContent("Starts V2.0");
    await user.click(newVersionButton);

    expect(mockedEditDish).toHaveBeenCalledTimes(1);
    expect(mockedEditDish.mock.calls[0][4]).toBe("MAJOR");
  });
});

describe("DishEditor consolidated note and default scale", () => {
  beforeEach(() => {
    mockedEditDish.mockClear();
    mockedUpdateVersionNote.mockClear();
    mockedSetDefaultScale.mockClear();
    mockedEditDish.mockResolvedValue({ status: "success", dishId: "dish-1" });
  });

  // Design remediation pass: note/default scale are edited in this one
  // consolidated form now, but keep their own existing non-material
  // persistence (`updateVersionNote`/`setDefaultScale`) — a Note-only
  // change must never trip the cooking-change minor/major dialog
  // (`diffVersionContent` never looks at either field).
  it("saves a Note-only change via updateVersionNote, without the minor/major dialog", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    // Details starts collapsed for an already-saved Recipe/Part.
    await user.click(screen.getByRole("button", { name: "Expand Details" }));
    await user.type(screen.getByLabelText("Version note"), "Tried less salt.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      screen.queryByText("How should this change be saved?"),
    ).not.toBeInTheDocument();
    await vi.waitFor(() => expect(mockedUpdateVersionNote).toHaveBeenCalled());
    expect(mockedEditDish).toHaveBeenCalledTimes(1);
    expect(mockedUpdateVersionNote).toHaveBeenCalledWith("RECIPE", {
      dishId: "dish-1",
      versionId: "version-1",
      note: "Tried less salt.",
    });
    expect(mockedSetDefaultScale).not.toHaveBeenCalled();
  });

  it("does not call updateVersionNote when the note is unchanged", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedEditDish).toHaveBeenCalledTimes(1);
    expect(mockedUpdateVersionNote).not.toHaveBeenCalled();
    expect(mockedSetDefaultScale).not.toHaveBeenCalled();
  });

  // Slice 6A: the result text is always `authored yield quantity ×
  // default scale`, live-computed as the multiplier is edited — never a
  // second stored quantity/unit. Reset returns the draft to 1×.
  it("computes the default-scale result text from yield × scale, and Reset visibly returns the input to 1", async () => {
    const user = userEvent.setup();
    const dishWithYield = {
      ...existingDish,
      values: {
        ...existingDish.values,
        yieldQuantity: 2,
        yieldUnit: "servings",
      },
    };
    render(<DishEditor kind="RECIPE" dish={dishWithYield} />);
    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    const scaleInput = screen.getByLabelText("Default scale multiplier");
    // A Dish with no stored custom defaultScale (null) displays "1", not blank.
    expect(scaleInput).toHaveValue("1");
    expect(
      screen.getByText("Recipe adjusted to 2 servings"),
    ).toBeInTheDocument();

    await user.clear(scaleInput);
    await user.type(scaleInput, "1.5");

    expect(
      screen.getByText("Recipe adjusted to 3 servings"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset" }));

    expect(scaleInput).toHaveValue("1");
    expect(
      screen.getByText("Recipe adjusted to 2 servings"),
    ).toBeInTheDocument();
  });

  it("displays a stored custom scale as-is", async () => {
    const user = userEvent.setup();
    const dishWithCustomScale = { ...existingDish, defaultScale: 2 };
    render(<DishEditor kind="RECIPE" dish={dishWithCustomScale} />);
    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    expect(screen.getByLabelText("Default scale multiplier")).toHaveValue("2");
  });

  it("blurring an emptied input resolves the visible value back to 1", async () => {
    const user = userEvent.setup();
    const dishWithCustomScale = { ...existingDish, defaultScale: 2 };
    render(<DishEditor kind="RECIPE" dish={dishWithCustomScale} />);
    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    const scaleInput = screen.getByLabelText("Default scale multiplier");
    await user.clear(scaleInput);
    await user.tab();

    expect(scaleInput).toHaveValue("1");
  });

  it("persists the default scale via setDefaultScale only when it changed", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);
    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    const scaleInput = screen.getByLabelText("Default scale multiplier");
    await user.clear(scaleInput);
    await user.type(scaleInput, "2");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(mockedSetDefaultScale).toHaveBeenCalled());
    expect(mockedSetDefaultScale).toHaveBeenCalledWith("RECIPE", {
      dishId: "dish-1",
      defaultScale: 2,
    });
  });

  it("does not call setDefaultScale when an unset scale is explicitly typed as 1", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);
    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    const scaleInput = screen.getByLabelText("Default scale multiplier");
    await user.clear(scaleInput);
    await user.type(scaleInput, "1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(mockedEditDish).toHaveBeenCalledTimes(1));
    expect(mockedSetDefaultScale).not.toHaveBeenCalled();
  });

  it("clears the stored custom scale via setDefaultScale(null) when Reset is saved", async () => {
    const user = userEvent.setup();
    const dishWithCustomScale = { ...existingDish, defaultScale: 2 };
    render(<DishEditor kind="RECIPE" dish={dishWithCustomScale} />);
    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(mockedSetDefaultScale).toHaveBeenCalled());
    expect(mockedSetDefaultScale).toHaveBeenCalledWith("RECIPE", {
      dishId: "dish-1",
      defaultScale: null,
    });
    expect(
      screen.queryByText("How should this change be saved?"),
    ).not.toBeInTheDocument();
  });
});

describe("DishEditor Convert Section to Part", () => {
  beforeEach(() => {
    mockedCreateDish.mockClear();
    mockedEditDish.mockClear();
    mockedListAttachablePartVersions.mockClear();
    mockedCreateDish.mockResolvedValue({
      status: "success",
      dishId: "new-part-1",
      versionId: "new-part-1-v1",
    });
    mockedListAttachablePartVersions.mockResolvedValue({
      status: "success",
      versions: [{ id: "new-part-1-v1", majorVersion: 1, minorVersion: 0 }],
    });
    push.mockClear();
  });

  it("replaces the Section with a PartLink at the same position, without saving the parent or navigating away", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(
      screen.getByRole("button", {
        name: "Convert section 1 to a reusable Part",
      }),
    );
    // `existingDish`'s section has no name of its own, so the dialog's
    // prefilled title starts blank — type one before converting.
    await user.type(screen.getByLabelText("Part name"), "Nuoc Cham");
    await user.click(screen.getByRole("button", { name: "Convert" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [, createInput] = mockedCreateDish.mock.calls[0];
    expect(createInput.sections[0].ingredients[0].name).toBe("Salt");

    // The Section (and its "Salt" ingredient) is gone; a linked-Part row
    // resolving to the new Part's live title stands in its place.
    expect(screen.queryByText("Salt")).not.toBeInTheDocument();
    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();

    // Slice 6A: a newly-created linked Part (no lineageId yet) starts
    // expanded so the user can confirm what was just added, unlike an
    // already-saved occurrence loaded from an existing Dish.
    expect(
      await screen.findByText("This Part has no saved content yet."),
    ).toBeInTheDocument();

    // The parent draft is untouched until its own normal Save, and the user
    // stays in the editor — no automatic save, no navigation.
    expect(mockedEditDish).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("DishEditor Replace Section with Part", () => {
  const dishWithTwoSections: typeof existingDish = {
    ...existingDish,
    values: {
      ...existingDish.values,
      sections: [
        {
          lineageId: "section-apple",
          name: "Apple section",
          guidanceNote: null,
          position: 0,
          ingredients: [
            {
              lineageId: "ingredient-flour",
              name: "Flour",
              quantity: null,
              quantityEnd: null,
              isApproximate: false,
              unit: null,
              displayText: null,
              preparationNote: null,
              isOptional: false,
              substitute: null,
            },
          ],
          instructions: [],
          partLinks: [],
        },
        {
          lineageId: "section-zebra",
          name: "Zebra section",
          guidanceNote: null,
          position: 1,
          ingredients: [
            {
              lineageId: "ingredient-sugar",
              name: "Sugar",
              quantity: null,
              quantityEnd: null,
              isApproximate: false,
              unit: null,
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
      partLinks: [],
    },
  };

  const COCONUT_MILK = {
    id: "target-part",
    stage: "ACTIVE" as const,
    cuisine: null,
    currentTitle: "Coconut Milk",
    currentVersionId: "target-part-v1",
    versionLabel: "V1.0",
    imageAssetId: null,
    tags: [],
    rating: { kind: "none" as const },
  };

  beforeEach(() => {
    mockedListAttachableParts.mockReset();
    mockedValidatePartAttachment.mockReset();
  });

  it("replaces the Section with the selected Part at the Section's exact position, leaving the rest of the order untouched", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts.mockResolvedValue({
      status: "success",
      parts: [COCONUT_MILK],
    });
    mockedValidatePartAttachment.mockResolvedValue({
      status: "success",
      target: {
        targetDishId: "target-part",
        targetTitle: "Coconut Milk",
        targetVersionId: "target-part-v1",
        majorVersion: 1,
        minorVersion: 0,
      },
    });

    const { container } = renderWithToast(
      <DishEditor kind="RECIPE" dish={dishWithTwoSections} />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Replace Apple section with an existing Part",
      }),
    );

    // Prefilled from the Section's own title.
    const searchInput = screen.getByPlaceholderText("Search your Parts");
    expect(searchInput).toHaveValue("Apple section");

    // The prefilled text is a convenience default, not a hard filter — the
    // user clears it to browse for an unrelated Part.
    await user.clear(searchInput);
    await user.click(await screen.findByText("Coconut Milk"));
    await screen.findByText("V1.0");
    await user.click(screen.getByRole("button", { name: "Replace" }));

    expect(mockedValidatePartAttachment).toHaveBeenCalledTimes(1);

    // The Section (and its "Flour" ingredient) is gone, replaced by a
    // linked-Part row — the other Section is untouched and unmoved.
    expect(screen.queryByText("Flour")).not.toBeInTheDocument();
    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Section 1 — Zebra section" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sugar")).toBeInTheDocument();

    // The new PartLink took over the replaced Section's own position
    // (first) rather than being appended after the remaining Section.
    const html = container.innerHTML;
    expect(html.indexOf("Nuoc Cham")).toBeLessThan(
      html.indexOf("Zebra section"),
    );
  });

  it("Cancel leaves the Section unchanged", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts.mockResolvedValue({
      status: "success",
      parts: [COCONUT_MILK],
    });

    renderWithToast(<DishEditor kind="RECIPE" dish={dishWithTwoSections} />);

    await user.click(
      screen.getByRole("button", {
        name: "Replace Apple section with an existing Part",
      }),
    );
    await user.clear(screen.getByPlaceholderText("Search your Parts"));
    await screen.findByText("Coconut Milk");
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(
      screen.getByRole("heading", { name: "Section 1 — Apple section" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Flour")).toBeInTheDocument();
    expect(mockedValidatePartAttachment).not.toHaveBeenCalled();
  });

  it("still relies on server-side eligibility validation, not just the fetched candidate list", async () => {
    const user = userEvent.setup();
    mockedListAttachableParts.mockResolvedValue({
      status: "success",
      parts: [COCONUT_MILK],
    });
    mockedValidatePartAttachment.mockResolvedValue({
      status: "error",
      message: "That Part can't be attached here.",
    });

    renderWithToast(<DishEditor kind="RECIPE" dish={dishWithTwoSections} />);

    await user.click(
      screen.getByRole("button", {
        name: "Replace Apple section with an existing Part",
      }),
    );
    await user.clear(screen.getByPlaceholderText("Search your Parts"));
    await user.click(await screen.findByText("Coconut Milk"));
    await screen.findByText("V1.0");
    await user.click(screen.getByRole("button", { name: "Replace" }));

    expect(
      await screen.findByText("That Part can't be attached here."),
    ).toBeInTheDocument();
    // The dialog stays open on error — close it to check the background,
    // which Radix marks aria-hidden while the dialog is mounted.
    await user.click(screen.getByRole("button", { name: "Close" }));
    // The Section is untouched — the failed validation never reaches the draft.
    expect(
      screen.getByRole("heading", { name: "Section 1 — Apple section" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Flour")).toBeInTheDocument();
  });
});

describe("DishEditor linked-Part inline rendering", () => {
  const dishWithLinkedPart: typeof existingDish = {
    ...existingDish,
    values: {
      ...existingDish.values,
      sections: [],
      partLinks: [
        {
          lineageId: "link-1",
          targetDishId: "part-1",
          targetDishVersionId: "part-1-v1",
          position: 0,
          multiplier: 2,
        },
      ],
    },
  };

  beforeEach(() => {
    mockedListAttachablePartVersions.mockClear();
  });

  it("starts collapsed for an already-saved linked Part, expands to reveal pinned content", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={dishWithLinkedPart} />);

    // Slice 6A: the header (name/version/multiplier) is enough to
    // navigate without expanding — an already-saved occurrence (has a
    // lineageId) starts collapsed, same rule as a saved Section.
    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();
    expect(screen.getByText(/× 2/)).toBeInTheDocument();
    expect(
      screen.queryByText("This Part has no saved content yet."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Nuoc Cham" }));

    expect(
      await screen.findByText("This Part has no saved content yet."),
    ).toBeInTheDocument();

    // The reusable Part's own content is never exposed as parent-owned
    // inline inputs — only the compact "Scaling" row edits anything here,
    // and that's just the multiplier.
    expect(screen.queryByLabelText("Ingredient name")).not.toBeInTheDocument();
  });
});

// PRODUCT_SPEC.md §39.5 — feedback-assisted editing from a historical
// cooked Version: the banner must identify both the Version being edited
// and the Dish's actual current Version.
describe("DishEditor historical Version identification", () => {
  it("identifies both the cooked Version and the current Version when editing a historical base", () => {
    render(
      <DishEditor
        kind="RECIPE"
        dish={{
          ...existingDish,
          isCurrent: false,
          currentMajorVersion: 2,
          currentMinorVersion: 0,
        }}
      />,
    );

    expect(
      screen.getByText(/You're editing V1\.0 — the current version is V2\.0/),
    ).toBeInTheDocument();
  });

  it("falls back to a generic notice when the current Version's label isn't available", () => {
    render(
      <DishEditor kind="RECIPE" dish={{ ...existingDish, isCurrent: false }} />,
    );

    expect(
      screen.getByText(/You're editing V1\.0, not the current version/),
    ).toBeInTheDocument();
  });
});

// PRODUCT_SPEC.md §39.4 — evidence access while editing from a Cooking
// Session/Review, without discarding unsaved edits.
describe("DishEditor session evidence", () => {
  const evidence = {
    sessionId: "session-1",
    outcome: "COMPLETED" as const,
    endedAt: "2026-01-01T00:00:00.000Z",
    cookedVersionLabel: "V1.0",
    cookingNotes: "Used a bigger pot.",
    review: {
      whatWentWell: "Great texture",
      whatDidNotGoWell: null,
      anythingElse: null,
      actualAmountQuantity: null,
      actualAmountUnit: null,
      reviewAdjustedDurationSeconds: null,
    },
    ratings: [{ tasterName: "You", isOwner: true, value: 5 }],
  };

  it("shows the trigger only when evidence is present", () => {
    const { unmount } = render(
      <DishEditor kind="RECIPE" dish={{ ...existingDish, evidence: null }} />,
    );
    expect(
      screen.queryByRole("button", { name: "View session evidence" }),
    ).not.toBeInTheDocument();
    unmount();

    render(<DishEditor kind="RECIPE" dish={{ ...existingDish, evidence }} />);
    expect(
      screen.getByRole("button", { name: "View session evidence" }),
    ).toBeInTheDocument();
  });

  it("opens and closes the evidence Sheet without resetting unsaved form edits", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={{ ...existingDish, evidence }} />);

    const titleInput = screen.getByLabelText("Recipe title");
    await user.clear(titleInput);
    await user.type(titleInput, "Edited while reviewing evidence");

    await user.click(
      screen.getByRole("button", { name: "View session evidence" }),
    );
    expect(await screen.findByText("Great texture")).toBeInTheDocument();
    expect(screen.getByText("Used a bigger pot.")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Great texture")).not.toBeInTheDocument();

    expect(titleInput).toHaveValue("Edited while reviewing evidence");
  });
});

// Design pass: long Recipes/Parts get a compact Reorder modal alongside the
// existing inline drag-and-drop, plus collapsible Details/Nutrition.
describe("DishEditor Details/Nutrition collapse", () => {
  it("starts Details and Nutrition collapsed when editing an existing Recipe/Part", () => {
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand Details" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Calories")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Expand Nutrition" }),
    ).toBeInTheDocument();
  });

  it("starts Details and Nutrition expanded when creating a new Recipe/Part", () => {
    render(<DishEditor kind="RECIPE" />);

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse Details" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Calories")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Collapse Nutrition" }),
    ).toBeInTheDocument();
  });

  // Slice 11's paste-and-review importer seeds `initialValues` with no
  // `dish` prop — same create-mode branch, so it must preserve today's
  // expanded-by-default behavior too.
  it("starts Details and Nutrition expanded for an import/create-review flow", () => {
    render(<DishEditor kind="RECIPE" initialValues={existingDish.values} />);

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Calories")).toBeInTheDocument();
  });

  it("collapsing Details preserves the entered values", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Expand Details" }));
    await user.type(screen.getByLabelText("Description"), "A weeknight bowl.");

    await user.click(screen.getByRole("button", { name: "Collapse Details" }));
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Details" }));
    expect(screen.getByLabelText("Description")).toHaveValue(
      "A weeknight bowl.",
    );
  });

  it("collapsing Nutrition preserves the entered values", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Expand Nutrition" }));
    await user.type(screen.getByLabelText("Calories"), "250");

    await user.click(
      screen.getByRole("button", { name: "Collapse Nutrition" }),
    );
    expect(screen.queryByLabelText("Calories")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand Nutrition" }));
    expect(screen.getByLabelText("Calories")).toHaveValue("250");
  });

  it("expands Details and Nutrition independently of one another", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

    await user.click(screen.getByRole("button", { name: "Expand Details" }));

    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Calories")).not.toBeInTheDocument();
  });
});

describe("DishEditor Reorder", () => {
  beforeEach(() => {
    mockedEditDish.mockClear();
  });

  const dishWithInterleavedOrder: typeof existingDish = {
    ...existingDish,
    values: {
      ...existingDish.values,
      sections: [
        {
          lineageId: "section-zebra",
          name: "Zebra section",
          guidanceNote: null,
          position: 2,
          ingredients: [],
          instructions: [],
          partLinks: [],
        },
        {
          lineageId: "section-apple",
          name: "Apple section",
          guidanceNote: null,
          position: 0,
          ingredients: [],
          instructions: [],
          partLinks: [],
        },
      ],
      partLinks: [
        {
          lineageId: "link-1",
          targetDishId: "part-1",
          targetDishVersionId: "part-1-v1",
          position: 1,
          multiplier: 1,
        },
      ],
    },
  };

  it("hides the Reorder action when there's nothing to reorder", () => {
    // A brand-new create form starts with exactly one blank Section.
    render(<DishEditor kind="RECIPE" />);
    expect(
      screen.queryByRole("button", { name: "Reorder" }),
    ).not.toBeInTheDocument();
  });

  it("opens the Reorder modal with the editor's current top-level order", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={dishWithInterleavedOrder} />);

    await user.click(screen.getByRole("button", { name: "Reorder" }));

    expect(screen.getByTestId("reorder-entries")).toHaveTextContent(
      "Apple section, linked Part, Zebra section",
    );
  });

  it("Cancel leaves the editor's order unchanged", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={dishWithInterleavedOrder} />);

    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(screen.getByRole("button", { name: "Test cancel" }));

    expect(
      screen.getByRole("heading", { name: "Section 1 — Apple section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Section 2 — Zebra section" }),
    ).toBeInTheDocument();
  });

  it("Apply updates the editor's draft order immediately, without saving a Version", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={dishWithInterleavedOrder} />);

    await user.click(screen.getByRole("button", { name: "Reorder" }));
    await user.click(
      screen.getByRole("button", { name: "Test apply reversed" }),
    );

    // Reversed order — Zebra, linked Part, Apple — so Zebra now numbers
    // first among Sections and Apple second.
    expect(
      screen.getByRole("heading", { name: "Section 1 — Zebra section" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Section 2 — Apple section" }),
    ).toBeInTheDocument();
    expect(mockedEditDish).not.toHaveBeenCalled();
  });
});

// Importer live-QA polish pass: `submitLabel`/`onCancelAction` are optional
// props only the batch-review import flow sets — every test above (neither
// prop passed) already proves ordinary Save/Cancel is unaffected; these
// exercise the override behavior itself.
describe("DishEditor import-review overrides", () => {
  beforeEach(() => {
    mockedCreateDish.mockClear();
  });

  it("submitLabel overrides the primary button's text", () => {
    render(<DishEditor kind="RECIPE" submitLabel="Finish review" />);
    expect(
      screen.getByRole("button", { name: "Finish review" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("onCancelAction replaces the Cancel link with a callback and never navigates", async () => {
    const onCancelAction = vi.fn();
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" onCancelAction={onCancelAction} />);

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).not.toHaveAttribute("href");
    await user.click(cancelButton);

    expect(onCancelAction).toHaveBeenCalledTimes(1);
    expect(mockedCreateDish).not.toHaveBeenCalled();
  });

  // Task §8: a Section named exactly "Needs review" (the importer's own
  // marker — `paste-parser.ts`'s `NEEDS_REVIEW_SECTION_NAME`) gets a
  // dedicated warning treatment instead of ordinary Section chrome.
  it("shows the orange Needs-review warning and a working jump link for an imported Needs-review Section", async () => {
    render(
      <DishEditor
        kind="RECIPE"
        initialValues={{
          ...existingDish.values,
          sections: [
            ...existingDish.values.sections,
            {
              name: "Needs review",
              guidanceNote:
                "The importer could not confidently structure these.",
              ingredients: [],
              instructions: [{ text: "2 unidentified splashes of something" }],
              partLinks: [],
              position: 1,
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText("Some imported lines need review"),
    ).toBeInTheDocument();
    // Appears twice by design: once in the warning card's line list, once
    // in the flagged Section's own (orange-bordered) view-mode content.
    expect(
      screen.getAllByText("2 unidentified splashes of something"),
    ).toHaveLength(2);

    const jumpLink = screen.getByRole("link", { name: "Jump to these lines" });
    expect(jumpLink.getAttribute("href")).toMatch(/^#/);
    const anchorId = jumpLink.getAttribute("href")!.slice(1);
    expect(document.getElementById(anchorId)).toBeInTheDocument();
  });
});
