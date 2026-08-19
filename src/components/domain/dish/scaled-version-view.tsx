"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";
import { normalizeUnitName, type CanonicalUnit } from "@/lib/units/conversion";
import {
  savePreferredUnitOverride,
  clearPreferredUnitOverride,
} from "@/lib/dishes/actions";
import { PartLinkTreeView } from "@/components/domain/dish/part-link-tree-view";
import type { PartLinkTree } from "@/lib/sections/service";
import type { DishKindValue } from "@/lib/dishes/schema";
import {
  orderInstructionsAndPartLinks,
  orderSectionsAndTopLevelPartLinks,
} from "@/lib/dishes/display-order";

/**
 * A plain-object mirror of the Prisma Section/Ingredient/Instruction row
 * shape, with every `Prisma.Decimal` quantity already converted to a
 * plain `number` — Next.js Server→Client Component props must be
 * serializable, and a raw `Decimal` instance is not (it silently arrives
 * client-side as a plain `{}`-like object with no `toNumber` method,
 * which is exactly the bug this type exists to prevent). The
 * Server Component caller (`dish-detail-view.tsx`) is responsible for
 * doing that conversion before passing `sections` down — see its own
 * `toDisplaySections` helper.
 */
export type ScaledIngredientRow = {
  id: string;
  lineageId: string;
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
};

export type ScaledSectionRow = {
  id: string;
  // Shares one interleaved top-level ordering sequence with `topLevelPartLinks`'
  // own `position` (see schema.prisma's `Section.position` comment) — needed
  // here so the two can be merged back into one persisted display order below.
  position: number;
  name: string | null;
  guidanceNote: string | null;
  ingredients: ScaledIngredientRow[];
  // `position` shares this Section's own merged Instruction/PartLink
  // ordering sequence (see `orderInstructionsAndPartLinks`, `schema.ts`'s
  // `sectionContentSequence` doc comment) — needed here for the same
  // reason `ScaledSectionRow.position` is, one level down.
  instructions: { id: string; text: string; position: number }[];
  partLinks: PartLinkTree[];
};

export type ScaledTopLevelPartLink = { position: number; tree: PartLinkTree };

/**
 * The *current*-Version detail page's ingredient/instruction renderer —
 * PRODUCT_SPEC.md §51.1 ties temporary scaling to "the current Recipe or
 * Part Version" specifically, so this deliberately replaces
 * `VersionSectionsView` only on `dish-detail-view.tsx`, never on the
 * Version-history or comparison pages, which keep rendering historical
 * Versions with the plain, unscaled component.
 *
 * Temporary scaling (§51) and unit-conversion suggestions/overrides (§53)
 * are both purely client-side *display* concerns layered on top of the
 * same server-fetched Version content — neither ever mutates the
 * immutable Version itself. Only two actions persist anything: "Save as
 * default" (`Dish.defaultScale`) and "Save for this ingredient"
 * (`PreferredUnitOverride`), both explicitly Dish-level/stable-content
 * changes per §51.4/§53.6, never a new Version.
 */
