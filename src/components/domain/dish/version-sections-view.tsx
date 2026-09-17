import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { formatIngredientLine } from "@/lib/dishes/format";
import { PartLinkTreeView } from "@/components/domain/dish/part-link-tree-view";
import type { PartLinkTree } from "@/lib/sections/service";
import { orderSectionsAndTopLevelPartLinks } from "@/lib/dishes/display-order";

// Plain, Decimal-free shape (rather than a `Prisma.SectionGetPayload`
// type) so this component stays safely importable from a Client
// Component's module graph — callers convert Decimal quantities to plain
// numbers once, at the data-assembly boundary (server-side), not here.
export type VersionSectionRow = {
  id: string;
  name: string | null;
  guidanceNote: string | null;
  position: number;
  ingredients: {
    id: string;
    name: string;
    quantity: number | null;
    quantityEnd: number | null;
    isApproximate: boolean;
    unit: string | null;
    displayText: string | null;
    preparationNote: string | null;
    isOptional: boolean;
    substituteForIngredientId: string | null;
    substitute: {
      name: string;
      quantity: number | null;
      quantityEnd: number | null;
      isApproximate: boolean;
      unit: string | null;
      displayText: string | null;
      preparationNote: string | null;
    } | null;
  }[];
  instructions: { id: string; text: string; position: number }[];
};

/**
 * Renders one Version's Sections/Ingredients/Instructions content — shared
 * by the Version-history page (any Version, current or historical).
 * `sectionPartLinks` is already-resolved trees, keyed by each Section's own
 * index in `sections` (the caller derives both from the same ordered
 * `sections` array, so index-alignment is safe — see `dish-detail-view.tsx`'s
 * `toDisplaySections` for the equivalent current-Version pattern).
 *
 * `topLevelPartLinks` carries each tree's own `position` alongside it
 * (rather than a bare `PartLinkTree[]`) so it can be merged back against
 * `sections`' own `position` via the same `orderSectionsAndTopLevelPartLinks`
 * helper `dish-detail-view.tsx`'s current-Version renderer
 * (`ScaledVersionView`) uses — Sections and top-level PartLinks share one
 * interleaved persisted ordering sequence (schema.prisma's
 * `Section.position` comment), so they must render in that same order here
 * too, not all Sections followed by all top-level Parts.
 */
export function VersionSectionsView({
  sections,
  sectionPartLinks = [],
  topLevelPartLinks = [],
}: {
  sections: VersionSectionRow[];
  sectionPartLinks?: PartLinkTree[][];
  topLevelPartLinks?: { position: number; tree: PartLinkTree }[];
}) {
  const displayItems = orderSectionsAndTopLevelPartLinks(
    sections.map((section, index) => ({
      position: section.position,
      value: { section, index },
    })),
    topLevelPartLinks.map(({ position, tree }) => ({
      position,
      value: tree,
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      {displayItems.map((item) => {
        if (item.type === "partLink") {
          const tree = item.partLink;
          return (
            <PartLinkTreeView
              key={`toplevel:${tree.targetDishId ?? "materialized"}:${tree.targetDishVersionId ?? item.position}`}
              tree={tree}
            />
          );
        }
        const { section, index: sectionIndex } = item.section;
        return (
          <ContentCard key={section.id}>
            {section.name && (
              <h2 className={CONTENT_CARD_TITLE_CLASS}>{section.name}</h2>
            )}
            {section.guidanceNote && (
              <p className="text-muted-foreground text-sm italic">
                {section.guidanceNote}
              </p>
            )}

            {section.ingredients.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {section.ingredients
                  .filter((i) => i.substituteForIngredientId === null)
                  .map((ingredient) => (
                    <li key={ingredient.id} className="text-sm">
                      {formatIngredientLine(ingredient)}
                      {ingredient.isOptional && (
                        <span className="text-muted-foreground">
                          {" "}
                          (optional)
                        </span>
                      )}
                      {ingredient.substitute && (
                        <span className="text-muted-foreground block pl-4 text-xs">
                          Substitute:{" "}
                          {formatIngredientLine(ingredient.substitute)}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            )}

            {section.instructions.length > 0 && (
              <ol className="flex flex-col gap-2">
                {section.instructions.map((instruction, i) => (
                  <li key={instruction.id} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground tabular-nums">
                      {i + 1}.
                    </span>
                    <span>{instruction.text}</span>
                  </li>
                ))}
              </ol>
            )}

            {(sectionPartLinks[sectionIndex] ?? []).map((tree, treeIndex) => (
              <PartLinkTreeView
                key={`${tree.targetDishId ?? "materialized"}:${tree.targetDishVersionId ?? treeIndex}`}
                tree={tree}
              />
            ))}
          </ContentCard>
        );
      })}
    </div>
  );
}
