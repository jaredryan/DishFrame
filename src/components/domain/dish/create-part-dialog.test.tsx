import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreatePartDialog } from "@/components/domain/dish/create-part-dialog";
import { createDish } from "@/lib/dishes/actions";
import { listAttachablePartVersions } from "@/lib/sections/actions";

vi.mock("@/lib/dishes/actions", () => ({
  createDish: vi.fn(),
}));
vi.mock("@/lib/sections/actions", () => ({
  listAttachablePartVersions: vi.fn(),
}));

const mockedCreateDish = vi.mocked(createDish);
const mockedListAttachablePartVersions = vi.mocked(listAttachablePartVersions);

/**
 * Slice 6 correction pass §3: stable coverage for the embedded "Create Part"
 * flow's actual settled architecture (PRODUCT_SPEC.md §69) — replaces the
 * removed pre-gate copy-based service tests, which tested a primitive this
 * UI-only flow no longer uses.
 */
describe("CreatePartDialog", () => {
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

  it("creates a standalone Part, hands the link back, and closes without navigating", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<CreatePartDialog onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: "Create Part" }));
    expect(screen.getByText("Create a new Part")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Part name"), "Nuoc Cham");
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.type(screen.getByLabelText("Ingredient name"), "Fish sauce");

    await user.click(screen.getByRole("button", { name: "Create and link" }));

    expect(mockedCreateDish).toHaveBeenCalledTimes(1);
    const [kind, input] = mockedCreateDish.mock.calls[0];
    expect(kind).toBe("PART");
    expect(input.title).toBe("Nuoc Cham");
    expect(input.sections[0].ingredients[0].name).toBe("Fish sauce");

    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledWith({
      targetDishId: "new-part-1",
      targetDishVersionId: "new-part-1-v1",
    });

    // Closes the Part-creation interaction — the dialog is gone, and
    // nothing else (a save, a navigation) happened as a side effect.
    expect(screen.queryByText("Create a new Part")).not.toBeInTheDocument();
  });

  it("does not call createDish or onCreated when there is no ingredient or instruction", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(<CreatePartDialog onCreated={onCreated} />);

    await user.click(screen.getByRole("button", { name: "Create Part" }));
    await user.type(screen.getByLabelText("Part name"), "Empty Part");
    await user.click(screen.getByRole("button", { name: "Create and link" }));

    expect(
      await screen.findByText("Add at least one ingredient or instruction."),
    ).toBeInTheDocument();
    expect(mockedCreateDish).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
