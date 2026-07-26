import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DishEditor } from "@/components/domain/dish/dish-editor";
import { createDish, editDish } from "@/lib/dishes/actions";
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

const mockedCreateDish = vi.mocked(createDish);
const mockedEditDish = vi.mocked(editDish);

const existingDish: {
  id: string;
  currentVersionId: string;
  currentMajorVersion: number;
  currentMinorVersion: number;
  values: DishFormValues;
} = {
  id: "dish-1",
  currentVersionId: "version-1",
  currentMajorVersion: 1,
  currentMinorVersion: 0,
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
    sections: [
      {
        lineageId: "section-1",
        name: null,
        guidanceNote: null,
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
      },
    ],
  },
};

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

    const nameField = () =>
      screen.getAllByPlaceholderText("Section name (optional, e.g. Sauce)");

    expect(nameField()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    expect(nameField()).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remove section 2" }));
    expect(nameField()).toHaveLength(1);
  });

  it("renames a Section", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    const input = screen.getByPlaceholderText(
      "Section name (optional, e.g. Sauce)",
    );
    await user.type(input, "Sauce");

    expect(input).toHaveValue("Sauce");
  });

  it("reorders Sections", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add section" }));
    const [first, second] = screen.getAllByPlaceholderText(
      "Section name (optional, e.g. Sauce)",
    );
    await user.type(first, "Sauce");
    await user.type(second, "Rice");

    await user.click(screen.getByRole("button", { name: "Move Rice up" }));

    const reordered = screen.getAllByPlaceholderText(
      "Section name (optional, e.g. Sauce)",
    );
    expect(reordered[0]).toHaveValue("Rice");
    expect(reordered[1]).toHaveValue("Sauce");
  });
});

describe("DishEditor Ingredients", () => {
  it("adds and removes an Ingredient", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    const nameField = () =>
      screen.queryAllByPlaceholderText("Ingredient (e.g. Soy sauce)");

    expect(nameField()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(nameField()[0], "Salt");
    expect(nameField()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Remove Salt" }));
    expect(nameField()).toHaveLength(0);
  });

  it("reorders Ingredients", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    const [first, second] = screen.getAllByPlaceholderText(
      "Ingredient (e.g. Soy sauce)",
    );
    await user.type(first, "Salt");
    await user.type(second, "Pepper");

    await user.click(screen.getByRole("button", { name: "Move Pepper up" }));

    const reordered = screen.getAllByPlaceholderText(
      "Ingredient (e.g. Soy sauce)",
    );
    expect(reordered[0]).toHaveValue("Pepper");
    expect(reordered[1]).toHaveValue("Salt");
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

  it("reorders Instructions", async () => {
    const user = userEvent.setup();
    render(<DishEditor kind="RECIPE" />);

    await user.click(screen.getByRole("button", { name: "Add instruction" }));
    await user.click(screen.getByRole("button", { name: "Add instruction" }));
    await user.type(screen.getByLabelText("Instruction 1"), "Step A");
    await user.type(screen.getByLabelText("Instruction 2"), "Step B");

    await user.click(
      screen.getByRole("button", { name: "Move instruction 2 up" }),
    );

    expect(screen.getByLabelText("Instruction 1")).toHaveValue("Step B");
    expect(screen.getByLabelText("Instruction 2")).toHaveValue("Step A");
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
        "Add at least one ingredient or instruction before saving.",
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

  it("saves directly, without the choice dialog, when only a non-cooking field changed", async () => {
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

    const nameInput = screen.getByPlaceholderText(
      "Ingredient (e.g. Soy sauce)",
    );
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

    const nameInput = screen.getByPlaceholderText(
      "Ingredient (e.g. Soy sauce)",
    );
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
