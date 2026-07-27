import { formatIngredientLine } from "@/lib/dishes/format";
import {
  scaleIngredientQuantity,
  formatCalculatedQuantity,
} from "@/lib/units/scaling";
import {
  normalizeUnitName,
  convertQuantity,
  suggestSimplifiedUnit,
  type CanonicalUnit,
  type UnitSuggestion,
} from "@/lib/units/conversion";

/**
 * Combines Slice 5's scaling (§51/§52) and unit-conversion (§53) pure
 * functions into one display-ready result for a single Ingredient/
 * Substitute row — the one place the Recipe/Part detail view's temporary-
 * scaling control needs to reach into both `src/lib/units/` modules at
 * once. Kept in `src/lib/dishes/` rather than `src/lib/units/` because it
 * knows about the Ingredient row shape (name/preparationNote/etc.) and
 * calls `format.ts`'s shared line-assembly — `src/lib/units/` itself stays
 * generic, with no notion of "an ingredient."
 */

export type DisplayableIngredient = {
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  name: string | null;
  preparationNote: string | null;
};

export type ScaledIngredientDisplay = {
  /** The fully assembled display line — quantity, unit, name, note. */
  line: string;
  /** A simplification suggestion for the *displayed* quantity/unit, when
   * one applies and no preferred-unit override is already in effect
   * (§53.3) — `null` otherwise. */
  suggestion: UnitSuggestion | null;
  /** The canonical unit family member the ingredient's stored unit
   * resolved to, if recognized — `null` for a free-text/unrecognized
   * unit, in which case there is nothing to convert or suggest. */
  canonicalUnit: CanonicalUnit | null;
};

/**
 * `scaleFactor`: 1 means "no active scaling" — the line is rendered in
 * authored style (§52.6) rather than calculated style (§52.7), matching
 * the base Recipe view before any temporary scaling is applied.
 * `overrideUnit`: a saved `PreferredUnitOverride` for this ingredient's
 * lineage, if any (§53.6) — applied unconditionally when the stored unit
 * is convertible to it; a suggestion is never shown once an override is
 * already in effect (the override *is* the accepted answer).
 */
export function scaledIngredientDisplay(
  ingredient: DisplayableIngredient,
  scaleFactor: number,
  overrideUnit: CanonicalUnit | null,
): ScaledIngredientDisplay {
  const scaled = scaleIngredientQuantity(ingredient, scaleFactor);
  const canonicalUnit = normalizeUnitName(scaled.unit);

  let displayQuantity = scaled.quantity;
  let displayQuantityEnd = scaled.quantityEnd;
  let displayUnit = scaled.unit;
  let overrideApplied = false;

  if (
    canonicalUnit &&
    overrideUnit &&
    overrideUnit !== canonicalUnit &&
    displayQuantity != null
  ) {
    const converted = convertQuantity(
      displayQuantity,
      canonicalUnit,
      overrideUnit,
    );
    const convertedEnd =
      displayQuantityEnd == null
        ? null
        : convertQuantity(displayQuantityEnd, canonicalUnit, overrideUnit);
    if (converted != null) {
      displayQuantity = converted;
      displayQuantityEnd = convertedEnd;
      displayUnit = overrideUnit;
      overrideApplied = true;
    }
  }

  const usingCalculatedStyle = scaleFactor !== 1 || overrideApplied;

  const line = formatIngredientLine(
    {
      ...scaled,
      quantity: displayQuantity,
      quantityEnd: displayQuantityEnd,
      unit: displayUnit,
    },
    usingCalculatedStyle ? formatCalculatedQuantity : undefined,
  );

  const suggestion =
    !overrideApplied && canonicalUnit && displayQuantity != null
      ? suggestSimplifiedUnit(displayQuantity, canonicalUnit)
      : null;

  return { line, suggestion, canonicalUnit };
}
