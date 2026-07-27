/**
 * Safe measurement conversion (PRODUCT_SPEC.md §53). Pure functions, no
 * Prisma/React dependency — same rationale as `scaling.ts`.
 *
 * §53.2's three compatible families only. §53.4: DishFrame never
 * auto-converts across families (mass ↔ volume) without a trusted
 * ingredient-specific density relationship, which Tier 1/2 do not require —
 * so there is deliberately no cross-family conversion path at all here, not
 * even a guarded/unsafe one.
 */

export const unitFamilies = ["volume", "weight", "temperature"] as const;
export type UnitFamily = (typeof unitFamilies)[number];

export const canonicalUnits = [
  "tsp",
  "tbsp",
  "fl oz",
  "cup",
  "mL",
  "L",
  "oz",
  "lb",
  "g",
  "kg",
  "F",
  "C",
] as const;
export type CanonicalUnit = (typeof canonicalUnits)[number];

export const unitFamilyOf: Record<CanonicalUnit, UnitFamily> = {
  tsp: "volume",
  tbsp: "volume",
  "fl oz": "volume",
  cup: "volume",
  mL: "volume",
  L: "volume",
  oz: "weight",
  lb: "weight",
  g: "weight",
  kg: "weight",
  F: "temperature",
  C: "temperature",
};

// Volume: value of one unit in milliliters. Weight: value of one unit in
// grams. Standard US-customary/metric kitchen conversion factors — the
// same figures a conventional kitchen reference uses, not independently
// derived.
const VOLUME_ML_PER_UNIT: Record<string, number> = {
  tsp: 4.92892,
  tbsp: 14.7868,
  "fl oz": 29.5735,
  cup: 236.588,
  mL: 1,
  L: 1000,
};

const WEIGHT_G_PER_UNIT: Record<string, number> = {
  oz: 28.3495,
  lb: 453.592,
  g: 1,
  kg: 1000,
};

// A pragmatic alias list for the common ways a free-text `unit` field
// (Ingredient.unit is a plain string, not an enum — Tier 1's ingredient
// model, PRODUCT_SPEC.md §10.4) is likely to be spelled, not an exhaustive
// natural-language parser. Unrecognized spellings simply don't match any
// canonical unit, which is the correct "no suggestion" outcome (§53.1
// suggests, never forces).
const UNIT_ALIASES: Record<string, CanonicalUnit> = {
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tbs: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  "fl oz": "fl oz",
  floz: "fl oz",
  "fluid ounce": "fl oz",
  "fluid ounces": "fl oz",
  cup: "cup",
  cups: "cup",
  ml: "mL",
  milliliter: "mL",
  milliliters: "mL",
  millilitre: "mL",
  millilitres: "mL",
  l: "L",
  liter: "L",
  liters: "L",
  litre: "L",
  litres: "L",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  f: "F",
  fahrenheit: "F",
  "°f": "F",
  c: "C",
  celsius: "C",
  "°c": "C",
};

/**
 * Maps a free-text `Ingredient.unit` value to a canonical unit this module
 * recognizes, or `null` if it isn't one of the §53.2 compatible-family
 * units under any recognized spelling.
 */
export function normalizeUnitName(
  raw: string | null | undefined,
): CanonicalUnit | null {
  if (!raw) return null;
  return UNIT_ALIASES[raw.trim().toLowerCase()] ?? null;
}

function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Converts `value` from `fromUnit` to `toUnit`. Returns `null` when the two
 * units aren't in the same compatible family (§53.4 — never silently
 * guesses across families).
 */
export function convertQuantity(
  value: number,
  fromUnit: CanonicalUnit,
  toUnit: CanonicalUnit,
): number | null {
  if (fromUnit === toUnit) return value;
  const family = unitFamilyOf[fromUnit];
  if (family !== unitFamilyOf[toUnit]) return null;

  if (family === "temperature") {
    if (fromUnit === "C" && toUnit === "F") return celsiusToFahrenheit(value);
    if (fromUnit === "F" && toUnit === "C") return fahrenheitToCelsius(value);
    return value;
  }

  const table = family === "volume" ? VOLUME_ML_PER_UNIT : WEIGHT_G_PER_UNIT;
  const valueInBase = value * table[fromUnit];
  return valueInBase / table[toUnit];
}

