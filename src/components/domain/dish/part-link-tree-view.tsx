import Link from "next/link";
import { Eye } from "lucide-react";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { Badge } from "@/components/ui/badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PartLinkTree, ResolvedSection } from "@/lib/sections/service";
import { orderSectionsAndTopLevelPartLinks } from "@/lib/dishes/display-order";

/**
 * PRODUCT_SPEC.md §67.4/§68.6 (Slice 6 post-gate): a linked Part renders its
 * pinned Version's full cooking content inline, "approximately like a
 * Section," so a Recipe stays readable end-to-end without leaving the page.
 * Nested Parts render recursively with a visible indent. `scaleFactor` is
 * the caller's already-composed scale (whole-item temporary scale on the
 * detail page, 1 in the editor's read-only preview) — each level multiplies
 * in its own `multiplier` before passing down, so multipliers compose
 * across nesting (e.g. 2 cups × 1.5 × 2× temp scale = 6 cups) through the
 * same `scaledIngredientDisplay` every other quantity display uses.
 *
 * Design remediation pass: the nesting indent is expressed with the card's
 * own left border + padding rather than an inline `marginLeft` (which read
 * as visually off-center, since only the left edge shifted). Title
 * typography now matches a Section heading (same family/size/weight/
 * foreground) — a linked Part is distinguished by its chips and actions,
 * not by a different heading style. `Open Part` uses an external-link icon
 * with the app's styled `Tooltip`, never a native `title` attribute.
 */
export function PartLinkTreeView({
  tree,
  scaleFactor = 1,
  depth = 0,
}: {
  tree: PartLinkTree;
  scaleFactor?: number;
  depth?: number;
}) {
  const effectiveScale = scaleFactor * tree.multiplier;

  const header = (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <h2 className={CONTENT_CARD_TITLE_CLASS}>
          {tree.title ?? "Untitled part"}
        </h2>
        <SemanticChip semantic="neutral">Part</SemanticChip>
        <SemanticChip semantic="purple" className="tabular-nums">
          {tree.versionLabel}
        </SemanticChip>
        {tree.multiplier !== 1 && (
          <Badge variant="outline">× {tree.multiplier}</Badge>
        )}
      </div>
      {/* Slice 6 correction pass, §H: a MATERIALIZED tree (the Part was
          since deleted) has no live target to navigate to — the stored
          snapshot's own former name/version are shown above, but never
          a link, and never the internal linkState term itself. */}
      {tree.kind === "LIVE" ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`${dishBasePath("PART")}/${tree.targetDishId}`}
                target="_blank"
                aria-label="View Part"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <Eye className="size-4" aria-hidden="true" />
              </Link>
            </TooltipTrigger>
            <TooltipContent>View Part</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <span className="text-muted-foreground shrink-0 text-xs italic">
          Deleted since
        </span>
      )}
    </div>
  );

  const content = (
    <PartLinkTreeContent
      tree={tree}
      effectiveScale={effectiveScale}
      depth={depth}
    />
  );

  if (depth > 0) {
    return (
      <div className="border-border border-l-2 pl-3">
        <div className="flex flex-col gap-3">
          {header}
          {content}
        </div>
      </div>
    );
  }

  return (
    <ContentCard>
      {header}
      {content}
    </ContentCard>
  );
}

function NestedSectionBlock({
  section,
  effectiveScale,
  depth,
}: {
  section: ResolvedSection;
  effectiveScale: number;
  depth: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {section.name && <h5 className="text-sm font-medium">{section.name}</h5>}
      {section.guidanceNote && (
        <p className="text-muted-foreground text-xs italic">
          {section.guidanceNote}
        </p>
      )}
      {section.ingredients.length > 0 && (
        <ul className="flex flex-col gap-1">
          {section.ingredients.map((ingredient, i) => (
            <li key={i} className="text-sm">
              {scaledIngredientDisplay(ingredient, effectiveScale, null).line}
              {ingredient.isOptional && (
                <span className="text-muted-foreground"> (optional)</span>
              )}
              {ingredient.substitute && (
                <span className="text-muted-foreground block pl-4 text-xs">
                  Substitute:{" "}
                  {
                    scaledIngredientDisplay(
                      ingredient.substitute,
                      effectiveScale,
                      null,
                    ).line
                  }
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {section.instructions.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {section.instructions.map((instruction, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              <span>{instruction.text}</span>
            </li>
          ))}
        </ol>
      )}
      {section.partLinks.map((nested, nestedIndex) => (
        <PartLinkTreeView
          key={`${nested.targetDishId ?? "materialized"}:${nested.targetDishVersionId ?? nestedIndex}`}
          tree={nested}
          scaleFactor={effectiveScale}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

/**
 * The content body only — Sections' ingredients/instructions and nested
 * linked Parts, with no header of its own. Exported so the editor's
 * `PartLinkFields` can render pinned content directly under its own
 * relationship-specific header, rather than nesting a second, redundant
 * copy of the same title/Version/multiplier/Open-Part header this
 * component's own header (above) already renders on detail pages.
 *
 * A linked Part is itself a Recipe/Part, so its own Sections and top-level
 * PartLinks share the same interleaved persisted `position` sequence
 * (schema.prisma's `Section.position` comment) as the root item's do —
 * merged back into that single order here via the same
 * `orderSectionsAndTopLevelPartLinks` helper every other read-only
 * Section/PartLink renderer uses, rather than always rendering every
 * Section before every top-level Part.
 */
export function PartLinkTreeContent({
  tree,
  effectiveScale,
  depth,
}: {
  tree: PartLinkTree;
  effectiveScale: number;
  depth: number;
}) {
  const items = orderSectionsAndTopLevelPartLinks(
    tree.sections.map((section) => ({
      position: section.position,
      value: section,
    })),
    tree.partLinks.map((link) => ({ position: link.position, value: link })),
  );
  return (
    <>
      {items.map((item, i) =>
        item.type === "section" ? (
          <NestedSectionBlock
            key={`section-${i}`}
            section={item.section}
            effectiveScale={effectiveScale}
            depth={depth}
          />
        ) : (
          <PartLinkTreeView
            key={`partLink-${item.partLink.targetDishId ?? "materialized"}:${item.partLink.targetDishVersionId ?? i}`}
            tree={item.partLink}
            scaleFactor={effectiveScale}
            depth={depth + 1}
          />
        ),
      )}
    </>
  );
}
