import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrintDocument } from "@/components/domain/print/print-document";
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
    cuisines: [],
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

describe("PrintDocument", () => {
  it("renders the title and a Version badge", () => {
    render(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Ginger Soy Bowl" }),
    ).toBeInTheDocument();
    expect(screen.getByText("V1.0")).toBeInTheDocument();
  });

  // Nav/details QA batch item 5: a Part prints with the same content
  // treatment as a Recipe — no large outline/eyebrow — except for a compact
  // "Part" badge immediately before the Version badge, near the title.
  it("shows a compact Part badge before the Version badge only when printing a Part", () => {
    const { rerender } = render(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    expect(screen.queryByText("Part")).not.toBeInTheDocument();

    rerender(
      <PrintDocument
        content={baseContent()}
        kindLabel="Part"
        imageSrc={imageSrc}
      />,
    );
    const badges = screen.getAllByText(/^(Part|V1\.0)$/);
    expect(badges.map((b) => b.textContent)).toEqual(["Part", "V1.0"]);
  });

  it("renders Sections and their Ingredients/Instructions in authored order", () => {
    render(
      <PrintDocument
        content={baseContent({
          sections: [
            section({
              position: 0,
              name: "Broth",
              ingredients: [
                {
                  name: "Ginger",
                  quantity: 1,
                  quantityEnd: null,
                  isApproximate: false,
                  unit: "tbsp",
                  displayText: null,
                  preparationNote: "minced",
                  isOptional: true,
                  substitute: {
                    name: "Ground ginger",
                    quantity: 0.5,
                    quantityEnd: null,
                    isApproximate: false,
                    unit: "tsp",
                    displayText: null,
                    preparationNote: null,
                  },
                },
              ],
              instructions: [{ text: "Simmer the broth." }],
            }),
            section({
              position: 1,
              name: "Toppings",
              instructions: [{ text: "Add toppings." }],
            }),
          ],
        })}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Broth", "Toppings"]);

    expect(screen.getByText(/1 tbsp Ginger, minced/)).toBeInTheDocument();
    expect(screen.getByText("(optional)")).toBeInTheDocument();
    expect(
      screen.getByText(/Substitute: 0\.5 tsp Ground ginger/),
    ).toBeInTheDocument();
    expect(screen.getByText("Simmer the broth.")).toBeInTheDocument();
    expect(screen.getByText("Add toppings.")).toBeInTheDocument();
  });

  it("renders nested linked Parts recursively, visually distinct from root Sections", () => {
    render(
      <PrintDocument
        content={baseContent({
          topLevelPartLinks: [
            partLink({
              title: "Wrapper Part",
              sections: [section()],
              partLinks: [partLink({ title: "Nested Part" })],
            }),
          ],
        })}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );

    expect(screen.getByText("Wrapper Part")).toBeInTheDocument();
    expect(screen.getByText("Nested Part")).toBeInTheDocument();
    expect(screen.getAllByText("Part")).toHaveLength(2);
  });

  // Regression coverage: Sections and top-level linked Parts share one
  // interleaved persisted `position` sequence (schema.prisma's
  // `Section.position` comment) — this must render in exactly that saved
  // order, not all Sections followed by all top-level Parts.
  it("interleaves Sections and top-level linked Parts by persisted position", () => {
    render(
      <PrintDocument
        content={baseContent({
          sections: [
            section({ position: 2, name: "Second section" }),
            section({ position: 0, name: "First section" }),
          ],
          topLevelPartLinks: [partLink({ position: 1, title: "Middle part" })],
        })}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );

    const headingTexts = screen
      .getAllByRole("heading")
      .map((h) => h.textContent ?? "");
    const firstIndex = headingTexts.findIndex((t) =>
      t.includes("First section"),
    );
    const middleIndex = headingTexts.findIndex((t) =>
      t.includes("Middle part"),
    );
    const secondIndex = headingTexts.findIndex((t) =>
      t.includes("Second section"),
    );
    expect(firstIndex).toBeGreaterThanOrEqual(0);
    expect(firstIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(secondIndex);
  });

  it("interleaves a linked Part's own Sections and nested linked Parts by position too", () => {
    render(
      <PrintDocument
        content={baseContent({
          topLevelPartLinks: [
            partLink({
              title: "Wrapper Part",
              sections: [section({ position: 1, name: "Wrapper section" })],
              partLinks: [partLink({ position: 0, title: "Inner part" })],
            }),
          ],
        })}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );

    const headingTexts = screen
      .getAllByRole("heading")
      .map((h) => h.textContent ?? "");
    const innerIndex = headingTexts.findIndex((t) => t.includes("Inner part"));
    const wrapperSectionIndex = headingTexts.findIndex((t) =>
      t.includes("Wrapper section"),
    );
    expect(innerIndex).toBeGreaterThanOrEqual(0);
    expect(innerIndex).toBeLessThan(wrapperSectionIndex);
  });

  it("shows nutrition only when present", () => {
    const { rerender } = render(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    expect(screen.queryByText("Nutrition")).not.toBeInTheDocument();

    rerender(
      <PrintDocument
        content={baseContent({
          nutrition: {
            calories: 320,
            protein: 12,
            carbs: 40,
            fat: 8,
            basis: null,
            basisQuantity: null,
            basisUnit: null,
            sourceName: "USDA",
          },
        })}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    expect(screen.getByText("Nutrition")).toBeInTheDocument();
    expect(screen.getByText(/320 cal/)).toBeInTheDocument();
    expect(screen.getByText(/Source: USDA/)).toBeInTheDocument();
  });

  it("shows an image only when imageAssetId is present, via the caller's imageSrc", () => {
    const { rerender, container } = render(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();

    rerender(
      <PrintDocument
        content={baseContent({ imageAssetId: "asset-1" })}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/images/asset-1");
  });

  it("shows the historical-Version note only when supplied", () => {
    const { rerender } = render(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        imageSrc={imageSrc}
      />,
    );
    expect(screen.queryByText(/frozen/)).not.toBeInTheDocument();

    rerender(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        historicalNote="Historical version — this content is frozen and will not change."
        imageSrc={imageSrc}
      />,
    );
    expect(screen.getByText(/frozen/)).toBeInTheDocument();
  });

  it("includes badgeLabel and creatorName next to the Version badge only when supplied (public share only)", () => {
    render(
      <PrintDocument
        content={baseContent()}
        kindLabel="Recipe"
        badgeLabel="Fixed snapshot"
        creatorName="Alex"
        imageSrc={imageSrc}
      />,
    );
    expect(
      screen.getByText("Fixed snapshot · Shared by Alex"),
    ).toBeInTheDocument();
  });
});
