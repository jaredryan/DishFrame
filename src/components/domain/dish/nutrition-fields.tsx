"use client";

import * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberField } from "@/components/domain/dish/number-field";
import { FdcSearchPicker } from "@/components/domain/dish/fdc-search-picker";
import { MoreNutrientsFields } from "@/components/domain/dish/more-nutrients-fields";
import type { FdcNutritionDetail } from "@/lib/nutrition/fdc-client";
import { nutritionBasisValues } from "@/lib/dishes/schema";

const BASIS_LABEL: Record<(typeof nutritionBasisValues)[number], string> = {
  WHOLE: "Whole recipe/part",
  PER_OUTPUT_UNIT: "Per serving or output unit",
};

/**
 * Slice 13: manual nutrition entry (PRODUCT_SPEC.md §54.1/§54.2) plus FDC
 * search/select/detach on top of it (§54.4). All of it is ordinary editor
 * form state — nothing here persists anything; the enclosing `DishEditor`'s
 * Save button is the only thing that ever writes a nutrition change,
 * through the same `createDish`/`editDish` path as every other field
 * (ARCHITECTURE_PROPOSAL.md Correction 5).
 */
export function NutritionFields({
  defaultCollapsed,
}: {
  // Edit mode (an already-saved Recipe/Part) starts collapsed; create/
  // import flows preserve today's expanded-by-default behavior — mirrors
  // `DishEditor`'s own Details collapse default, independently toggleable.
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-medium">Nutrition</h2>
        <div className="flex items-center gap-1">
          <FdcSearchPicker onApply={applyFdcNutrition} />
          <TooltipIconButton
            label={collapsed ? "Expand Nutrition" : "Collapse Nutrition"}
            icon={collapsed ? ChevronDown : ChevronUp}
            onClick={() => setCollapsed((prev) => !prev)}
          />
        </div>
      </div>
      {!collapsed && (
        <div
          data-testid="nutrition-fields"
          className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4"
        >
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
                    <SelectTrigger
                      id="nutrition-basis"
                      className="w-56"
                      aria-label="Basis"
                    >
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

          <MoreNutrientsFields name="moreNutrients" idPrefix="dish" />
        </div>
      )}
    </div>
  );
}
