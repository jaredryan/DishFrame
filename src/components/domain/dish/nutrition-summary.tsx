import { Badge } from "@/components/ui/badge";
import type {
  NutritionBasisValue,
  NutritionSourceProviderValue,
} from "@/lib/dishes/schema";
import type {
  EffectiveNutrition,
  NutritionState,
} from "@/lib/nutrition/calculate";

/**
 * Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md §54.5):
 * the calculated/partial/override-aware nutrition display, powered by
 * `src/lib/nutrition/calculate.ts`'s centralized `EffectiveNutrition` — the
 * one nutrition presentation every surface uses (editor Section/whole-Dish
 * summaries, current-Version detail, print, public share, Version History,
 * Version compare, and their offline equivalents). Plain
 * Server-Component-renderable (no "use client" — no interactivity beyond the
 * native `<details>` disclosure).
 */

const PROVIDER_LABEL: Record<NutritionSourceProviderValue, string> = {
  USDA_FDC: "USDA FoodData Central",
};

export type EffectiveNutritionDisplayData = EffectiveNutrition & {
  // Only meaningful when `state === "OVERRIDE"` — the whole-Dish override's
  // own basis/source attribution (unchanged Tier 1/Tier 2 fields). A
  // Section-level override has neither (no basis/source concept at that
  // level in this pass), so callers below the whole-Dish level simply omit
  // these.
  basis?: {
    nutritionBasis: NutritionBasisValue | null;
    nutritionBasisQuantity: number | null;
    nutritionBasisUnit: string | null;
  } | null;
  source?: {
    provider: NutritionSourceProviderValue;
    name: string | null;
  } | null;
};

const NUTRITION_STATE_LABEL: Record<Exclude<NutritionState, "NONE">, string> = {
  COMPLETE: "Calculated",
  PARTIAL: "Partial",
  OVERRIDE: "Manual override",
};

function effectiveBasisText(
  basis: EffectiveNutritionDisplayData["basis"],
): string | null {
  if (!basis) return null;
  if (basis.nutritionBasis === "WHOLE") return "Whole recipe/part";
  if (
    basis.nutritionBasis === "PER_OUTPUT_UNIT" &&
    basis.nutritionBasisQuantity != null &&
    basis.nutritionBasisUnit
  ) {
    return `Per ${basis.nutritionBasisQuantity} ${basis.nutritionBasisUnit}`;
  }
  return null;
}

/**
 * `title` lets the same component serve both a whole-Dish summary
 * ("Nutrition") and a per-Section summary ("Section nutrition") without a
 * second near-identical component.
 */
export function EffectiveNutritionSummary({
  nutrition,
  title = "Nutrition",
}: {
  nutrition: EffectiveNutritionDisplayData;
  title?: string;
}) {
  // §54.6-style "nothing to show, nothing rendered" — `NONE` means no
  // override and nothing below has any data.
  if (nutrition.state === "NONE") return null;

  const { totals } = nutrition;
  const hasPrimary =
    totals.calories != null ||
    totals.protein != null ||
    totals.carbs != null ||
    totals.fat != null;
  const hasMore = !!totals.moreNutrients?.length;
  const basisText = effectiveBasisText(nutrition.basis);
  const providerLabel = nutrition.source
    ? PROVIDER_LABEL[nutrition.source.provider]
    : null;

  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-lg border px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </p>
        <Badge
          variant={nutrition.state === "OVERRIDE" ? "secondary" : "outline"}
        >
          {NUTRITION_STATE_LABEL[nutrition.state]}
        </Badge>
      </div>
      {hasPrimary && (
        <div className="flex flex-wrap gap-1.5">
          {totals.calories != null && (
            <Badge variant="outline">{totals.calories} cal</Badge>
          )}
          {totals.protein != null && (
            <Badge variant="outline">{totals.protein}g protein</Badge>
          )}
          {totals.carbs != null && (
            <Badge variant="outline">{totals.carbs}g carbs</Badge>
          )}
          {totals.fat != null && (
            <Badge variant="outline">{totals.fat}g fat</Badge>
          )}
        </div>
      )}
      {nutrition.state === "PARTIAL" && (
        <p className="text-muted-foreground text-xs">
          Based on the ingredients with nutrition entered so far — some
          contributing ingredients or Parts have none yet.
        </p>
      )}
      {basisText && (
        <p className="text-muted-foreground text-xs">{basisText}</p>
      )}
      {hasMore && (
        <details className="group">
          <summary className="text-muted-foreground cursor-pointer text-xs select-none">
            More nutrients
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {totals.moreNutrients!.map((entry) => (
              <Badge key={entry.key} variant="outline">
                {entry.label} {entry.value}
                {entry.unit}
              </Badge>
            ))}
          </div>
        </details>
      )}
      {nutrition.source && (
        <p className="text-muted-foreground text-xs">
          Sourced from {providerLabel}
          {nutrition.source.name ? ` — ${nutrition.source.name}` : ""}. USDA
          FoodData Central values may contain errors or change over time.
        </p>
      )}
    </div>
  );
}
