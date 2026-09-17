"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  recognizedMoreNutrientKeys,
  type MoreNutrientEntry,
  type RecognizedMoreNutrientKey,
} from "@/lib/dishes/schema";

/**
 * Slice 13, PRODUCT_SPEC.md §54.6, generalized by the composable-nutrition
 * pass (owner decision, 2026-09-17): "More nutrients" is the same fixed,
 * conservative, recognized set — and the same editing UI — at every level
 * DishFrame supports nutrition entry (whole-Dish, Section override,
 * ingredient). One shared component/metadata, parameterized by the
 * react-hook-form field path (`name`) and an id prefix for unique label
 * `htmlFor`s when several instances render on one page (one per
 * ingredient), rather than three near-identical copies.
 */
export const MORE_NUTRIENT_META: Record<
  RecognizedMoreNutrientKey,
  { label: string; unit: string }
> = {
  fiber: { label: "Fiber", unit: "g" },
  sugar: { label: "Sugar", unit: "g" },
  sodium: { label: "Sodium", unit: "mg" },
  saturatedFat: { label: "Saturated fat", unit: "g" },
  cholesterol: { label: "Cholesterol", unit: "mg" },
};

export function moreNutrientsToRecord(
  entries: MoreNutrientEntry[] | null | undefined,
): Record<RecognizedMoreNutrientKey, number | null> {
  const record = Object.fromEntries(
    recognizedMoreNutrientKeys.map((key) => [key, null]),
  ) as Record<RecognizedMoreNutrientKey, number | null>;
  for (const entry of entries ?? []) {
    if (entry && entry.key in record) record[entry.key] = entry.value;
  }
  return record;
}

export function recordToMoreNutrients(
  record: Record<RecognizedMoreNutrientKey, number | null>,
): MoreNutrientEntry[] | null {
  const entries: MoreNutrientEntry[] = recognizedMoreNutrientKeys
    .filter((key) => record[key] != null)
    .map((key) => ({
      key,
      label: MORE_NUTRIENT_META[key].label,
      value: record[key]!,
      unit: MORE_NUTRIENT_META[key].unit,
    }));
  return entries.length > 0 ? entries : null;
}

/** The "More nutrients" expandable panel — a fixed, conservative,
 * recognized set of extra nutrients, each independently editable whether
 * it arrived from an FDC result or was typed manually. `name` is the
 * react-hook-form field path to the `MoreNutrientEntry[] | null` array
 * (e.g. `"moreNutrients"` for the whole-Dish override,
 * `"nutritionOverride.moreNutrients"` for a Section override,
 * `` `${prefix}.nutrition.moreNutrients` `` for one ingredient). */
export function MoreNutrientsFields({
  name,
  idPrefix,
  summaryLabel = "More nutrients",
}: {
  name: string;
  idPrefix: string;
  summaryLabel?: string;
}) {
  const { control } = useFormContext();

  return (
    <details className="group">
      <summary className="text-muted-foreground cursor-pointer text-sm select-none">
        {summaryLabel}
      </summary>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const record = moreNutrientsToRecord(field.value);
          function setNutrient(
            key: RecognizedMoreNutrientKey,
            value: number | null,
          ) {
            field.onChange(recordToMoreNutrients({ ...record, [key]: value }));
          }
          return (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {recognizedMoreNutrientKeys.map((key) => (
                <Field key={key}>
                  <FieldLabel htmlFor={`${idPrefix}-more-nutrient-${key}`}>
                    {MORE_NUTRIENT_META[key].label}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`${idPrefix}-more-nutrient-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      className="w-24"
                      value={record[key] ?? ""}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setNutrient(key, raw === "" ? null : Number(raw));
                      }}
                    />
                    <span className="text-muted-foreground text-sm">
                      {MORE_NUTRIENT_META[key].unit}
                    </span>
                  </div>
                </Field>
              ))}
            </div>
          );
        }}
      />
    </details>
  );
}
