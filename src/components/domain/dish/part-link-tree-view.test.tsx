import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PartLinkTreeView } from "@/components/domain/dish/part-link-tree-view";
import type { PartLinkTree, ResolvedSection } from "@/lib/sections/service";

function makeSection(
  overrides: Partial<ResolvedSection> = {},
): ResolvedSection {
  return {
    position: 0,
    name: null,
    guidanceNote: null,
    ingredients: [],
    instructions: [],
    partLinks: [],
    ...overrides,
  };
}

function makeTree(overrides: Partial<PartLinkTree> = {}): PartLinkTree {
  return {
    kind: "LIVE",
    targetDishId: "dish-id",
    targetDishVersionId: "version-id",
    multiplier: 1,
    position: 0,
    title: "Part",
    versionLabel: "V1.0",
    sections: [],
    partLinks: [],
    ...overrides,
  };
}

// Regression coverage: a linked Part is itself a Recipe/Part, so its own
// Sections and top-level nested linked Parts share the same interleaved
// persisted `position` sequence as the root item's do (schema.prisma's
// `Section.position` comment) — this must render in that same order
// wherever a linked Part renders its own content, on both the regular
// Recipe/Part View and Version History (both share `PartLinkTreeView`).
describe("PartLinkTreeView nested content ordering", () => {
  it("interleaves a linked Part's own Sections and nested linked Parts by persisted position", () => {
    render(
      <PartLinkTreeView
        tree={makeTree({
          title: "Wrapper Part",
          sections: [
            makeSection({ position: 2, name: "Second nested section" }),
            makeSection({ position: 0, name: "First nested section" }),
          ],
          partLinks: [
            makeTree({
              position: 1,
              targetDishId: "middle-part",
              targetDishVersionId: "middle-part-v1",
              title: "Middle nested part",
            }),
          ],
        })}
      />,
    );

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Wrapper Part",
      "First nested section",
      "Middle nested part",
      "Second nested section",
    ]);
  });

  it("interleaves ordering recursively at a second level of Part nesting", () => {
    render(
      <PartLinkTreeView
        tree={makeTree({
          title: "Root Part",
          partLinks: [
            makeTree({
              position: 0,
              targetDishId: "wrapper-part",
              targetDishVersionId: "wrapper-part-v1",
              title: "Wrapper Part",
              sections: [makeSection({ position: 1, name: "Wrapper section" })],
              partLinks: [
                makeTree({
                  position: 0,
                  targetDishId: "inner-part",
                  targetDishVersionId: "inner-part-v1",
                  title: "Inner Part",
                }),
              ],
            }),
          ],
        })}
      />,
    );

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "Root Part",
      "Wrapper Part",
      "Inner Part",
      "Wrapper section",
    ]);
  });
});
