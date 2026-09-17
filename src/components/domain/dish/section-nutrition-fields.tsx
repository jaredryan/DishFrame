"use client";

import * as React from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  EffectiveNutritionSummary,
  type EffectiveNutritionDisplayData,
} from "@/components/domain/dish/nutrition-summary";
import {
  usePartLinkEffectiveNutritionMap,
  lookupPartLinkNutrition,
} from "@/components/domain/dish/use-part-link-nutrition";
import { MoreNutrientsFields } from "@/components/domain/dish/more-nutrients-fields";
import {
  computeSectionEffective,
  scaleEffectiveNutrition,
  toRawNutritionValues,
} from "@/lib/nutrition/calculate";
import type {
  IngredientInput,
  NutritionValuesInput,
  PartLinkInput,
} from "@/lib/dishes/schema";

/**
 * Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md §54.5):
 * a Section's calculated nutrition (live preview, from this Section's own
 * `ingredients` and nested `partLinks` — the same `calculate.ts` logic the
 * server uses) plus its optional manual override. Reads/writes relative to
 * the CURRENT form root, so it works both inside `SectionEditorDialog`
 * (root = the Section itself, `ingredients`/`partLinks` unprefixed) — the
 * only place this is currently rendered.
 */
export function SectionNutritionFields() {
  const { control, register, setValue } = useFormContext();
  const idPrefix = React.useId();

  const watchedIngredients: IngredientInput[] | undefined = useWatch({
    control,
    name: "ingredients",
  });
  const watchedPartLinks: PartLinkInput[] | undefined = useWatch({
    control,
    name: "partLinks",
  });
  const nutritionOverride: NutritionValuesInput | null | undefined = useWatch({
    control,
    name: "nutritionOverride",
  });
  const ingredients = React.useMemo(
    () => watchedIngredients ?? [],
    [watchedIngredients],
  );
  const partLinks = React.useMemo(
    () => watchedPartLinks ?? [],
    [watchedPartLinks],
  );

  const nutritionMap = usePartLinkEffectiveNutritionMap(partLinks);

  const effective = React.useMemo(() => {
    const nestedContributions = partLinks.map((link) => {
      const target = lookupPartLinkNutrition(nutritionMap, link);
      return scaleEffectiveNutrition(target, link.multiplier ?? 1);
    });
    return computeSectionEffective(
      toRawNutritionValues(nutritionOverride),
      ingredients.map((ingredient) =>
        toRawNutritionValues(ingredient.nutrition),
      ),
      nestedContributions,
    );
  }, [ingredients, partLinks, nutritionMap, nutritionOverride]);

  const displayData: EffectiveNutritionDisplayData = effective;
  const overrideActive = !!nutritionOverride;

  function enableOverride() {
    setValue(
      "nutritionOverride",
      {
        calories: null,
        protein: null,
        carbs: null,
        fat: null,
        moreNutrients: null,
      },
      { shouldDirty: true },
    );
  }

  function clearOverride() {
    setValue("nutritionOverride", null, { shouldDirty: true });
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Section nutrition
      </h4>
      <EffectiveNutritionSummary
        nutrition={displayData}
        title="Section nutrition"
      />
      {!overrideActive ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={enableOverride}
        >
          Set manual override for this Section
        </Button>
      ) : (
        <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Replaces the calculated total above for this Section.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearOverride}
            >
              Remove override
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-section-calories`}>
                Calories
              </FieldLabel>
              <Input
                id={`${idPrefix}-section-calories`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                placeholder="Optional"
                {...register("nutritionOverride.calories", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-section-protein`}>
                Protein (g)
              </FieldLabel>
              <Input
                id={`${idPrefix}-section-protein`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                placeholder="Optional"
                {...register("nutritionOverride.protein", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-section-carbs`}>
                Carbs (g)
              </FieldLabel>
              <Input
                id={`${idPrefix}-section-carbs`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                placeholder="Optional"
                {...register("nutritionOverride.carbs", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-section-fat`}>
                Fat (g)
              </FieldLabel>
              <Input
                id={`${idPrefix}-section-fat`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                placeholder="Optional"
                {...register("nutritionOverride.fat", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </Field>
          </div>
          <MoreNutrientsFields
            name="nutritionOverride.moreNutrients"
            idPrefix={idPrefix}
          />
        </div>
      )}
    </div>
  );
}
