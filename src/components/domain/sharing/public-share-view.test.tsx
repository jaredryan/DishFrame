import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicShareView } from "@/components/domain/sharing/public-share-view";
import type {
  PublicShareContent,
  PublicSection,
  PublicPartLinkNode,
} from "@/lib/sharing/public-dto";

function baseContent(
  overrides: Partial<PublicShareContent> = {},
): PublicShareContent {
  return {
    dishKind: "RECIPE",
    title: "Ginger Soy Bowl",
    versionLabel: "V1.0",
    description: null,
    imageAssetId: null,
    cuisine: null,
    tags: [],
    flavorProfiles: [],
    yieldQuantity: null,
    yieldUnit: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    nutrition: null,
    aggregateRating: null,
    ratingCount: null,
    sections: [],
    topLevelPartLinks: [],
    ...overrides,
  };
}

function section(overrides: Partial<PublicSection> = {}): PublicSection {
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

function partLink(
  overrides: Partial<PublicPartLinkNode> = {},
): PublicPartLinkNode {
  return {
    position: 0,
    title: "Nuoc Cham",
    versionLabel: "V1.0",
    multiplier: 1,
    description: null,
    imageAssetId: null,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    difficulty: null,
    sections: [],
    partLinks: [],
    ...overrides,
  };
}

const imageSrc = (assetId: string) => `/api/images/${assetId}`;

describe("PublicShareView", () => {
  it("renders the title", () => {
    render(
      <PublicShareView
        content={baseContent()}
        mode="CURRENT"
        creatorName={null}
        imageSrc={imageSrc}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Ginger Soy Bowl" }),
    ).toBeInTheDocument();
  });

  // Regression coverage: Sections and top-level linked Parts share one
  // interleaved persisted `position` sequence (schema.prisma's
  // `Section.position` comment) — the visible shared page must match the
  // author's persisted order exactly, not all Sections followed by all
  // top-level Parts. The linked Part's title renders as plain text (not a
  // heading) in this view, so DOM order is checked directly via
  // `compareDocumentPosition` rather than a heading-role query.
  it("interleaves Sections and top-level linked Parts by persisted position", () => {
    render(
      <PublicShareView
        content={baseContent({
          sections: [
            section({ position: 2, name: "Second section" }),
            section({ position: 0, name: "First section" }),
          ],
          topLevelPartLinks: [partLink({ position: 1, title: "Middle part" })],
        })}
        mode="CURRENT"
        creatorName={null}
        imageSrc={imageSrc}
      />,
    );

    const firstSectionEl = screen.getByText("First section");
    const middlePartEl = screen.getByText("Middle part");
    const secondSectionEl = screen.getByText("Second section");

    expect(
      firstSectionEl.compareDocumentPosition(middlePartEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      middlePartEl.compareDocumentPosition(secondSectionEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("interleaves a linked Part's own Sections and nested linked Parts by position too", () => {
    render(
      <PublicShareView
        content={baseContent({
          topLevelPartLinks: [
            partLink({
              title: "Wrapper Part",
              sections: [section({ position: 1, name: "Wrapper section" })],
              partLinks: [partLink({ position: 0, title: "Inner part" })],
            }),
          ],
        })}
        mode="CURRENT"
        creatorName={null}
        imageSrc={imageSrc}
      />,
    );

    const innerPartEl = screen.getByText("Inner part");
    const wrapperSectionEl = screen.getByText("Wrapper section");
    expect(
      innerPartEl.compareDocumentPosition(wrapperSectionEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
