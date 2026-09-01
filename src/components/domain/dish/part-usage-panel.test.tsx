import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartUsagePanel } from "@/components/domain/dish/part-usage-panel";
import type { PartUsage } from "@/lib/dishes/queries";

vi.mock("@/lib/dishes/actions", () => ({
  propagatePartUpdate: vi.fn(async () => ({
    status: "success",
    outcomes: [{ containerDishId: "container-1", status: "updated" }],
  })),
}));

function usage(overrides: Partial<PartUsage> = {}): PartUsage {
  return {
    id: "usage-1",
    lineageId: "lineage-1",
    containerDishId: "container-1",
    containerKind: "RECIPE",
    containerTitle: "Weeknight Ragu",
    containerVersionId: "container-v1",
    containerMajorVersion: 1,
    containerMinorVersion: 0,
    targetDishVersionId: "old-version",
    sectionName: null,
    ...overrides,
  };
}

// Nav/details QA batch item 13: "Recipes using this part" (lowercase
// "part") as a major section heading, no outer wrapper card.
describe("PartUsagePanel", () => {
  it("shows the lowercase 'Recipes using this part' heading even when empty", () => {
    render(
      <PartUsagePanel usages={[]} currentVersionId="v2" partDishId="part1" />,
    );
    expect(
      screen.getByRole("heading", { name: "Recipes using this part" }),
    ).toBeInTheDocument();
  });

  it("shows the heading alongside each usage row when populated", () => {
    render(
      <PartUsagePanel
        usages={[usage()]}
        currentVersionId="v2"
        partDishId="part1"
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Recipes using this part" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Weeknight Ragu")).toBeInTheDocument();
  });

  it("propagates the current Version to every out-of-date usage via Update everywhere", async () => {
    const { propagatePartUpdate } = await import("@/lib/dishes/actions");
    const user = userEvent.setup();
    render(
      <PartUsagePanel
        usages={[usage({ targetDishVersionId: "old-version" })]}
        currentVersionId="new-version"
        partDishId="part1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Update everywhere" }));

    expect(propagatePartUpdate).toHaveBeenCalledWith({
      partDishId: "part1",
      newTargetVersionId: "new-version",
      selections: [{ containerDishId: "container-1", lineageId: "lineage-1" }],
    });
  });
});
