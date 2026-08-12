import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScaledVersionView } from "@/components/domain/dish/scaled-version-view";
import type { PartLinkTree } from "@/lib/sections/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/dishes/actions", () => ({
  savePreferredUnitOverride: vi.fn(),
  clearPreferredUnitOverride: vi.fn(),
}));

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

// Recipe/Part View regression coverage: Sections and top-level linked
// Parts share one interleaved persisted `position` sequence
// (schema.prisma's `Section.position` comment) — this must render in
// exactly that saved order, not all Sections followed by all top-level
// Parts, regardless of which array each item happens to live in.
describe("ScaledVersionView", () => {
  it("interleaves Sections and top-level linked Parts by persisted position", () => {
    render(
      <ScaledVersionView
        kind="RECIPE"
        dishId="dish-1"
        sections={[
          {
            id: "section-b",
            position: 2,
            name: "Second section",
            guidanceNote: null,
            ingredients: [],
            instructions: [],
            partLinks: [],
          },
          {
            id: "section-a",
            position: 0,
            name: "First section",
            guidanceNote: null,
            ingredients: [],
            instructions: [],
            partLinks: [],
          },
        ]}
        topLevelPartLinks={[
          { position: 1, tree: makePartLinkTree("Middle part") },
        ]}
        defaultScale={null}
        preferredUnitOverrides={[]}
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
});
