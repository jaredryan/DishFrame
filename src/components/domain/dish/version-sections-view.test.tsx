import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VersionSectionsView } from "@/components/domain/dish/version-sections-view";
import type { Prisma } from "@/generated/prisma/client";
import type { PartLinkTree } from "@/lib/sections/service";

type VersionSectionRow = Prisma.SectionGetPayload<{
  include: {
    ingredients: { include: { substitute: true } };
    instructions: true;
  };
}>;

function makeSection(
  overrides: Partial<VersionSectionRow> = {},
): VersionSectionRow {
  return {
    id: "section-id",
    lineageId: "section-lineage",
    dishVersionId: "version-1",
    name: null,
    guidanceNote: null,
    position: 0,
    ingredients: [],
    instructions: [],
    ...overrides,
  };
}

function makePartLinkTree(title: string): PartLinkTree {
  return {
    kind: "LIVE",
    targetDishId: `dish-${title}`,
    targetDishVersionId: `version-${title}`,
    multiplier: 1,
    // Unused here — this test's own top-level ordering comes from the
    // `{position, tree}` wrapper passed via `topLevelPartLinks`, not this
    // tree's own `position` field (see `PartLinkTree.position`'s doc
    // comment, `sections/service.ts`).
    position: 0,
    title,
    versionLabel: "V1.0",
    sections: [],
    partLinks: [],
  };
}

// Version History regression coverage: Sections and top-level linked Parts
// share one interleaved persisted `position` sequence (schema.prisma's
// `Section.position` comment) — this must render in exactly that saved
// order, not all Sections followed by all top-level Parts.
describe("VersionSectionsView", () => {
  it("interleaves Sections and top-level linked Parts by persisted position", () => {
    render(
      <VersionSectionsView
        sections={[
          makeSection({
            id: "section-b",
            lineageId: "b",
            position: 2,
            name: "Second section",
          }),
          makeSection({
            id: "section-a",
            lineageId: "a",
            position: 0,
            name: "First section",
          }),
        ]}
        topLevelPartLinks={[
          { position: 1, tree: makePartLinkTree("Middle part") },
        ]}
      />,
    );

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "First section",
      "Middle part",
      "Second section",
    ]);
  });

  it("still looks up a Section's own nested linked Parts by its original array index after reordering", () => {
    render(
      <VersionSectionsView
        sections={[
          makeSection({
            id: "section-b",
            lineageId: "b",
            position: 1,
            name: "Second section",
          }),
          makeSection({
            id: "section-a",
            lineageId: "a",
            position: 0,
            name: "First section",
          }),
        ]}
        sectionPartLinks={[
          [makePartLinkTree("Nested in second")],
          [makePartLinkTree("Nested in first")],
        ]}
      />,
    );

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      "First section",
      "Nested in first",
      "Second section",
      "Nested in second",
    ]);
  });
});
