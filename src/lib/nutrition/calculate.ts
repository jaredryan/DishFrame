import {
  recognizedMoreNutrientKeys,
  type MoreNutrientEntry,
  type RecognizedMoreNutrientKey,
} from "@/lib/dishes/schema";

/**
 * Centralized, deterministic nutrition calculation — owner decision
 * 2026-09-17, PRODUCT_SPEC.md §54.5 ("DishFrame may calculate Recipe totals
 * from reusable Parts, local ingredients, local sauces or toppings"). Pure
 * and framework/DB-agnostic on purpose: the exact same functions power the
 * editor's live preview (client-side, fed in-progress form state) and every
 * server-rendered presentation (`src/lib/nutrition/resolve.ts`'s DB-backed
 * resolver), so there is exactly one arithmetic implementation, never two
 * that could silently drift apart.
 *
 * Hierarchy (ingredient → Section → Recipe/Part, with a nested Part
 * contributing one scaled effective value — never re-traversed as raw
 * ingredients by its container):
 *
 *   ingredientEffectiveNutrition   — one Ingredient's own entered contribution
 *   computeSectionEffective        — a Section's override, or its calculated sum
 *   computeDishEffective           — a Recipe/Part's override, or its calculated sum
 *   scaleEffectiveNutrition        — nested-Part multiplier / whole-Dish batch scaling
 */

// Decimal(10, 2) columns (Ingredient/Section/DishVersion, schema.prisma) —
// one shared rounding point, matching `normalizeQuantity`'s precedent for
// quantities (schema.ts).
export const NUTRIENT_DECIMAL_PLACES = 2;

export function normalizeNutrientAmount(value: number): number {
  return Number(value.toFixed(NUTRIENT_DECIMAL_PLACES));
}

export type NutrientTotals = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  moreNutrients: MoreNutrientEntry[] | null;
};

// The raw entered/override shape shared by an Ingredient row, a Section
// override, and the whole-Dish override — same four primary fields plus
// More nutrients DishFrame already supports elsewhere (PRODUCT_SPEC.md
// §54.1/§54.6), deliberately not a new nutrient model.
export type RawNutritionValues = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  moreNutrients: MoreNutrientEntry[] | null;
};

export type NutritionState = "NONE" | "PARTIAL" | "COMPLETE" | "OVERRIDE";

export type EffectiveNutrition = {
  totals: NutrientTotals;
  state: NutritionState;
};

export const EMPTY_NUTRITION_TOTALS: NutrientTotals = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  moreNutrients: null,
};

// "Nothing here" — no override, and no contributing ingredient/Part
// anywhere below has any nutrition data. Renders as absence everywhere
// (matching `NutritionSummary`'s pre-existing "nothing to show, nothing
// rendered" rule), never as a misleading "0 calories."
export const NONE_NUTRITION: EffectiveNutrition = {
  totals: EMPTY_NUTRITION_TOTALS,
  state: "NONE",
};

/**
 * Loosely-typed nutrition input (the editor's `NutritionValuesInput` zod
 * shape, whose fields are `optional` as well as nullable) → the strict
 * `RawNutritionValues` shape every function below expects — shared by every
 * client-side live-preview caller so "missing" and "explicitly null" both
 * normalize to `null` in exactly one place.
 */
export function toRawNutritionValues(
  input:
    | {
        calories?: number | null;
        protein?: number | null;
        carbs?: number | null;
        fat?: number | null;
        moreNutrients?: MoreNutrientEntry[] | null;
      }
    | null
    | undefined,
): RawNutritionValues {
  return {
    calories: input?.calories ?? null,
    protein: input?.protein ?? null,
    carbs: input?.carbs ?? null,
    fat: input?.fat ?? null,
    moreNutrients: input?.moreNutrients ?? null,
  };
}

function hasAnyValue(values: RawNutritionValues): boolean {
  return (
    values.calories != null ||
    values.protein != null ||
    values.carbs != null ||
    values.fat != null ||
    !!values.moreNutrients?.length
  );
}

/**
 * A single Ingredient row's own contribution — PRODUCT_SPEC.md's "nutrition
 * values represent the amount actually used in this Dish," never a
 * per-100g/normalized basis, so no scaling happens here. `NONE` (not
 * `COMPLETE` with all-null totals) when the ingredient carries no
 * nutrition data at all — completeness is tracked per contributing item,
 * not per individual nutrient (an ingredient missing only `fat` still
 * counts as "has data," matching §54.6's "does not require every food to
 * provide every nutrient").
 */
export function ingredientEffectiveNutrition(
  values: RawNutritionValues,
): EffectiveNutrition {
  if (!hasAnyValue(values)) return NONE_NUTRITION;
  return { totals: { ...values }, state: "COMPLETE" };
}

/**
 * A Section/Recipe/Part override, if active — `null` (never a "COMPLETE
 * with nothing set" result) when every field is empty, since presence of
 * any value is the sole activation signal (no separate "override enabled"
 * flag — matches how whole-Dish nutrition already worked before this
 * feature). An active override is always `state: "OVERRIDE"`: it replaces
 * calculated nutrition outright and is authoritative/complete for its own
 * level regardless of what its descendants know (owner decision, "Missing
 * / partial nutrition" §).
 */
