"use client";

import * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { normalizeQuantity } from "@/lib/dishes/schema";

/**
 * Parses a typed quantity into a decimal number (PRODUCT_SPEC.md §10.4/
 * §10.6 — whole numbers, decimals, fractions, and mixed numbers are all
 * approved entry forms; the approved schema stores the parsed decimal, not
 * the original text, so "1 1/2" and "1.5" are indistinguishable once
 * saved — that's expected, and matches §10.6 leaving fraction *display*
 * formatting to later scaling/formatting work, not Slice 3).
 * The result is rounded via the shared `normalizeQuantity` helper
 * (PRODUCT_SPEC.md §10.6a) so a repeating fraction like "1/3" commits as a
 * deliberate `0.333`, matching the database's 3-decimal-place precision,
 * rather than an unbounded JS float.
 * Returns `null` for empty/incomplete/invalid text so the caller can leave
 * the field uncommitted while the user is still mid-keystroke.
 */
export function parseQuantityText(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return normalizeQuantity(Number(trimmed));
  }

  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return normalizeQuantity(Number(fraction[1]) / denominator);
  }

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return normalizeQuantity(Number(mixed[1]) + Number(mixed[2]) / denominator);
  }

  return null;
}

function formatQuantityValue(
  value: number | string | null | undefined,
): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * A text input (not a native `<input type="number">`, which physically
 * blocks characters like "/" and " " needed for fractions/mixed numbers)
 * that keeps its own local text buffer alongside the committed numeric
 * form value. Only re-syncs its visible text from an *external* value
 * change (loading an existing Dish, `form.reset()`) — a change it caused
 * itself is skipped, so typing "1 1/2" doesn't get reformatted to "1.5"
 * mid-keystroke.
 */
function QuantityInput({
  value,
  onValueChange,
  ...props
}: {
  value: number | string | null | undefined;
  onValueChange: (value: number | null) => void;
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
>) {
  const [text, setText] = React.useState(() => formatQuantityValue(value));
  const skipNextSync = React.useRef(false);

  React.useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setText(formatQuantityValue(value));
  }, [value]);

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);

        if (raw.trim() === "") {
          skipNextSync.current = true;
          onValueChange(null);
          return;
        }

        const parsed = parseQuantityText(raw);
        if (parsed !== null) {
          skipNextSync.current = true;
          onValueChange(parsed);
        }
      }}
    />
  );
}

/**
 * A nullable numeric field bridged onto react-hook-form's string-only
 * <input>: an empty box means "no value" (`null`), not `NaN` or `0`.
 *
 * Untyped `useFormContext()` — see the doc comment in ingredient-fields.tsx
 * for why: `name` here is routinely built from a runtime array index.
 */
export function NumberField({
  name,
  className,
  ...props
}: {
  name: string;
  className?: string;
} & Omit<
  React.ComponentProps<typeof Input>,
  "name" | "value" | "onChange" | "type"
>) {
  const { control } = useFormContext();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <QuantityInput
          {...props}
          className={className}
          value={field.value as number | string | null | undefined}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}
