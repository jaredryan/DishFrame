import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberField } from "@/components/domain/dish/number-field";
import {
  amountModeValues,
  AMOUNT_MODE_LABEL,
  AS_NEEDED_TEXT,
  TO_TASTE_TEXT,
  type AmountMode,
} from "@/components/domain/dish/amount-mode";

/**
 * Shared by Ingredient and Substitute rows: an explicit "Amount" mode
 * picker that shows only the field(s) relevant to the chosen mode,
 * replacing the old unlabeled Range toggle and the ambiguous "or: to
 * taste" free-text box.
 *
 * Final Gate 2 correction pass — reordered per the desktop row
 * requirement (quantity fields, then Amount mode, then Unit): this
 * component now renders its value field(s) *first* and the mode `Select`
 * *second*, and no longer owns Unit at all — the caller (which already
 * needs to know the current `mode` to conditionally show/hide Unit)
 * renders it. Mode state itself lives in `useAmountMode` (also shared)
 * so both this component and the caller read the same value.
 */
export function AmountModeField({
  prefix,
  idPrefix,
  mode,
  onModeChange,
}: {
  prefix: string;
  idPrefix: string;
  mode: AmountMode;
  onModeChange: (mode: AmountMode) => void;
}) {
  const { register } = useFormContext();
  const modeId = `${idPrefix}-amount-mode`;

  return (
    <>
      {mode === "single" && (
        <Field className="w-24">
          <FieldLabel htmlFor={`${idPrefix}-quantity`}>Quantity</FieldLabel>
          <NumberField
            name={`${prefix}.quantity`}
            id={`${idPrefix}-quantity`}
            placeholder="Qty"
            step="any"
          />
        </Field>
      )}

      {mode === "range" && (
        <div className="flex items-end gap-2">
          <Field className="w-24">
            <FieldLabel htmlFor={`${idPrefix}-quantity`}>From</FieldLabel>
            <NumberField
              name={`${prefix}.quantity`}
              id={`${idPrefix}-quantity`}
              placeholder="From"
              step="any"
            />
          </Field>
          <span
            className="text-muted-foreground pb-1.5 text-sm"
            aria-hidden="true"
          >
            –
          </span>
          <Field className="w-24">
            <FieldLabel htmlFor={`${idPrefix}-quantity-end`}>To</FieldLabel>
            <NumberField
              name={`${prefix}.quantityEnd`}
              id={`${idPrefix}-quantity-end`}
              placeholder="To"
              step="any"
            />
          </Field>
        </div>
      )}

      {mode === "free_text" && (
        <Field className="min-w-40 flex-1">
          <FieldLabel htmlFor={`${idPrefix}-display-text`}>
            Describe the amount
          </FieldLabel>
          <Input
            id={`${idPrefix}-display-text`}
            placeholder="e.g. a splash, a handful"
            {...register(`${prefix}.displayText`)}
          />
        </Field>
      )}

      <Field className="w-full sm:w-36">
        <FieldLabel htmlFor={modeId}>Amount</FieldLabel>
        <Select
          value={mode}
          onValueChange={(value) => onModeChange(value as AmountMode)}
        >
          <SelectTrigger id={modeId} className="w-full" aria-label="Amount">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {amountModeValues.map((value) => (
              <SelectItem key={value} value={value}>
                {AMOUNT_MODE_LABEL[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {(mode === "to_taste" || mode === "as_needed") && (
        <p className="text-muted-foreground pb-1.5 text-sm">
          {mode === "to_taste" ? TO_TASTE_TEXT : AS_NEEDED_TEXT} — no amount to
          enter.
        </p>
      )}
    </>
  );
}
