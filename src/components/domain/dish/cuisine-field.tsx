"use client";

import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";

/**
 * A creatable combobox (Gate 2 remediation, PRODUCT_SPEC.md §46.3 — "free-
 * text values with suggestions based on the user's existing values", not a
 * rigid taxonomy): a native `<input list>`/`<datalist>` pairing, which is
 * exactly that shape already — free text, browser-native suggestion
 * dropdown, no restriction to the listed options — without adding a
 * combobox dependency this codebase doesn't otherwise have.
 */
export function CuisineField({ options }: { options: string[] }) {
  const { register } = useFormContext();

  return (
    <Field>
      <FieldLabel htmlFor="dish-cuisine">Cuisine</FieldLabel>
      <Input
        id="dish-cuisine"
        list="dish-cuisine-options"
        placeholder="Optional, e.g. Vietnamese"
        autoComplete="off"
        {...register("cuisine")}
      />
      <datalist id="dish-cuisine-options">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </Field>
  );
}
