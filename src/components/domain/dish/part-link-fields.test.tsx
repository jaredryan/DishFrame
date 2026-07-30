import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import { getPartLinkDisplay, getPartLinkPreview } from "@/lib/sections/actions";

vi.mock("@/lib/sections/actions", () => ({
  getPartLinkDisplay: vi.fn(),
  getPartLinkPreview: vi.fn(),
  resolvePartVersionForDetach: vi.fn(),
}));

const mockedGetPartLinkDisplay = vi.mocked(getPartLinkDisplay);
const mockedGetPartLinkPreview = vi.mocked(getPartLinkPreview);

type HostValues = {
  partLinks: {
    targetDishId: string;
    targetDishVersionId: string;
    multiplier: number;
  }[];
};

function Host() {
  const form = useForm<HostValues>({
    defaultValues: {
      partLinks: [
        {
          targetDishId: "part-1",
          targetDishVersionId: "part-1-v1",
          multiplier: 2,
        },
      ],
    },
  });
  return (
    <FormProvider {...form}>
      <DndContext>
        <SortableContext items={["row-1"]}>
          <PartLinkFields
            id="row-1"
            prefix="partLinks.0"
            onRemove={vi.fn()}
            onDetach={vi.fn()}
          />
        </SortableContext>
      </DndContext>
    </FormProvider>
  );
}

/**
 * Design remediation pass: the linked-Part card's "Scaling" row edits the
 * multiplier as a local draft — Apply commits it to the parent draft (never
 * persisting anything itself, since the parent's own Save owns that), and
 * Reset restores the value this editing session opened with, not the
 * Part's own authored default.
 */
describe("PartLinkFields Scaling", () => {
  beforeEach(() => {
    mockedGetPartLinkDisplay.mockReset();
    mockedGetPartLinkPreview.mockReset();
    mockedGetPartLinkDisplay.mockResolvedValue({
      status: "success",
      title: "Nuoc Cham",
      majorVersion: 1,
      minorVersion: 0,
      description: null,
    });
    mockedGetPartLinkPreview.mockResolvedValue({
      status: "success",
      tree: null,
    });
  });

  it("Apply updates the parent draft's multiplier and the header chip, without persisting anything", async () => {
    const user = userEvent.setup();
    render(<Host />);

    expect(await screen.findByText("× 2")).toBeInTheDocument();

    const input = screen.getByLabelText("Scaling multiplier");
    await user.clear(input);
    await user.type(input, "3");
    // Typing alone must not touch the committed value yet.
    expect(screen.getByText("× 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("× 3")).toBeInTheDocument();
    expect(screen.queryByText("× 2")).not.toBeInTheDocument();
  });

  it("Reset restores the value the editing session opened with, not a fresh Apply", async () => {
    const user = userEvent.setup();
    render(<Host />);

    await screen.findByText("× 2");

    const input = screen.getByLabelText("Scaling multiplier");
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await screen.findByText("× 5");

    await user.clear(input);
    await user.type(input, "9");
    await user.click(screen.getByRole("button", { name: "Reset" }));

    // Restores the session-opening value (2), not the authored default and
    // not the mid-session Applied value (5).
    expect(await screen.findByText("× 2")).toBeInTheDocument();
    expect(input).toHaveValue("2");
  });
});
