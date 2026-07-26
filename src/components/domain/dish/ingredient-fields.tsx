"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/domain/dish/number-field";
import { ReorderButtons } from "@/components/domain/dish/reorder-buttons";

/**
 * Deliberately untyped `useFormContext()` (no `DishFormValues` generic):
 * every field path here is built from a runtime array index
 * (`sections.${i}.ingredients.${j}.name`), which react-hook-form's
 * literal-string `FieldPath<T>` type cannot express without a cast at
 * every single call site. The one place that matters for correctness —
 * DishEditor's own `handleSubmit` — stays fully typed; this leaf subform
 * trades local type-checking for not repeating `as "sections.0...."`
 * dozens of times, and the server-side Zod schema is the actual safety
 * net regardless.
 */
export function IngredientFields({
  prefix,
  index,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  prefix: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { register, watch, setValue } = useFormContext();
  const name: string = watch(`${prefix}.name`);
  const substitute = watch(`${prefix}.substitute`);
  const [showRange, setShowRange] = React.useState(
    () => !!watch(`${prefix}.quantityEnd`),
  );

  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={`${prefix}.name-${index}`} className="sr-only">
            Ingredient name
          </Label>
          <Input
            id={`${prefix}.name-${index}`}
            placeholder="Ingredient (e.g. Soy sauce)"
            {...register(`${prefix}.name`)}
          />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumberField
              name={`${prefix}.quantity`}
              placeholder={showRange ? "From" : "Qty"}
              step="any"
              aria-label="Quantity"
            />
            {showRange ? (
              <NumberField
                name={`${prefix}.quantityEnd`}
                placeholder="To"
                step="any"
                aria-label="Quantity end"
              />
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRange(true)}
              >
                Range
              </Button>
            )}
            <Input
              placeholder="Unit"
              aria-label="Unit"
              {...register(`${prefix}.unit`)}
            />
            <Input
              placeholder="or: to taste"
              aria-label="Free-text quantity"
              {...register(`${prefix}.displayText`)}
            />
          </div>

          <Input
            placeholder="Preparation note (e.g. finely chopped)"
            aria-label="Preparation note"
            {...register(`${prefix}.preparationNote`)}
          />

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!watch(`${prefix}.isOptional`)}
                onCheckedChange={(checked) =>
                  setValue(`${prefix}.isOptional`, checked === true, {
                    shouldDirty: true,
                  })
                }
              />
              Optional
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!watch(`${prefix}.isApproximate`)}
                onCheckedChange={(checked) =>
                  setValue(`${prefix}.isApproximate`, checked === true, {
                    shouldDirty: true,
                  })
                }
              />
              Approximate
            </label>
            {!substitute ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setValue(
                    `${prefix}.substitute`,
                    {
                      name: "",
                      quantity: null,
                      quantityEnd: null,
                      isApproximate: false,
                      unit: null,
                      displayText: null,
                      preparationNote: null,
                    },
                    { shouldDirty: true },
                  )
                }
              >
                Add substitute
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setValue(`${prefix}.substitute`, null, {
                    shouldDirty: true,
                  })
                }
              >
                Remove substitute
              </Button>
            )}
          </div>

          {substitute && (
            <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border border-dashed p-2">
              <Label className="text-muted-foreground text-xs">
                Substitute
              </Label>
              <Input
                placeholder="Substitute name (e.g. Honey)"
                aria-label="Substitute name"
                {...register(`${prefix}.substitute.name`)}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  name={`${prefix}.substitute.quantity`}
                  placeholder="Qty"
                  step="any"
                  aria-label="Substitute quantity"
                />
                <Input
                  placeholder="Unit"
                  aria-label="Substitute unit"
                  {...register(`${prefix}.substitute.unit`)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <ReorderButtons
            label={name || "ingredient"}
            isFirst={isFirst}
            isLast={isLast}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove ${name || "ingredient"}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}
