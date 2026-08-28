import { X } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { AmountModeField } from "@/components/domain/dish/amount-mode-field";
import { amountModeShowsUnit } from "@/components/domain/dish/amount-mode";
import { useAmountMode } from "@/components/domain/dish/use-amount-mode";
import { getFieldErrorMessage } from "@/components/domain/dish/form-errors";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
export function SubstituteFields({
  prefix,
  idPrefix,
  onRemove,
}: {
  prefix: string;
  idPrefix: string;
  onRemove: () => void;
}) {
  const { register, watch, setValue, formState } = useFormContext();
  const nameError = getFieldErrorMessage(formState.errors, `${prefix}.name`);
  const { mode, chooseMode } = useAmountMode(prefix);

  return (
    <div
      role="group"
      aria-label="Substitute"
      className="border-border bg-muted/30 flex flex-col gap-3 rounded-lg border border-dashed p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Substitute
        </span>
        <TooltipIconButton
          label="Remove substitute"
          icon={X}
          onClick={onRemove}
        />
      </div>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Substitute name</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          placeholder="e.g. Honey"
          aria-invalid={!!nameError}
          {...register(`${prefix}.name`)}
        />
        <FieldError>{nameError}</FieldError>
      </Field>

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
              placeholder="Optional"
              {...register(`${prefix}.unit`)}
            />
          </Field>
        )}
      </div>

      <Field>
        <FieldLabel htmlFor={`${idPrefix}-preparation-note`}>
          Preparation note
        </FieldLabel>
        <Input
          id={`${idPrefix}-preparation-note`}
          placeholder="Optional"
          {...register(`${prefix}.preparationNote`)}
        />
      </Field>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={!!watch(`${prefix}.isApproximate`)}
          onCheckedChange={(checked) =>
            setValue(`${prefix}.isApproximate`, checked === true, {
              shouldDirty: true,
            })
          }
          aria-label="Approximate"
        />
        Approximate
      </label>
    </div>
  );
}
