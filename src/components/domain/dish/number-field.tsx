"use client";

import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";

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
      render={({ field }) => {
        const value = field.value as number | string | null | undefined;
        return (
          <Input
            {...props}
            type="number"
            inputMode="decimal"
            className={className}
            value={value === null || value === undefined ? "" : String(value)}
            onChange={(event) => {
              const raw = event.target.value;
              field.onChange(raw === "" ? null : Number(raw));
            }}
          />
        );
      }}
    />
  );
}