export function ScaledVersionView({
  kind,
  dishId,
  sections,
  topLevelPartLinks,
  defaultScale,
  preferredUnitOverrides,
}: {
  kind: DishKindValue;
  dishId: string;
  sections: ScaledSectionRow[];
  topLevelPartLinks: ScaledTopLevelPartLink[];
  defaultScale: number | null;
  preferredUnitOverrides: { ingredientLineageId: string; unit: string }[];
}) {
  const router = useRouter();
  // Design remediation pass, PRODUCT_SPEC.md §51.4: the view page is not
  // Cooking Mode — no editable "View for" scaling here anymore (that
  // becomes Cooking Mode's job later). The one remaining scale source is
  // Slice 6A's saved "default scale" multiplier, edited in the
  // consolidated editor; `dish-detail-view.tsx` renders the matching
  // "Makes N servings" chip from the same multiplier.
  const scaleFactor =
    defaultScale != null && defaultScale > 0 ? defaultScale : 1;

  // Accepted "for this view only" unit overrides (§53.5) — never persisted
  // unless the user explicitly also saves it (§53.6).
  const [tempUnits, setTempUnits] = React.useState<
    Record<string, CanonicalUnit>
  >({});
  const [pendingLineageId, setPendingLineageId] = React.useState<string | null>(
    null,
  );

  // Sections and top-level PartLinks share one interleaved persisted
  // ordering sequence (schema.prisma's `Section.position` comment) — merge
  // them back into that single order here rather than rendering all
  // Sections followed by all top-level Parts. Shared with Version History
  // (`version-sections-view.tsx`) and print/public-share views
  // (`print-document.tsx`) — one merge, not three independent sorts.
  const displayItems = React.useMemo(
    () =>
      orderSectionsAndTopLevelPartLinks(
        sections.map((section) => ({
          position: section.position,
          value: section,
        })),
        topLevelPartLinks.map(({ position, tree }) => ({
          position,
          value: tree,
        })),
      ),
    [sections, topLevelPartLinks],
  );

  const savedOverrideByLineage = React.useMemo(() => {
    const map = new Map<string, CanonicalUnit>();
    for (const override of preferredUnitOverrides) {
      const unit = normalizeUnitName(override.unit);
      if (unit) map.set(override.ingredientLineageId, unit);
    }
    return map;
  }, [preferredUnitOverrides]);

  async function handleSaveOverride(lineageId: string, unit: CanonicalUnit) {
    setPendingLineageId(lineageId);
    await savePreferredUnitOverride(kind, {
      dishId,
      ingredientLineageId: lineageId,
      unit,
    });
    setPendingLineageId(null);
    router.refresh();
  }

  async function handleClearOverride(lineageId: string) {
    setPendingLineageId(lineageId);
    setTempUnits((prev) => {
      const next = { ...prev };
      delete next[lineageId];
      return next;
    });
    await clearPreferredUnitOverride(kind, {
      dishId,
      ingredientLineageId: lineageId,
    });
    setPendingLineageId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {displayItems.map((item) => {
        if (item.type === "partLink") {
          const tree = item.partLink;
          return (
            <PartLinkTreeView
              key={`toplevel:${tree.targetDishId ?? "materialized"}:${tree.targetDishVersionId ?? item.position}`}
              tree={tree}
              scaleFactor={scaleFactor}
            />
          );
        }
        const { section } = item;
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
              <ul className="flex flex-col gap-2">
                {section.ingredients
                  .filter((i) => i.substituteForIngredientId === null)
                  .map((ingredient) => {
                    const effectiveOverride =
                      tempUnits[ingredient.lineageId] ??
                      savedOverrideByLineage.get(ingredient.lineageId) ??
                      null;
                    const isSaved = savedOverrideByLineage.has(
                      ingredient.lineageId,
                    );
                    const display = scaledIngredientDisplay(
                      {
                        quantity: ingredient.quantity,
                        quantityEnd: ingredient.quantityEnd,
                        isApproximate: ingredient.isApproximate,
                        unit: ingredient.unit,
                        displayText: ingredient.displayText,
                        name: ingredient.name,
                        preparationNote: ingredient.preparationNote,
                      },
                      scaleFactor,
                      effectiveOverride,
                    );
                    const isPending = pendingLineageId === ingredient.lineageId;

                    return (
                      <li key={ingredient.id} className="text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {display.line}
                            {ingredient.isOptional && (
                              <span className="text-muted-foreground">
                                {" "}
                                (optional)
                              </span>
                            )}
                          </span>
                          {effectiveOverride && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto py-0 text-xs"
                              disabled={isPending}
                              onClick={() =>
                                handleClearOverride(ingredient.lineageId)
                              }
                            >
                              {isSaved
                                ? "Saved unit — reset"
                                : "Reset to authored unit"}
                            </Button>
                          )}
                          {!effectiveOverride && display.suggestion && (
                            <span className="text-muted-foreground flex items-center gap-1 text-xs">
                              ≈ {display.suggestion.quantity}{" "}
                              {display.suggestion.unit}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto py-0 text-xs"
                                onClick={() =>
                                  setTempUnits((prev) => ({
                                    ...prev,
                                    [ingredient.lineageId]:
                                      display.suggestion!.unit,
                                  }))
                                }
                              >
                                Use
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto py-0 text-xs"
                                disabled={isPending}
                                onClick={() =>
                                  handleSaveOverride(
                                    ingredient.lineageId,
                                    display.suggestion!.unit,
                                  )
                                }
                              >
                                Save
                              </Button>
                            </span>
                          )}
                        </div>
                        {ingredient.substitute && (
                          <span className="text-muted-foreground block pl-4 text-xs">
                            Substitute:{" "}
                            {
                              scaledIngredientDisplay(
                                {
                                  quantity: ingredient.substitute.quantity,
                                  quantityEnd:
                                    ingredient.substitute.quantityEnd,
                                  isApproximate:
                                    ingredient.substitute.isApproximate,
                                  unit: ingredient.substitute.unit,
                                  displayText:
                                    ingredient.substitute.displayText,
                                  name: ingredient.substitute.name,
                                  preparationNote:
                                    ingredient.substitute.preparationNote,
                                },
                                scaleFactor,
                                null,
                              ).line
                            }
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}

            {(() => {
              const contentItems = orderInstructionsAndPartLinks(
                section.instructions.map((instruction) => ({
                  position: instruction.position,
                  value: instruction,
                })),
                section.partLinks.map((tree) => ({
                  position: tree.position,
                  value: tree,
                })),
              );
              if (contentItems.length === 0) return null;
              const ordinalByInstructionId = new Map<string, number>();
              let nextOrdinal = 1;
              for (const item of contentItems) {
                if (item.type === "instruction") {
                  ordinalByInstructionId.set(item.instruction.id, nextOrdinal);
                  nextOrdinal += 1;
                }
              }
              return (
                <div className="flex flex-col gap-2">
                  {contentItems.map((item) =>
                    item.type === "instruction" ? (
                      <p
                        key={item.instruction.id}
                        className="flex gap-2 text-sm"
                      >
                        <span className="text-muted-foreground tabular-nums">
                          {ordinalByInstructionId.get(item.instruction.id)}.
                        </span>
                        <span>{item.instruction.text}</span>
                      </p>
                    ) : (
                      <PartLinkTreeView
                        key={`${item.partLink.targetDishId ?? "materialized"}:${item.partLink.targetDishVersionId ?? item.position}`}
                        tree={item.partLink}
                        scaleFactor={scaleFactor}
                      />
                    ),
                  )}
                </div>
              );
            })()}
          </ContentCard>
        );
      })}
    </div>
  );
}