export function overrideEffectiveNutrition(
  values: RawNutritionValues | null | undefined,
): EffectiveNutrition | null {
  if (!values || !hasAnyValue(values)) return null;
  return { totals: { ...values }, state: "OVERRIDE" };
}

function sumMoreNutrients(items: NutrientTotals[]): MoreNutrientEntry[] | null {
  const byKey = new Map<RecognizedMoreNutrientKey, MoreNutrientEntry>();
  for (const item of items) {
    for (const entry of item.moreNutrients ?? []) {
      const existing = byKey.get(entry.key);
      byKey.set(entry.key, {
        key: entry.key,
        label: entry.label,
        unit: entry.unit,
        value: (existing?.value ?? 0) + entry.value,
      });
    }
  }
  if (byKey.size === 0) return null;
  // Stable, deterministic order — the fixed recognized-key order, not
  // insertion order (which would depend on which item happened to carry a
  // given key first).
  return recognizedMoreNutrientKeys
    .filter((key) => byKey.has(key))
    .map((key) => byKey.get(key)!);
}

function sumTotals(items: NutrientTotals[]): NutrientTotals {
  function sumField(
    key: "calories" | "protein" | "carbs" | "fat",
  ): number | null {
    if (!items.some((item) => item[key] != null)) return null;
    return normalizeNutrientAmount(
      items.reduce((total, item) => total + (item[key] ?? 0), 0),
    );
  }
  return {
    calories: sumField("calories"),
    protein: sumField("protein"),
    carbs: sumField("carbs"),
    fat: sumField("fat"),
    moreNutrients: sumMoreNutrients(items),
  };
}

/**
 * Combines a level's contributing items (ingredients, and/or already-scaled
 * nested-Part contributions) into one calculated result — the shared
 * aggregation both `computeSectionEffective` and `computeDishEffective` use
 * once their own override has already been ruled out.
 *
 * Completeness is judged against EVERY item (including ones with no data at
 * all), not just the ones that contributed a number — a Section with 3
 * ingredients where only 1 has nutrition entered is `PARTIAL`, not
 * `COMPLETE`, even though a total is still shown from the one known value.
 * An empty list, or a list where nothing at all has data, is `NONE` — no
 * items means nothing was missing, and matches the legacy "nothing to show"
 * behavior for every pre-existing Recipe/Part that never used this feature.
 */
export function combineEffectiveNutrition(
  items: EffectiveNutrition[],
): EffectiveNutrition {
  const contributing = items.filter((item) => item.state !== "NONE");
  if (contributing.length === 0) return NONE_NUTRITION;
  const allComplete = items.every(
    (item) => item.state === "COMPLETE" || item.state === "OVERRIDE",
  );
  return {
    totals: sumTotals(contributing.map((item) => item.totals)),
    state: allComplete ? "COMPLETE" : "PARTIAL",
  };
}

/**
 * A Section's effective nutrition: its own override if active, otherwise
 * the calculated sum of its local ingredients plus any nested-Part
 * contributions in this Section (each already resolved to its own
 * effective value and scaled by its PartLink multiplier — see
 * `scaleEffectiveNutrition` — never re-derived from that Part's raw
 * ingredients here).
 */
export function computeSectionEffective(
  override: RawNutritionValues | null | undefined,
  ingredients: RawNutritionValues[],
  nestedPartContributions: EffectiveNutrition[] = [],
): EffectiveNutrition {
  const activeOverride = overrideEffectiveNutrition(override);
  if (activeOverride) return activeOverride;
  return combineEffectiveNutrition([
    ...ingredients.map(ingredientEffectiveNutrition),
    ...nestedPartContributions,
  ]);
}

/**
 * A Recipe/Part's effective nutrition: its own whole-Dish override if
 * active, otherwise the calculated sum of its Sections' own effective
 * values (each already override-resolved by `computeSectionEffective`) plus
 * any top-level nested-Part contributions.
 */
export function computeDishEffective(
  override: RawNutritionValues | null | undefined,
  sectionEffectives: EffectiveNutrition[],
  topLevelPartContributions: EffectiveNutrition[] = [],
): EffectiveNutrition {
  const activeOverride = overrideEffectiveNutrition(override);
  if (activeOverride) return activeOverride;
  return combineEffectiveNutrition([
    ...sectionEffectives,
    ...topLevelPartContributions,
  ]);
}

/**
 * Proportional scaling — shared by a nested Part's contribution (scaled by
 * its container's `PartLink.multiplier`, PRODUCT_SPEC.md's "nested-Part
 * scaling/yield semantics remain authoritative") and a whole-Dish batch
 * scale (`Dish.defaultScale`). A no-op for `NONE` (nothing to scale) and for
 * factor `1`.
 */
export function scaleEffectiveNutrition(
  effective: EffectiveNutrition,
  factor: number,
): EffectiveNutrition {
  if (effective.state === "NONE" || factor === 1) return effective;
  const scaleField = (value: number | null): number | null =>
    value == null ? null : normalizeNutrientAmount(value * factor);
  return {
    totals: {
      calories: scaleField(effective.totals.calories),
      protein: scaleField(effective.totals.protein),
      carbs: scaleField(effective.totals.carbs),
      fat: scaleField(effective.totals.fat),
      moreNutrients:
        effective.totals.moreNutrients?.map((entry) => ({
          ...entry,
          value: normalizeNutrientAmount(entry.value * factor),
        })) ?? null,
    },
    state: effective.state,
  };
}
