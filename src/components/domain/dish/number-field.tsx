"use client";

import * as React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
// Moved to `src/lib/dishes/quantity-text.ts` (Slice 11) so the deterministic
// paste importer can share the exact same quantity-recognition rule without
// pulling in this file's client-only UI imports — re-exported here so this
// module's original import path (and its existing test) keep working.
export { parseQuantityText } from "@/lib/dishes/quantity-text";
import { parseQuantityText } from "@/lib/dishes/quantity-text";

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
  emptyDisplay,
  onBlur,
  ...props
}: {
  value: number | string | null | undefined;
  onValueChange: (value: number | null) => void;
  // Display text to show in place of "" when the field's value is null —
  // e.g. Default scale shows "1" for an unset/effective-1× value instead
  // of a blank box, while the underlying form value stays `null`.
  emptyDisplay?: string;
} & Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "inputMode"
>) {
  const display = React.useCallback(
    (v: number | string | null | undefined) => {
      const formatted = formatQuantityValue(v);
      return formatted === "" && emptyDisplay !== undefined
        ? emptyDisplay
        : formatted;
    },
    [emptyDisplay],
  );

  const [text, setText] = React.useState(() => display(value));
  const skipNextSync = React.useRef(false);

  React.useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setText(display(value));
  }, [value, display]);

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
      onBlur={(event) => {
        if (emptyDisplay !== undefined && event.target.value.trim() === "") {
          setText(emptyDisplay);
        }
        onBlur?.(event);
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
  emptyDisplay,
  ...props
}: {
  name: string;
  className?: string;
  emptyDisplay?: string;
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
          emptyDisplay={emptyDisplay}
          className={className}
          value={field.value as number | string | null | undefined}
          onValueChange={field.onChange}
        />
      )}
    />
  );
}
