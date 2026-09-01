import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SectionFields } from "@/components/domain/dish/section-fields";
import type { SectionEditorResult } from "@/components/domain/dish/section-editor-dialog";
import type { SectionInput } from "@/lib/dishes/schema";

// This bug is entirely about `SectionFields`' own collapsed rendering after
// the modal's Finish writes into the parent draft — not about dnd-kit's
// actual drag mechanics (already exercised elsewhere), so the modal is
// replaced with a single button that hands back an already-reordered
// ingredients array, the same way `handleEditorClose` receives one from a
// real drag-and-drop reorder followed by Finish section.
const REORDERED_VALUES: SectionInput = {
  name: null,
  guidanceNote: null,
  position: 0,
  ingredients: [
    ingredient("Flour"),
    ingredient("Newly added"),
    ingredient("Sugar"),
  ],
  instructions: [],
  partLinks: [],
};

function ingredient(name: string) {
  return {
    name,
    quantity: null,
    quantityEnd: null,
    isApproximate: false,
    unit: null,
    displayText: null,
    preparationNote: null,
    isOptional: false,
    substitute: null,
  };
}

vi.mock("@/components/domain/dish/convert-section-to-part-dialog", () => ({
  ConvertSectionToPartDialog: () => null,
}));
vi.mock("@/components/domain/dish/replace-section-with-part-dialog", () => ({
  ReplaceSectionWithPartDialog: () => null,
}));
vi.mock("@/components/domain/dish/section-editor-dialog", () => ({
  SectionEditorDialog: (props: {
    onClose: (result: SectionEditorResult) => void;
  }) => (
    <button
      onClick={() =>
        props.onClose({ action: "finish", values: REORDERED_VALUES })
      }
    >
      Test finish reordered
    </button>
  ),
}));

type HostValues = { sections: SectionInput[] };

function Host() {
  const form = useForm<HostValues>({
    defaultValues: {
      sections: [
        {
          name: null,
          guidanceNote: null,
          position: 0,
          ingredients: [
            ingredient("Flour"),
            ingredient("Sugar"),
            ingredient("Newly added"),
          ],
          instructions: [],
          partLinks: [],
        },
      ],
    },
  });
  const sections = useFieldArray({ control: form.control, name: "sections" });
  return (
    <FormProvider {...form}>
      <DndContext>
        <SortableContext items={["section-1"]}>
          <SectionFields
            id="section-1"
            sectionIndex={0}
            sectionNumber={1}
            onRemove={() => sections.remove(0)}
            onDuplicate={vi.fn()}
            onConvertToPart={vi.fn()}
            containerDishId={null}
            containerKind="RECIPE"
          />
        </SortableContext>
      </DndContext>
    </FormProvider>
  );
}

function render(ui: ReactElement) {
  return rtlRender(ui);
}

describe("SectionFields collapsed ingredient order", () => {
  it("reflects a reorder immediately on collapse, matching the expanded editor's order", async () => {
    const user = userEvent.setup();
    const { container } = render(<Host />);

    // Starting order, before any edit.
    let html = container.innerHTML;
    expect(html.indexOf("Flour")).toBeLessThan(html.indexOf("Sugar"));
    expect(html.indexOf("Sugar")).toBeLessThan(html.indexOf("Newly added"));

    // Simulates: reorder "Newly added" from last to position 2 inside the
    // modal, then Finish section (collapsing back to this card).
    await user.click(
      screen.getByRole("button", { name: "Test finish reordered" }),
    );

    html = container.innerHTML;
    expect(html.indexOf("Flour")).toBeLessThan(html.indexOf("Newly added"));
    expect(html.indexOf("Newly added")).toBeLessThan(html.indexOf("Sugar"));
  });
});

// Nav/details QA batch item 15: the expand/collapse chevron moved from the
// right-side action cluster to the left, before the Section label/title.
describe("SectionFields header chevron placement", () => {
  it("renders the expand/collapse toggle before the Section title", () => {
    render(<Host />);
    const toggle = screen.getByRole("button", { name: "Edit Section 1" });
    const title = screen.getByRole("heading", { name: "Section 1" });
    expect(
      toggle.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("opens the Section editor when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole("button", { name: "Edit Section 1" }));
    expect(
      screen.getByRole("button", { name: "Test finish reordered" }),
    ).toBeInTheDocument();
  });
});
