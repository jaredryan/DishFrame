import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  parsePositiveAmount,
  formatScaleFactor,
  computeTargetYieldScaleFactor,
} from "@/lib/units/scaling";

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
    const parsed = parsePositiveAmount(nextText);
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
            : "Leave blank for the original amount."}
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
          : "E.g. 2 to double. Leave blank for the original amount."}
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

/**
 * Cooking Setup's target-amount scale field (QA pass): unlike `ScaleControl`,
 * which leaves the field blank and means "use the authored amount," this
 * always prepopulates with the current/default amount so the user edits
 * from a concrete starting point, and always shows the derived multiplier —
 * "{subjectLabel} will be scaled by X×." (the same derived-scale-language
 * pattern as `DishYieldScalingField`'s "{kind} will be scaled by X×."). The
 * multiplier itself is computed with the same shared
 * `computeTargetYieldScaleFactor` helper the grocery scaling field and
 * server-side scale-from-yield paths already use, not a new calculation.
 *
 * While the user hasn't typed into the field, its displayed default tracks
 * `outputQuantity` live — so a per-unit field still reflects a changing
 * whole-session scale composed into its basis (`computeOutputBasis`) the
 * same way the old blank/placeholder version did. Once the user types, the
 * raw text is preserved and reinterpreted against the current basis on every
 * change, exactly like `ScaleControl`.
 */
export function TargetScaleField({
  id,
  outputQuantity,
  outputUnit,
  onMultiplierChange,
  subjectLabel,
  targetLabel = "Cook for",
  multiplierLabel = "Scale",
  className,
}: {
  id?: string;
  outputQuantity: number | null;
  outputUnit: string | null;
  onMultiplierChange: (multiplier: number | null) => void;
  /** e.g. "The recipe", "This section" — composed into "{subjectLabel} will be scaled by X×." */
  subjectLabel: string;
  targetLabel?: string;
  multiplierLabel?: string;
  className?: string;
}) {
  const hasOutputBasis =
    outputQuantity != null && outputQuantity > 0 && !!outputUnit;
  const defaultText = hasOutputBasis ? String(outputQuantity) : "1";

  const [typedText, setTypedText] = React.useState<string | null>(null);
  const text = typedText ?? defaultText;

  const parsed = parsePositiveAmount(text);
  const factor = hasOutputBasis
    ? computeTargetYieldScaleFactor(parsed, outputQuantity)
    : (parsed ?? 1);

  const notifyMultiplierChange = React.useEffectEvent(onMultiplierChange);
  React.useEffect(() => {
    notifyMultiplierChange(hasOutputBasis ? factor : parsed);
  }, [factor, parsed, hasOutputBasis]);

  function handleChange(nextText: string) {
    setTypedText(nextText);
  }

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>
        {hasOutputBasis ? targetLabel : multiplierLabel}
      </FieldLabel>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          className="max-w-28"
        />
        {hasOutputBasis && (
          <span className="text-muted-foreground text-sm">{outputUnit}</span>
        )}
      </div>
      <FieldDescription>
        {subjectLabel} will be scaled by {formatScaleFactor(factor)}×.
      </FieldDescription>
    </Field>
  );
}
