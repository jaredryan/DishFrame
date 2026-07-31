"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

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
  /**
   * Slice 8 correction (PRODUCT_SPEC.md §24.4): when provided, the control
   * renders in "safe" mode for mid-session scaling — the field prefills with
   * the value that produces the current scale, blank input never changes the
   * pending value (only typing a new number, or the explicit Reset action,
   * does), and a "Reset to authored amount" action is offered. Omitted for
   * Cooking Setup, which has no persisted current scale to preserve — blank
   * there legitimately means "use the authored amount" (unchanged Slice 7
   * behavior).
   */
  currentMultiplier?: number | null;
};

function parsePositiveNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * A linked Part's own authored "Makes" yield is a relative amount — scaling
 * the whole session must keep affecting it. The default target output for
 * such a Part is its authored yield times the current whole-session scale
 * (e.g. a Sauce authored "Makes 2 cups" at session scale 2× defaults to a 4
 * cup target); entering a different target derives a *relative* unit factor
 * on top of that, via `ScaleControl`'s own `parsed / outputQuantity` math
 * once given this composed basis instead of the raw authored yield. Returns
 * null when there's no authored yield to compose (the plain-multiplier
 * fallback case).
 */
export function computeOutputBasis(
  authoredOutputQuantity: number | null,
  sessionScale: number,
): number | null {
  return authoredOutputQuantity != null
    ? authoredOutputQuantity * sessionScale
    : null;
}

export function ScaleControl({
  outputQuantity,
  outputUnit,
  onMultiplierChange,
  targetLabel = "Cook for",
  multiplierLabel = "Scale",
  className,
  currentMultiplier,
}: ScaleControlProps) {
  const hasOutputBasis =
    outputQuantity != null && outputQuantity > 0 && !!outputUnit;
  const isSafeMode = currentMultiplier !== undefined;

  const [text, setText] = React.useState<string>(() =>
    isSafeMode && currentMultiplier != null
      ? formatNumber(
          hasOutputBasis
            ? outputQuantity! * currentMultiplier
            : currentMultiplier,
        )
      : "",
  );

  function handleChange(nextText: string) {
    setText(nextText);
    const parsed = parsePositiveNumber(nextText);
    if (parsed == null) {
      // Safe mode: blank (or otherwise unparseable) input leaves the pending
      // value untouched rather than resetting it — Setup keeps its existing
      // blank-means-authored convention.
      if (!isSafeMode) onMultiplierChange(null);
      return;
    }
    onMultiplierChange(hasOutputBasis ? parsed / outputQuantity! : parsed);
  }

  function handleReset() {
    setText(hasOutputBasis ? String(outputQuantity) : "1");
    onMultiplierChange(null);
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
          Makes {outputQuantity} {outputUnit}.{" "}
          {isSafeMode
            ? "Leave unchanged to keep the current scale."
            : "Leave blank for the authored amount."}
        </FieldDescription>
        {isSafeMode && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto self-start px-0"
            onClick={handleReset}
          >
            Reset to authored amount ({outputQuantity} {outputUnit})
          </Button>
        )}
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
        {isSafeMode
          ? "Leave unchanged to keep the current scale. E.g. 2 to double."
          : "E.g. 2 to double. Leave blank for the authored amount."}
      </FieldDescription>
      {isSafeMode && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto self-start px-0"
          onClick={handleReset}
        >
          Reset to authored amount (1×)
        </Button>
      )}
    </Field>
  );
}
