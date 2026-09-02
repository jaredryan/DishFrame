import { normalizeQuantity } from "@/lib/dishes/schema";

/**
 * Pure scaling/formatting functions (PRODUCT_SPEC.md §51-52) — no Prisma or
 * React dependency, mirroring `src/lib/dishes/compare.ts`'s existing
 * pattern in this codebase. Used both by the temporary whole-item scaling
 * control (§51) and, later, by Cooking Setup/session scaling (Slice 7+),
 * which is why quantity scaling itself lives here rather than inline in a
 * detail-view component.
 */

/**
 * §52.1/§52.2: a structured numeric quantity (and its range end, if any)
 * scale mathematically by the same factor. Normalized to the same 3-decimal
 * precision every other quantity write in this codebase uses
 * (`normalizeQuantity`, PRODUCT_SPEC.md §10.6a) so a scaled value never
 * carries more precision than the database could ever store.
 *
 * §52.5: counts may produce fractional calculated values ("1 egg → 1.5
 * eggs") — this function never rounds to a whole number on its own;
 * rounding for *display* is `formatCalculatedQuantity`'s job, not this
 * one's.
 */
export function scaleQuantity(quantity: number, scaleFactor: number): number {
  return normalizeQuantity(quantity * scaleFactor);
}

export type ScalableQuantity = {
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  displayText: string | null;
};

/**
 * Scales one Ingredient/Substitute's quantity fields by `scaleFactor`.
 *
 * §52.4: a free-text quantity (`displayText`, e.g. "Salt to taste") is
 * never scaled — DishFrame does not invent calculations for nonnumeric
 * amounts, so a row carrying `displayText` is returned unchanged.
 * §52.3: `isApproximate` is preserved through scaling (an approximate
 * quantity stays approximate), never dropped or inferred.
 */
export function scaleIngredientQuantity<T extends ScalableQuantity>(
  ingredient: T,
  scaleFactor: number,
): T {
  if (ingredient.displayText || ingredient.quantity == null) {
    return ingredient;
  }
  return {
    ...ingredient,
    quantity: scaleQuantity(ingredient.quantity, scaleFactor),
    quantityEnd:
      ingredient.quantityEnd == null
        ? null
        : scaleQuantity(ingredient.quantityEnd, scaleFactor),
  };
}

/**
 * Meal Plan entry target-yield → scale-factor conversion (BUILD_PLAN.md
 * Slice 15, PRODUCT_SPEC.md §76.2's "target batch yield"). A
 * `MealPlanEntry` stores an absolute target yield rather than a
 * multiplier (unlike `ScaleControl`'s client-computed grocery-source
 * scale factor) — this is the server-side equivalent of that same
 * "target / authored" division, reused by both `startSessionFromEntry`
 * (Cooking Session scale) and Meal-Plan grocery generation/resync
 * (ingredient scaling). No unit conversion is attempted (matching
 * `ScaleControl`'s own precedent) — both quantities are assumed to share
 * the source's own "Makes" unit. Falls back to 1 (the authored amount)
 * whenever either quantity is missing or the authored yield is zero.
 */
export function computeTargetYieldScaleFactor(
  targetYieldQuantity: number | null,
  authoredYieldQuantity: number | null,
): number {
  if (
    targetYieldQuantity == null ||
    authoredYieldQuantity == null ||
    authoredYieldQuantity <= 0
  ) {
    return 1;
  }
  return targetYieldQuantity / authoredYieldQuantity;
}

// PRODUCT_SPEC.md §52.6/§52.7: "familiar, practical kitchen fractions
// through eighths" — the denominators an ordinary home cook's measuring
// tools actually divide into (half/third/quarter/sixth/eighth cups and
// spoons), deliberately excluding "impractical divisions such as
// sevenths." The spec explicitly declines to mandate a specific algorithm
// ("defines the outcome rather than a specific conversion algorithm"), so
// this denominator set and tolerance are a documented implementation
// choice, not a literal spec requirement — flagged in the Slice 5 report
// for owner sanity-check, not treated as unquestionably settled.
const KITCHEN_FRACTION_DENOMINATORS = [2, 3, 4, 6, 8] as const;

// Absolute tolerance for treating a decimal as "close enough" to a nice
// fraction or whole number — small enough to never materially change the
// quantity (the spec's own wording), large enough to absorb ordinary
// floating-point noise and the 3-decimal-place storage rounding.
const FRACTION_TOLERANCE = 0.01;

/**
 * Parses a user-typed target-amount/servings string into a positive number,
 * or `null` for blank/invalid input — shared by every scale-target field
 * (grocery `DishYieldScalingField`, Cooking Setup's `TargetScaleField`) so
 * "what counts as a usable typed amount" stays one definition.
 */
export function parsePositiveAmount(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Display formatting for a derived scale factor (e.g. `1.5` → `"1.5"`). */
export function formatScaleFactor(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Finds a kitchen-practical fraction (or whole number) representation of
 * `value`, e.g. `1.5 → "1 1/2"`, `0.333 → "1/3"`. Returns `null` when no
 * denominator in `KITCHEN_FRACTION_DENOMINATORS` comes within tolerance —
 * the caller should fall back to a decimal in that case (§52.7).
 */
export function toKitchenFraction(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const negative = value < 0;
  const magnitude = Math.abs(value);
  const whole = Math.trunc(magnitude);
  const fraction = magnitude - whole;

  if (fraction < FRACTION_TOLERANCE) {
    return `${negative && whole !== 0 ? "-" : ""}${whole}`;
  }

  for (const denominator of KITCHEN_FRACTION_DENOMINATORS) {
    const numerator = Math.round(fraction * denominator);
    if (numerator === 0 || numerator === denominator) continue; // resolves to a whole number instead
    if (Math.abs(fraction - numerator / denominator) <= FRACTION_TOLERANCE) {
      const divisor = gcd(numerator, denominator);
      const simplifiedNumerator = numerator / divisor;
      const simplifiedDenominator = denominator / divisor;
      const fractionText = `${simplifiedNumerator}/${simplifiedDenominator}`;
      const sign = negative ? "-" : "";
      return whole === 0
        ? `${sign}${fractionText}`
        : `${sign}${whole} ${fractionText}`;
    }
  }

  return null;
}

/**
 * §52.7: "Calculated quantities use familiar, practical kitchen fractions
 * through eighths when readable... Otherwise, DishFrame uses a concise
 * decimal with enough precision to avoid materially changing the
 * quantity." Used for *scaled* (calculated) quantities — the unscaled,
 * authored display continues to use `formatIngredientLine`'s existing
 * verbatim-decimal style (§52.6), since the two are deliberately different
 * presentations of the same stored value.
 */
export function formatCalculatedQuantity(value: number): string {
  const fraction = toKitchenFraction(value);
  if (fraction !== null) return fraction;

  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - value) <= FRACTION_TOLERANCE) {
    return trimTrailingZeros(rounded);
  }
  // Rounding to 2 places would materially change the quantity — fall back
  // to the full stored precision (3 places, matching the DB column) rather
  // than silently losing precision (§52.7).
  return trimTrailingZeros(Math.round(value * 1000) / 1000);
}

function trimTrailingZeros(value: number): string {
  return String(value);
}
