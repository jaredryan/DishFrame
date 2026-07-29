import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { createDish, editDish } from "@/lib/dishes/actions";
import { listAttachablePartVersions } from "@/lib/sections/actions";
import type { DishFormValues } from "@/components/domain/dish/dish-form-values";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(async () => ({ status: "idle" })),
  editDish: vi.fn(async () => ({ status: "idle" })),
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
  validatePartAttachment: vi.fn(),
  resolvePartVersionForDetach: vi.fn(),
}));

const mockedCreateDish = vi.mocked(createDish);
const mockedEditDish = vi.mocked(editDish);
const mockedListAttachablePartVersions = vi.mocked(listAttachablePartVersions);

const existingDish: {
  id: string;
  baseVersionId: string;
  baseMajorVersion: number;
  baseMinorVersion: number;
  highestMajorVersion: number;
  nextMinorVersion: number;
  isCurrent: boolean;
  values: DishFormValues;
} = {
  id: "dish-1",
  baseVersionId: "version-1",
  baseMajorVersion: 1,
  baseMinorVersion: 0,
  highestMajorVersion: 1,
  nextMinorVersion: 1,
  isCurrent: true,
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
    expect(screen.getByText("Sauce")).toBeInTheDocument();

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

    // A saved Section (has a lineageId) starts view-first — Edit reveals
    // its editable fields.
    await user.click(screen.getByRole("button", { name: "Edit section 1" }));
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

    await user.click(screen.getByRole("button", { name: "Edit section 1" }));
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

    await user.click(screen.getByRole("button", { name: "Convert to Part" }));
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

  it("shows the linked Part's pinned content inline without an expand action", async () => {
    render(<DishEditor kind="RECIPE" dish={dishWithLinkedPart} />);

    // Slice 6 correction pass §4: the header (name/version/multiplier) and
    // the resolved content both render immediately — nothing here requires
    // clicking an expand toggle first.
    expect(await screen.findByText("Nuoc Cham")).toBeInTheDocument();
    expect(screen.getByText(/× 2/)).toBeInTheDocument();
    expect(
      await screen.findByText("This Part has no saved content yet."),
    ).toBeInTheDocument();

    // No collapse/expand control exists any more for a linked Part.
    expect(
      screen.queryByRole("button", { name: "Expand" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Collapse" }),
    ).not.toBeInTheDocument();

    // The reusable Part's own content is never exposed as parent-owned
    // inline inputs — only the explicit "Link settings" action edits
    // anything here, and that's just the multiplier.
    expect(screen.queryByLabelText("Ingredient name")).not.toBeInTheDocument();
  });
});
