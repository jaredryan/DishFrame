import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { ConvertSectionToPartDialog } from "@/components/domain/dish/convert-section-to-part-dialog";
import { createDish } from "@/lib/dishes/actions";
import { listAttachablePartVersions } from "@/lib/sections/actions";
import type { IngredientInput, InstructionInput } from "@/lib/dishes/schema";

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(),
}));
vi.mock("@/lib/sections/actions", () => ({
  listAttachablePartVersions: vi.fn(),
}));

const mockedCreateDish = vi.mocked(createDish);
const mockedListAttachablePartVersions = vi.mocked(listAttachablePartVersions);

type HostValues = {
  sections: {
    ingredients: IngredientInput[];
    instructions: InstructionInput[];
  }[];
};

// A minimal host standing in for `SectionFields`'s ambient parent form —
// `ConvertSectionToPartDialog` reads the Section's current draft content
// via `useFormContext().getValues(prefix)`, so the test needs a real form
// context at the same `sections.0` prefix the real editor uses.
function Host({
  defaultValues,
  onConverted,
}: {
  defaultValues: HostValues;
  onConverted: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
}) {
  const form = useForm<HostValues>({ defaultValues });
  return (
    <FormProvider {...form}>
      <ConvertSectionToPartDialog
        prefix="sections.0"
        sectionLabel="Sauce"
        defaultName="Sauce"
        onConverted={onConverted}
      />
    </FormProvider>
  );
}

const BLANK_INGREDIENT: IngredientInput = {
  name: "",
  quantity: null,
  quantityEnd: null,
  isApproximate: false,
  unit: null,
  displayText: null,
  preparationNote: null,
  isOptional: false,
  substitute: null,
};

/**
 * Slice 6 correction pass §3: stable coverage for the embedded "Convert
 * Section to Part" flow's actual settled architecture (PRODUCT_SPEC.md §69).
 */
describe("ConvertSectionToPartDialog", () => {
  beforeEach(() => {
    mockedCreateDish.mockReset();
    mockedListAttachablePartVersions.mockReset();
    mockedCreateDish.mockResolvedValue({
      status: "success",
      dishId: "new-part-1",
    });
    mockedListAttachablePartVersions.mockResolvedValue({
      status: "success",
      versions: [{ id: "new-part-1-v1", majorVersion: 1, minorVersion: 0 }],
    });
  });

  it("prefills the name from the Section, converts its content, and hands the link back without navigating", async () => {
    const user = userEvent.setup();
    const onConverted = vi.fn();
    render(
      <Host
        defaultValues={{
          sections: [
            {
              ingredients: [{ ...BLANK_INGREDIENT, name: "Fish sauce" }],
              instructions: [{ text: "Whisk together." }],
            },
          ],
        }}
        onConverted={onConverted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Convert to Part" }));
    expect(screen.getByLabelText("Part name")).toHaveValue("Sauce");

    await user.clear(screen.getByLabelText("Part name"));
    await user.type(screen.getByLabelText("Part name"), "Nuoc Cham");
    await user.type(
      screen.getByLabelText("Description"),
      "The house dipping sauce.",
    );
    await user.click(screen.getByRole("button", { name: "Convert" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [kind, input] = mockedCreateDish.mock.calls[0];
    expect(kind).toBe("PART");
    expect(input.title).toBe("Nuoc Cham");
    expect(input.description).toBe("The house dipping sauce.");
    expect(input.sections[0].ingredients[0].name).toBe("Fish sauce");
    expect(input.sections[0].instructions[0].text).toBe("Whisk together.");

    expect(onConverted).toHaveBeenCalledTimes(1);
    expect(onConverted).toHaveBeenCalledWith({
      targetDishId: "new-part-1",
      targetDishVersionId: "new-part-1-v1",
    });

    // Closes the conversion interaction — no "Save a copy as Part" action
    // exists anywhere in this flow (the removed pre-gate primitive).
    expect(
      screen.queryByText(/Convert Sauce to a Part/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Save a copy as Part/ }),
    ).not.toBeInTheDocument();
  });

  it("rejects converting a Section with no ingredients or instructions", async () => {
    const user = userEvent.setup();
    const onConverted = vi.fn();
    render(
      <Host
        defaultValues={{ sections: [{ ingredients: [], instructions: [] }] }}
        onConverted={onConverted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Convert to Part" }));
    await user.click(screen.getByRole("button", { name: "Convert" }));

    expect(
      await screen.findByText(
        "This section has no ingredients or instructions to convert.",
      ),
    ).toBeInTheDocument();
    expect(mockedCreateDish).not.toHaveBeenCalled();
    expect(onConverted).not.toHaveBeenCalled();
  });
});
