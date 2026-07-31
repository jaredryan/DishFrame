import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import {
  getPartLinkDisplay,
  getPartLinkPreview,
  resolvePartVersionForDetach,
} from "@/lib/sections/actions";

vi.mock("@/lib/sections/actions", () => ({
  getPartLinkDisplay: vi.fn(),
  getPartLinkPreview: vi.fn(),
  resolvePartVersionForDetach: vi.fn(),
}));

const mockedGetPartLinkDisplay = vi.mocked(getPartLinkDisplay);
const mockedGetPartLinkPreview = vi.mocked(getPartLinkPreview);
const mockedResolvePartVersionForDetach = vi.mocked(
  resolvePartVersionForDetach,
);

type HostValues = {
  partLinks: {
    targetDishId: string;
    targetDishVersionId: string;
    multiplier: number;
  }[];
};

function Host({
  onRemove = vi.fn(),
  onDetach = vi.fn(),
}: {
  onRemove?: () => void;
  onDetach?: (content: unknown) => void;
}) {
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
            containerKind="RECIPE"
            onRemove={onRemove}
            onDetach={onDetach}
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

// Slice 6A: "Copy to Section" is the renamed, icon-swapped user-facing
// label for the existing detach behavior — the underlying call and its
// wiring back into the parent draft (via `onDetach`) must be unchanged.
describe("PartLinkFields Copy to Section", () => {
  beforeEach(() => {
    mockedGetPartLinkDisplay.mockReset();
    mockedGetPartLinkPreview.mockReset();
    mockedResolvePartVersionForDetach.mockReset();
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

  it("invokes resolvePartVersionForDetach and hands the result to onDetach", async () => {
    const user = userEvent.setup();
    const detachedContent = { sections: [], partLinks: [] };
    mockedResolvePartVersionForDetach.mockResolvedValue({
      status: "success",
      content: detachedContent,
    });
    const onDetach = vi.fn();
    render(<Host onDetach={onDetach} />);

    await screen.findByText("Nuoc Cham");
    await user.click(screen.getByRole("button", { name: "Copy to Section" }));

    await vi.waitFor(() =>
      expect(mockedResolvePartVersionForDetach).toHaveBeenCalledWith({
        targetDishVersionId: "part-1-v1",
        multiplier: 2,
      }),
    );
    expect(onDetach).toHaveBeenCalledWith(detachedContent);
  });
});

// Slice 6A: Edit Part opens the standalone Part editor in a new tab from
// the parent editor — it must never touch the parent's own pinned Version
// or draft (no embedded nested-Part editing).
describe("PartLinkFields Edit Part", () => {
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

  it("links to the standalone Part editor in a new tab, without any parent-mutating action", async () => {
    render(<Host />);

    const editLink = await screen.findByRole("link", { name: "Edit Part" });
    expect(editLink).toHaveAttribute("href", "/parts/part-1/edit");
    expect(editLink).toHaveAttribute("target", "_blank");
  });
});