export type UnitSuggestion = {
  quantity: number;
  unit: CanonicalUnit;
};

// §53.3's own examples never suggest moving to a smaller unit or across
// systems (US customary vs. metric) — only "simpler" (typically larger)
// units within the same natural progression a home cook already uses one
// measuring tool for. Ordered smallest to largest within each system;
// `suggestSimplifiedUnit` only ever looks "up" this list from the input
// unit's position. "fl oz" is deliberately excluded from this progression:
// it's a real, directly-convertible volume unit (`convertQuantity` still
// handles it), but it isn't part of the tsp→tbsp→cup measuring-spoon/cup
// chain a home cook actually reaches for, and including it caused a real
// bug — 6 tsp is *also* a "clean" ~1 fl oz, so it was matched before ever
// reaching the intended 2 tbsp/1 cup suggestions the spec's own examples
// name.
const VOLUME_PROGRESSIONS: CanonicalUnit[][] = [
  ["tsp", "tbsp", "cup"],
  ["mL", "L"],
];
const WEIGHT_PROGRESSIONS: CanonicalUnit[][] = [
  ["oz", "lb"],
  ["g", "kg"],
];

function progressionFor(unit: CanonicalUnit): CanonicalUnit[] | null {
  const family = unitFamilyOf[unit];
  const progressions =
    family === "volume"
      ? VOLUME_PROGRESSIONS
      : family === "weight"
        ? WEIGHT_PROGRESSIONS
        : null;
  return (
    progressions?.find((progression) => progression.includes(unit)) ?? null
  );
}

// A stricter, deliberately whole-number-only "clean" check — distinct
// from `scaling.ts`'s `toKitchenFraction`, which also accepts kitchen
// fractions (halves/thirds/quarters/sixths/eighths) for *displaying* an
// already-scaled quantity. A unit-simplification *suggestion* is only
// worth surfacing when the target unit lands on (or within floating-point
// tolerance of) a whole number — all three of §53.3's own examples are
// whole numbers, and something like "5 tsp → 1⅔ tbsp" is not actually
// simpler than "5 tsp," so it must never be suggested. Also guards against
// the same class of floating-point noise the mL/g conversion-factor
// tables introduce (e.g. `6 tsp → tbsp` computes to `1.9999946`, not
// exactly `2`) by snapping the *returned* quantity to the rounded value,
// not the raw noisy float.
const SIMPLIFICATION_TOLERANCE = 0.01;

function roundedIfWholeAndClean(value: number): number | null {
  const rounded = Math.round(value);
  if (rounded < 1) return null;
  return Math.abs(value - rounded) <= SIMPLIFICATION_TOLERANCE ? rounded : null;
}

/**
 * §53.3: suggests a simpler compatible unit for `value unit` when a nearby
 * "larger" unit in the same natural progression produces a clean whole
 * number (`6 tsp → 2 tbsp`, `16 tbsp → 1 cup`, `1,000 g → 1 kg`). Returns
 * `null` when no such simplification applies — DishFrame suggests, it
 * never forces (§53.1), so returning `null` simply means "show nothing."
 */
export function suggestSimplifiedUnit(
  value: number,
  unit: CanonicalUnit,
): UnitSuggestion | null {
  const progression = progressionFor(unit);
  if (!progression) return null;
  const startIndex = progression.indexOf(unit);

  for (let i = startIndex + 1; i < progression.length; i++) {
    const candidate = progression[i];
    const converted = convertQuantity(value, unit, candidate);
    if (converted == null) continue;
    const clean = roundedIfWholeAndClean(converted);
    if (clean != null) {
      return { quantity: clean, unit: candidate };
    }
  }
  return null;
}
