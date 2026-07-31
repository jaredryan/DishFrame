"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";

/**
 * PRODUCT_SPEC.md §24.1/§24.2/§24.4 — natural target-output scaling. When the
 * source has a meaningful authored "Makes" quantity and unit (a Recipe/
 * Version's own yield, or a linked Part's own yield), the user enters the
 * output they want and DishFrame computes the multiplier internally. When no
 * useful authored output exists (no yield, or a Section with no output basis
 * of its own), this falls back to a plain multiplier — the user never has to
 * do that division by hand either way. Shared by Cooking Setup (whole-session
 * and per-unit) and mid-session scaling (Slice 8), so the two controls stay
 * behaviorally identical.
 */
export type ScaleControlProps = {
  outputQuantity: number | null;
  outputUnit: string | null;
  onMultiplierChange: (multiplier: number | null) => void;
  targetLabel?: string;
  multiplierLabel?: string;
  className?: string;
};

function parsePositiveNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function ScaleControl({
  outputQuantity,
  outputUnit,
  onMultiplierChange,
  targetLabel = "Cook for",
  multiplierLabel = "Scale",
  className,
}: ScaleControlProps) {
  const [text, setText] = React.useState("");
  const hasOutputBasis =
    outputQuantity != null && outputQuantity > 0 && !!outputUnit;

  function handleChange(nextText: string) {
    setText(nextText);
    const parsed = parsePositiveNumber(nextText);
    if (parsed == null) {
      onMultiplierChange(null);
      return;
    }
    onMultiplierChange(hasOutputBasis ? parsed / outputQuantity! : parsed);
  }

  if (hasOutputBasis) {
    return (
      <Field className={className}>
        <FieldLabel>{targetLabel} (optional)</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            placeholder={String(outputQuantity)}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            className="max-w-28"
          />
          <span className="text-muted-foreground text-sm">{outputUnit}</span>
        </div>
        <FieldDescription>
          Makes {outputQuantity} {outputUnit}. Leave blank for the authored
          amount.
        </FieldDescription>
      </Field>
    );
  }

  return (
    <Field className={className}>
      <FieldLabel>{multiplierLabel} (optional)</FieldLabel>
      <Input
        inputMode="decimal"
        placeholder="1"
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="max-w-28"
      />
      <FieldDescription>
        E.g. 2 to double. Leave blank for the authored amount.
      </FieldDescription>
    </Field>
  );
}
