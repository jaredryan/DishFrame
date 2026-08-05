import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import {
  createDish,
  editDish,
  updateVersionNote,
  setDefaultScale,
} from "@/lib/dishes/actions";
import { listAttachablePartVersions } from "@/lib/sections/actions";
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

const mockedCreateDish = vi.mocked(createDish);
const mockedEditDish = vi.mocked(editDish);
const mockedUpdateVersionNote = vi.mocked(updateVersionNote);
const mockedSetDefaultScale = vi.mocked(setDefaultScale);
const mockedListAttachablePartVersions = vi.mocked(listAttachablePartVersions);

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
  it("adds and removes a Section", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    const nameField = () => screen.getAllByLabelText("Section name");

    expect(nameField()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    expect(nameField()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remove section 2" }));
    expect(nameField()).toHaveLength(1);
  });

  it("renames a Section", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    const input = screen.getByLabelText("Section name");
    await user.type(input, "Sauce");

    expect(input).toHaveValue("Sauce");
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

    await user.type(screen.getByLabelText("Section name"), "Sauce");

    expect(
      screen.getByRole("button", { name: "Drag to reorder Sauce" }),
    ).toBeInTheDocument();
  });

  it("collapses a Section into a summary and expands it again", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Section name"), "Sauce");
    await user.click(screen.getByRole("button", { name: "Collapse Sauce" }));

    expect(screen.queryByLabelText("Section name")).not.toBeInTheDocument();
    expect(screen.getByText(/Sauce/)).toBeInTheDocument();

    // Slice 6A browser-review correction pass: a collapsed Section shows a
    // pencil "Edit …" action, not the chevron "Expand …" used elsewhere.
    await user.click(screen.getByRole("button", { name: "Edit Sauce" }));
    expect(screen.getByLabelText("Section name")).toBeInTheDocument();
  });
});

describe("DishEditor Ingredients", () => {
  it("adds and removes an Ingredient", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

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

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Salt");

    expect(
      screen.getByRole("button", { name: "Drag to reorder Salt" }),
    ).toBeInTheDocument();
  });

  it("defaults to Single amount mode and switches to Range, exposing From/To fields", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

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

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.click(screen.getByLabelText("Amount"));
    await user.click(await screen.findByRole("option", { name: "Free text" }));

    const describeField = screen.getByLabelText("Describe the amount");
    await user.type(describeField, "a splash");
    expect(describeField).toHaveValue("a splash");
  });
});

describe("DishEditor Instructions", () => {
  it("adds and removes an Instruction", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

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
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Salt");
    await user.click(screen.getByRole("button", { name: "Add substitute" }));

    // Leave the substitute name blank, then save.
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [, submitted] = mockedCreateDish.mock.calls[0];
    expect(submitted.sections[0].ingredients[0].substitute).toBeNull();
  });

  it("persists a fully completed substitute", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Soy sauce");
    await user.click(screen.getByRole("button", { name: "Add substitute" }));
    await user.type(screen.getByLabelText("Substitute name"), "Honey");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [, submitted] = mockedCreateDish.mock.calls[0];
    expect(submitted.sections[0].ingredients[0].substitute).toMatchObject({
      name: "Honey",
    });
  });

  it("blocks save and shows a field-level error for a partially completed substitute", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.type(screen.getByLabelText("Recipe title"), "Ginger Bowl");
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Soy sauce");
    await user.click(screen.getByRole("button", { name: "Add substitute" }));

    // Fill in the substitute's unit but leave its name blank.
    const substituteGroup = screen.getByRole("group", { name: "Substitute" });
    await user.type(within(substituteGroup).getByLabelText("Unit"), "tbsp");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText(
        "Enter a substitute name, or remove the substitute.",
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
    const nameInput = screen.getByLabelText("Ingredient name");
    await user.clear(nameInput);
    await user.type(nameInput, "Kosher salt");
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
    const nameInput = screen.getByLabelText("Ingredient name");
    await user.clear(nameInput);
    await user.type(nameInput, "Kosher salt");
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

  it("displays a stored custom scale as-is", () => {
    const dishWithCustomScale = { ...existingDish, defaultScale: 2 };
    render(<DishEditor kind="RECIPE" dish={dishWithCustomScale} />);

    expect(screen.getByLabelText("Default scale multiplier")).toHaveValue("2");
  });

  it("blurring an emptied input resolves the visible value back to 1", async () => {
    const user = userEvent.setup();
    const dishWithCustomScale = { ...existingDish, defaultScale: 2 };
    render(<DishEditor kind="RECIPE" dish={dishWithCustomScale} />);

    const scaleInput = screen.getByLabelText("Default scale multiplier");
    await user.clear(scaleInput);
    await user.tab();

    expect(scaleInput).toHaveValue("1");
  });

  it("persists the default scale via setDefaultScale only when it changed", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" dish={existingDish} />);

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
