import { Badge } from "@/components/ui/badge";
import { decimalToNumber } from "@/lib/dishes/format";
import type {
  MoreNutrientEntry,
  NutritionBasisValue,
  NutritionSourceProviderValue,
} from "@/lib/dishes/schema";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Slice 13 correction pass, PRODUCT_SPEC.md §54: read-only nutrition
 * display, shared by the current-Version detail page
 * (`dish-detail-view.tsx`) and both historical Version pages
 * (`versions/[versionId]/page.tsx`) — one presentation, fed whichever
 * Version's own saved values the caller loaded, so a historical page shows
 * that exact Version's nutrition rather than the Dish's current one. Plain
 * Server-Component-renderable (no "use client" — no interactivity beyond
 * the native `<details>` disclosure), matching `StageBadge`'s convention.
 */

export type NutritionSummaryData = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  nutritionBasis: NutritionBasisValue | null;
  nutritionBasisQuantity: number | null;
  nutritionBasisUnit: string | null;
  moreNutrients: MoreNutrientEntry[] | null;
  nutritionSourceProvider: NutritionSourceProviderValue | null;
  nutritionSourceName: string | null;
};

const PROVIDER_LABEL: Record<NutritionSourceProviderValue, string> = {
  USDA_FDC: "USDA FoodData Central",
};

/**
 * A raw `DishVersion` row's nutrition columns → `NutritionSummaryData` —
 * shared by every caller (current-Version detail page, both historical
 * Version pages) so the Decimal/Json → plain-value conversion happens in
 * exactly one place, matching `decimalToNumber`'s own "one shared rounding/
 * conversion point" convention elsewhere in this codebase. `moreNutrients`
 * is only ever written as `MoreNutrientEntry[]` by this app
 * (`normalizeNutritionOrThrow`, service.ts) — a plain array-shape check is
 * enough to trust it back, matching `dish-form-values.ts`'s own
 * `moreNutrientsFromJson`.
 */
export function toNutritionSummaryData(version: {
  calories: Prisma.Decimal | null;
  protein: Prisma.Decimal | null;
  carbs: Prisma.Decimal | null;
  fat: Prisma.Decimal | null;
  nutritionBasis: NutritionBasisValue | null;
  nutritionBasisQuantity: Prisma.Decimal | null;
  nutritionBasisUnit: string | null;
  moreNutrients: Prisma.JsonValue | null;
  nutritionSourceProvider: string | null;
  nutritionSourceName: string | null;
}): NutritionSummaryData {
  return {
    calories: decimalToNumber(version.calories),
    protein: decimalToNumber(version.protein),
    carbs: decimalToNumber(version.carbs),
    fat: decimalToNumber(version.fat),
    nutritionBasis: version.nutritionBasis,
    nutritionBasisQuantity: decimalToNumber(version.nutritionBasisQuantity),
    nutritionBasisUnit: version.nutritionBasisUnit,
    moreNutrients: Array.isArray(version.moreNutrients)
      ? (version.moreNutrients as unknown as MoreNutrientEntry[])
      : null,
    nutritionSourceProvider:
      version.nutritionSourceProvider as NutritionSourceProviderValue | null,
    nutritionSourceName: version.nutritionSourceName,
  };
}

function basisText(nutrition: NutritionSummaryData): string | null {
  if (nutrition.nutritionBasis === "WHOLE") return "Whole recipe";
  if (
    nutrition.nutritionBasis === "PER_OUTPUT_UNIT" &&
    nutrition.nutritionBasisQuantity != null &&
    nutrition.nutritionBasisUnit
  ) {
    return `Per ${nutrition.nutritionBasisQuantity} ${nutrition.nutritionBasisUnit}`;
  }
  return null;
}

export function NutritionSummary({
  nutrition,
}: {
  nutrition: NutritionSummaryData;
}) {
  const hasPrimary =
    nutrition.calories != null ||
    nutrition.protein != null ||
    nutrition.carbs != null ||
    nutrition.fat != null;
  const hasMore = !!nutrition.moreNutrients?.length;
  const hasSource = !!nutrition.nutritionSourceProvider;

  // §54.6: "does not require every food to provide every nutrient" —
  // extends here to the whole panel: nothing to show, nothing rendered.
  if (!hasPrimary && !hasMore) return null;

  const providerLabel = nutrition.nutritionSourceProvider
    ? PROVIDER_LABEL[nutrition.nutritionSourceProvider]
    : null;

  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-lg border px-3 py-2.5">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Nutrition
      </p>
      {hasPrimary && (
        <div className="flex flex-wrap gap-1.5">
          {nutrition.calories != null && (
            <Badge variant="outline">{nutrition.calories} cal</Badge>
          )}
          {nutrition.protein != null && (
            <Badge variant="outline">{nutrition.protein}g protein</Badge>
          )}
          {nutrition.carbs != null && (
            <Badge variant="outline">{nutrition.carbs}g carbs</Badge>
          )}
          {nutrition.fat != null && (
            <Badge variant="outline">{nutrition.fat}g fat</Badge>
          )}
        </div>
      )}
      {basisText(nutrition) && (
        <p className="text-muted-foreground text-xs">{basisText(nutrition)}</p>
      )}
      {hasMore && (
        <details className="group">
          <summary className="text-muted-foreground cursor-pointer text-xs select-none">
            More nutrients
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {nutrition.moreNutrients!.map((entry) => (
              <Badge key={entry.key} variant="outline">
                {entry.label} {entry.value}
                {entry.unit}
              </Badge>
            ))}
          </div>
        </details>
      )}
      {hasSource && (
        <p className="text-muted-foreground text-xs">
          Sourced from {providerLabel}
          {nutrition.nutritionSourceName
            ? ` — ${nutrition.nutritionSourceName}`
            : ""}
          . USDA FoodData Central values may contain errors or change over time.
        </p>
      )}
    </div>
  );
}
