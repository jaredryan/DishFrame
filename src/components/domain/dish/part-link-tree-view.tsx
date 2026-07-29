import Link from "next/link";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";
import { dishBasePath } from "@/components/domain/dish/dish-card";
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
      className="border-primary/30 bg-muted/20 flex flex-col gap-3 rounded-lg border border-dashed p-3"
      style={depth > 0 ? { marginLeft: 16 } : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-primary text-sm font-medium">
          {tree.title ?? "Untitled part"}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {tree.versionLabel}
        </span>
        {tree.multiplier !== 1 && (
          <span className="text-muted-foreground text-xs">
            × {tree.multiplier}
          </span>
        )}
        {/* Slice 6 correction pass, §H: a MATERIALIZED tree (the Part was
            since deleted) has no live target to navigate to — the stored
            snapshot's own former name/version are shown above, but never a
            link, and never the internal linkState term itself. */}
        {tree.kind === "LIVE" ? (
          <Link
            href={`${dishBasePath("PART")}/${tree.targetDishId}`}
            target="_blank"
            className="text-primary text-xs hover:underline"
          >
            Open Part
          </Link>
        ) : (
          <span className="text-muted-foreground text-xs italic">
            Deleted since
          </span>
        )}
      </div>

      {tree.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="flex flex-col gap-2">
          {section.name && (
            <h4 className="text-sm font-medium">{section.name}</h4>
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
    </div>
  );
}
