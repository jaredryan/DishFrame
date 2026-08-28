import * as React from "react";
import { Plus } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { DragHandle } from "@/components/ui/drag-handle";
import { AmountModeField } from "@/components/domain/dish/amount-mode-field";
import { amountModeShowsUnit } from "@/components/domain/dish/amount-mode";
import { useAmountMode } from "@/components/domain/dish/use-amount-mode";
import { SubstituteFields } from "@/components/domain/dish/substitute-fields";
import { ItemToolbar } from "@/components/domain/dish/reorder-buttons";
import { formatIngredientSummary } from "@/components/domain/dish/ingredient-summary";

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
  id,
  prefix,
  index,
  onRemove,
}: {
  id: string;
  prefix: string;
  index: number;
  onRemove: () => void;
}) {
  const { register, watch, setValue, getValues } = useFormContext();
  const idPrefix = `${prefix.replace(/\./g, "-")}`;
  const name: string = watch(`${prefix}.name`);
  const quantity = watch(`${prefix}.quantity`);
  const quantityEnd = watch(`${prefix}.quantityEnd`);
  const isApproximate = !!watch(`${prefix}.isApproximate`);
  const unit = watch(`${prefix}.unit`);
  const displayText = watch(`${prefix}.displayText`);
  const preparationNote = watch(`${prefix}.preparationNote`);
  const substitute = watch(`${prefix}.substitute`);
  const isOptional = !!watch(`${prefix}.isOptional`);
  // Collapsed by default on modal open (matches PartLinkFields' same
  // lineageId-based rule) — only a brand-new, not-yet-saved ingredient
  // (no lineageId) starts expanded so it can be filled in right away.
  const [collapsed, setCollapsed] = React.useState(
    () => !!getValues(`${prefix}.lineageId`),
  );
  const { mode, chooseMode } = useAmountMode(prefix);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const label = name || `ingredient ${index + 1}`;
  const preview = formatIngredientSummary({
    quantity,
    quantityEnd,
    isApproximate,
    unit,
    displayText,
    name,
    preparationNote,
  });
  const headerLabel = `Ingredient ${index + 1}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3"
    >
      {/* Slice 6A: a compact header — drag handle, live numbered preview,
          actions — following the same pattern as a Section header but
          deliberately less visually dominant (smaller text, no heading
          typography). The preview is the one place this ingredient's
          summary renders; the fields below are the source of truth for it,
          not a second, separately-maintained copy. */}
      <div className="flex items-center gap-2">
        <DragHandle
          label={`Drag to reorder ${label}`}
          attributes={attributes}
          listeners={listeners}
          isDragging={isDragging}
        />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{headerLabel}</span>
          {preview && (
            <span className="text-muted-foreground"> — {preview}</span>
          )}
          {isOptional && (
            <span className="text-muted-foreground"> (optional)</span>
          )}
        </p>
        <ItemToolbar
          label={label}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((prev) => !prev)}
          onRemove={onRemove}
        />
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-name`}>
              Ingredient name
            </FieldLabel>
            <Input
              id={`${idPrefix}-name`}
              placeholder="e.g. Soy sauce"
              className="text-base font-medium"
              {...register(`${prefix}.name`)}
            />
          </Field>

          {/* Amount row (Gate 2 final correction pass): quantity field(s),
              then Amount mode, then Unit — in that order, on one row on
              desktop, stacking on narrow widths. Unit isn't shown in Free
              text mode (see use-amount-mode.ts). */}
          <div className="flex flex-wrap items-end gap-2">
            <AmountModeField
              prefix={prefix}
              idPrefix={idPrefix}
              mode={mode}
              onModeChange={chooseMode}
            />
            {amountModeShowsUnit(mode) && (
              <Field className="w-full sm:w-28">
                <FieldLabel htmlFor={`${idPrefix}-unit`}>Unit</FieldLabel>
                <Input
                  id={`${idPrefix}-unit`}
                  placeholder="e.g. tbsp"
                  {...register(`${prefix}.unit`)}
                />
              </Field>
            )}
          </div>

          {/* Secondary controls: prep note, optional/approximate, substitute. */}
          <div className="border-border flex flex-col gap-3 border-t pt-3">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-preparation-note`}>
                Preparation note
              </FieldLabel>
              <Input
                id={`${idPrefix}-preparation-note`}
                placeholder="e.g. finely chopped"
                {...register(`${prefix}.preparationNote`)}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={isOptional}
                  onCheckedChange={(checked) =>
                    setValue(`${prefix}.isOptional`, checked === true, {
                      shouldDirty: true,
                    })
                  }
                  aria-label="Optional"
                />
                Optional
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={isApproximate}
                  onCheckedChange={(checked) =>
                    setValue(`${prefix}.isApproximate`, checked === true, {
                      shouldDirty: true,
                    })
                  }
                  aria-label="Approximate"
                />
                Approximate
              </label>
              {!substitute && (
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
                  <Plus /> Add substitute
                </Button>
              )}
            </div>

            {substitute && (
              <SubstituteFields
                prefix={`${prefix}.substitute`}
                idPrefix={`${idPrefix}-substitute`}
                onRemove={() =>
                  setValue(`${prefix}.substitute`, null, { shouldDirty: true })
                }
              />
            )}
          </div>

          {/* Explicit workflow completion, separate from the top-right collapse shortcut. */}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setCollapsed(true)}
          >
            Finish ingredient
          </Button>
        </div>
      )}
    </div>
  );
}
