import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PartLinkTree } from "@/lib/sections/service";

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

  return (
    <div
      className={
        depth > 0
          ? "border-border border-l-2 pl-3"
          : "border-border bg-muted/20 rounded-lg border p-3"
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h4 className="font-heading text-foreground text-base font-medium">
              {tree.title ?? "Untitled part"}
            </h4>
            <Badge variant="outline">Part</Badge>
            <Badge variant="outline" className="tabular-nums">
              {tree.versionLabel}
            </Badge>
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
                    aria-label="Open Part"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Open Part</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <span className="text-muted-foreground shrink-0 text-xs italic">
              Deleted since
            </span>
          )}
        </div>

        <PartLinkTreeContent
          tree={tree}
          effectiveScale={effectiveScale}
          depth={depth}
        />
      </div>
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
  return (
    <>
      {tree.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="flex flex-col gap-2">
          {section.name && (
            <h5 className="text-sm font-medium">{section.name}</h5>
          )}
          {section.guidanceNote && (
            <p className="text-muted-foreground text-xs italic">
              {section.guidanceNote}
            </p>
          )}
          {section.ingredients.length > 0 && (
            <ul className="flex flex-col gap-1">
              {section.ingredients.map((ingredient, i) => (
                <li key={i} className="text-sm">
                  {
                    scaledIngredientDisplay(ingredient, effectiveScale, null)
                      .line
                  }
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
      ))}

      {tree.partLinks.map((nested, nestedIndex) => (
        <PartLinkTreeView
          key={`${nested.targetDishId ?? "materialized"}:${nested.targetDishVersionId ?? nestedIndex}`}
          tree={nested}
          scaleFactor={effectiveScale}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
