"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberField } from "@/components/domain/dish/number-field";
import { FdcSearchPicker } from "@/components/domain/dish/fdc-search-picker";
import type { FdcNutritionDetail } from "@/lib/nutrition/fdc-client";
import {
  nutritionBasisValues,
  recognizedMoreNutrientKeys,
  type MoreNutrientEntry,
  type RecognizedMoreNutrientKey,
} from "@/lib/dishes/schema";

const BASIS_LABEL: Record<(typeof nutritionBasisValues)[number], string> = {
  WHOLE: "Whole recipe/part",
  PER_OUTPUT_UNIT: "Per serving or output unit",
};

const MORE_NUTRIENT_META: Record<
  RecognizedMoreNutrientKey,
  { label: string; unit: string }
> = {
  fiber: { label: "Fiber", unit: "g" },
  sugar: { label: "Sugar", unit: "g" },
  sodium: { label: "Sodium", unit: "mg" },
  saturatedFat: { label: "Saturated fat", unit: "g" },
  cholesterol: { label: "Cholesterol", unit: "mg" },
};

function moreNutrientsToRecord(
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

function recordToMoreNutrients(
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

/** The "More nutrients" expandable panel (PRODUCT_SPEC.md §54.6) — a fixed,
 * conservative, recognized set of extra nutrients, each independently
 * editable whether it arrived from an FDC result or was typed manually. */
function MoreNutrientsFields() {
  const { control } = useFormContext();

  return (
    <details className="group">
      <summary className="text-muted-foreground cursor-pointer text-sm select-none">
        More nutrients
      </summary>
      <Controller
        control={control}
        name="moreNutrients"
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
                  <FieldLabel htmlFor={`more-nutrient-${key}`}>
                    {MORE_NUTRIENT_META[key].label}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`more-nutrient-${key}`}
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

/**
 * Slice 13: manual nutrition entry (PRODUCT_SPEC.md §54.1/§54.2) plus FDC
 * search/select/detach on top of it (§54.4). All of it is ordinary editor
 * form state — nothing here persists anything; the enclosing `DishEditor`'s
 * Save button is the only thing that ever writes a nutrition change,
 * through the same `createDish`/`editDish` path as every other field
 * (ARCHITECTURE_PROPOSAL.md Correction 5).
 */
export function NutritionFields() {
  const { control, register, setValue, watch } = useFormContext();
  const nutritionBasis = watch("nutritionBasis");
  const sourceProvider = watch("nutritionSourceProvider");
  const sourceName = watch("nutritionSourceName");

  function applyFdcNutrition(nutrition: FdcNutritionDetail) {
    setValue("calories", nutrition.calories, { shouldDirty: true });
    setValue("protein", nutrition.protein, { shouldDirty: true });
    setValue("carbs", nutrition.carbs, { shouldDirty: true });
    setValue("fat", nutrition.fat, { shouldDirty: true });
    setValue("nutritionBasis", nutrition.nutritionBasis, { shouldDirty: true });
    setValue("nutritionBasisQuantity", nutrition.nutritionBasisQuantity, {
      shouldDirty: true,
    });
    setValue("nutritionBasisUnit", nutrition.nutritionBasisUnit, {
      shouldDirty: true,
    });
    setValue("moreNutrients", nutrition.moreNutrients, { shouldDirty: true });
    setValue("nutritionSourceProvider", "USDA_FDC", { shouldDirty: true });
    setValue("nutritionSourceId", String(nutrition.fdcId), {
      shouldDirty: true,
    });
    setValue("nutritionSourceName", nutrition.sourceName, {
      shouldDirty: true,
    });
  }

  // PRODUCT_SPEC.md §54.4: "may be detached and converted to fully manual
  // data" — clears attribution only, preserving the current values/basis as
  // manual data. Purely a form-state change; if this is an already-saved
  // Version, the enclosing editor's ordinary Save persists it through
  // `editDish` like any other content edit (ARCHITECTURE_PROPOSAL.md
  // Correction 5) — there is no separate detach-persistence path.
  function detachSource() {
    setValue("nutritionSourceProvider", null, { shouldDirty: true });
    setValue("nutritionSourceId", null, { shouldDirty: true });
    setValue("nutritionSourceName", null, { shouldDirty: true });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-medium">Nutrition</h2>
        <FdcSearchPicker onApply={applyFdcNutrition} />
      </div>
      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4">
        {sourceProvider && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Sourced from USDA FoodData Central
              {sourceName ? ` — ${sourceName}` : ""}. This is sourced
              information and may contain errors or change.{" "}
              <button
                type="button"
                onClick={detachSource}
                className="text-foreground underline underline-offset-2"
              >
                Detach from source
              </button>
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="nutrition-calories">Calories</FieldLabel>
            <NumberField
              name="calories"
              id="nutrition-calories"
              placeholder="Optional"
              step="any"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="nutrition-protein">Protein (g)</FieldLabel>
            <NumberField
              name="protein"
              id="nutrition-protein"
              placeholder="Optional"
              step="any"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="nutrition-carbs">Carbs (g)</FieldLabel>
            <NumberField
              name="carbs"
              id="nutrition-carbs"
              placeholder="Optional"
              step="any"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="nutrition-fat">Fat (g)</FieldLabel>
            <NumberField
              name="fat"
              id="nutrition-fat"
              placeholder="Optional"
              step="any"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Field>
            <FieldLabel htmlFor="nutrition-basis">Basis</FieldLabel>
            <Controller
              control={control}
              name="nutritionBasis"
              render={({ field }) => (
                <Select
                  value={field.value ?? "UNSET"}
                  onValueChange={(value) => {
                    const next = value === "UNSET" ? null : value;
                    field.onChange(next);
                    if (next !== "PER_OUTPUT_UNIT") {
                      setValue("nutritionBasisQuantity", null, {
                        shouldDirty: true,
                      });
                      setValue("nutritionBasisUnit", null, {
                        shouldDirty: true,
                      });
                    }
                  }}
                >
                  <SelectTrigger id="nutrition-basis" className="w-56">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNSET">Not set</SelectItem>
                    {nutritionBasisValues.map((value) => (
                      <SelectItem key={value} value={value}>
                        {BASIS_LABEL[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {nutritionBasis === "PER_OUTPUT_UNIT" && (
            <Field>
              <FieldLabel htmlFor="nutrition-basis-quantity">
                Per amount
              </FieldLabel>
              <div className="flex gap-2">
                <NumberField
                  name="nutritionBasisQuantity"
                  id="nutrition-basis-quantity"
                  placeholder="e.g. 1"
                  step="any"
                  className="w-24"
                />
                <Input
                  placeholder="Unit, e.g. serving"
                  aria-label="Nutrition basis unit"
                  className="w-40"
                  {...register("nutritionBasisUnit")}
                />
              </div>
              <FieldDescription>
                e.g. &ldquo;1 serving&rdquo; or &ldquo;100 g&rdquo;.
              </FieldDescription>
            </Field>
          )}
        </div>

        <MoreNutrientsFields />
      </div>
    </div>
  );
}
