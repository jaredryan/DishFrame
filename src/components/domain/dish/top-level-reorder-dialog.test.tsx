import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TopLevelReorderDialog,
  type TopLevelReorderEntry,
} from "@/components/domain/dish/top-level-reorder-dialog";
import { getPartLinkDisplay } from "@/lib/sections/actions";

vi.mock("@/lib/sections/actions", () => ({
  getPartLinkDisplay: vi.fn(async () => ({
    status: "success",
    title: "Sauce",
    majorVersion: 1,
    minorVersion: 0,
  })),
}));

const mockedGetPartLinkDisplay = vi.mocked(getPartLinkDisplay);

const entries: TopLevelReorderEntry[] = [
  { kind: "section", fieldId: "a", label: "Chicken" },
  {
    kind: "partLink",
    fieldId: "b",
    targetDishId: "part-1",
    targetDishVersionId: "part-1-v1",
  },
  { kind: "section", fieldId: "c", label: "Rice" },
];

describe("TopLevelReorderDialog", () => {
  it("shows the given Section/linked-Part order, with a drag handle per row and a Part chip only on linked Parts", async () => {
    render(
      <TopLevelReorderDialog
        open
        onOpenChange={vi.fn()}
        kindLabel="Recipe"
        entries={entries}
        onApply={vi.fn()}
      />,
    );

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Chicken");
    expect(await screen.findByText("Sauce")).toBeInTheDocument();
    expect(rows[2]).toHaveTextContent("Rice");

    expect(screen.getAllByText("Part")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Drag to reorder Chicken" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Drag to reorder linked Part" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Drag to reorder Rice" }),
    ).toBeInTheDocument();
    expect(mockedGetPartLinkDisplay).toHaveBeenCalledWith({
      targetDishId: "part-1",
      targetDishVersionId: "part-1-v1",
    });
  });

  it("Cancel closes without applying", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TopLevelReorderDialog
        open
        onOpenChange={onOpenChange}
        kindLabel="Recipe"
        entries={entries}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Apply reports the current fieldId order and closes", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TopLevelReorderDialog
        open
        onOpenChange={onOpenChange}
        kindLabel="Recipe"
        entries={entries}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
