"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { scaledIngredientDisplay } from "@/lib/dishes/scaled-display";
import { normalizeUnitName, type CanonicalUnit } from "@/lib/units/conversion";
import {
  setDefaultBatchScale,
  savePreferredUnitOverride,
  clearPreferredUnitOverride,
} from "@/lib/dishes/actions";
import { PartLinkTreeView } from "@/components/domain/dish/part-link-tree-view";
import type { PartLinkTree } from "@/lib/sections/service";
import type { DishKindValue } from "@/lib/dishes/schema";

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
  name: string | null;
  guidanceNote: string | null;
  ingredients: ScaledIngredientRow[];
  instructions: { id: string; text: string }[];
  partLinks: PartLinkTree[];
};

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
 * default" (`Dish.defaultBatchQuantity/Unit`) and "Save for this
 * ingredient" (`PreferredUnitOverride`), both explicitly Dish-level/
 * stable-content changes per §51.4/§53.6, never a new Version.
 */
export function ScaledVersionView({
  kind,
  dishId,
  sections,
  topLevelPartLinks,
  yieldQuantity,
  yieldUnit,
  defaultBatchQuantity,
  defaultBatchUnit,
  preferredUnitOverrides,
}: {
  kind: DishKindValue;
  dishId: string;
  sections: ScaledSectionRow[];
  topLevelPartLinks: PartLinkTree[];
  yieldQuantity: number | null;
  yieldUnit: string | null;
  defaultBatchQuantity: number | null;
  defaultBatchUnit: string | null;
  preferredUnitOverrides: { ingredientLineageId: string; unit: string }[];
}) {
  const router = useRouter();
  const authoredQuantity = yieldQuantity;
  const [targetQuantity, setTargetQuantity] = React.useState<number | null>(
    defaultBatchQuantity ?? authoredQuantity,
  );
  const [targetText, setTargetText] = React.useState(
    String(defaultBatchQuantity ?? authoredQuantity ?? ""),
  );
  const [isSavingDefault, setIsSavingDefault] = React.useState(false);
  // Accepted "for this view only" unit overrides (§53.5) — never persisted
  // unless the user explicitly also saves it (§53.6).
  const [tempUnits, setTempUnits] = React.useState<
    Record<string, CanonicalUnit>
  >({});
  const [pendingLineageId, setPendingLineageId] = React.useState<string | null>(
    null,
  );

  const savedOverrideByLineage = React.useMemo(() => {
    const map = new Map<string, CanonicalUnit>();
    for (const override of preferredUnitOverrides) {
      const unit = normalizeUnitName(override.unit);
      if (unit) map.set(override.ingredientLineageId, unit);
    }
    return map;
  }, [preferredUnitOverrides]);

  const scaleFactor =
    authoredQuantity && targetQuantity && authoredQuantity > 0
      ? targetQuantity / authoredQuantity
      : 1;
  const isDefaultSaved =
    defaultBatchQuantity != null &&
    Math.abs(defaultBatchQuantity - (targetQuantity ?? 0)) < 0.001;

  async function handleSaveDefault() {
    setIsSavingDefault(true);
    await setDefaultBatchScale(kind, {
      dishId,
      defaultBatchQuantity: targetQuantity,
      defaultBatchUnit: yieldUnit,
    });
    setIsSavingDefault(false);
    router.refresh();
  }

  async function handleResetToAuthored() {
    setTargetQuantity(authoredQuantity);
    setTargetText(String(authoredQuantity ?? ""));
    if (defaultBatchQuantity != null) {
      setIsSavingDefault(true);
      await setDefaultBatchScale(kind, {
        dishId,
        defaultBatchQuantity: null,
        defaultBatchUnit: null,
      });
      setIsSavingDefault(false);
      router.refresh();
    }
  }

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
      {authoredQuantity != null && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="scale-target-quantity"
                className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
              >
                View for
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id="scale-target-quantity"
                  inputMode="decimal"
                  className="w-20"
                  value={targetText}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setTargetText(raw);
                    const parsed = Number(raw);
                    setTargetQuantity(
                      raw.trim() !== "" && Number.isFinite(parsed) && parsed > 0
                        ? parsed
                        : null,
                    );
                  }}
                />
                <span className="text-sm">
                  {(defaultBatchQuantity != null ? defaultBatchUnit : null) ??
                    yieldUnit ??
                    "servings"}
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetToAuthored}
              disabled={isSavingDefault}
            >
              Reset to authored
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveDefault}
              disabled={
                isSavingDefault || isDefaultSaved || targetQuantity == null
              }
            >
              {isDefaultSaved ? "Default saved" : "Save as default"}
            </Button>
          </CardContent>
        </Card>
      )}

      {sections.map((section) => (
        <Card key={section.id}>
          <CardContent className="flex flex-col gap-3">
            {section.name && (
              <h2 className="font-heading text-lg font-medium">
                {section.name}
              </h2>
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

            {section.partLinks.map((tree) => (
              <PartLinkTreeView
                key={`${tree.targetDishId}:${tree.targetDishVersionId}`}
                tree={tree}
                scaleFactor={scaleFactor}
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {topLevelPartLinks.map((tree) => (
        <PartLinkTreeView
          key={`${tree.targetDishId}:${tree.targetDishVersionId}`}
          tree={tree}
          scaleFactor={scaleFactor}
        />
      ))}
    </div>
  );
}
