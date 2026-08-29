import * as React from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { ScaleControl } from "@/components/domain/cooking/scale-control";
import { formatYieldAmount } from "@/lib/dishes/format";

export function parseServings(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatFactor(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A Recipe/Part Version with an authored yield gets a compact servings
 * input (same width as the Recipe editor's prep/cook-time fields) instead
 * of the generic `ScaleControl` — prefilled with the target amount, with the
 * resulting scale factor computed and shown live. A Version with no
 * authored yield falls back to `ScaleControl`'s plain-multiplier mode.
 * Shared by the Grocery List source picker and the Grocery List detail
 * page's Add/Edit meal modals (the latter driving it from whichever Version
 * is currently selected there, not just a dish's current one).
 */
export function DishYieldScalingField({
  id,
  kindLabel,
  yieldQuantity,
  yieldUnit,
  initialQuantity,
  onScaleChange,
  className,
}: {
  id: string;
  kindLabel: "Recipe" | "Part";
  yieldQuantity: number | null;
  yieldUnit: string | null;
  /** Prefilled displayed amount — defaults to the plain authored yield. */
  initialQuantity?: number | null;
  onScaleChange: (value: number | null) => void;
  className?: string;
}) {
  const hasYield = yieldQuantity != null && yieldQuantity > 0;

  if (!hasYield) {
    return (
      <ScaleControl
        outputQuantity={yieldQuantity}
        outputUnit={yieldUnit}
        targetLabel="Make"
        multiplierLabel="Scale"
        onMultiplierChange={onScaleChange}
        className={className}
      />
    );
  }

  return (
    <ServingsScalingField
      id={id}
      kindLabel={kindLabel}
      defaultYield={yieldQuantity}
      initialQuantity={initialQuantity ?? yieldQuantity}
      onScaleChange={onScaleChange}
      className={className}
    />
  );
}

function ServingsScalingField({
  id,
  kindLabel,
  defaultYield,
  initialQuantity,
  onScaleChange,
  className,
}: {
  id: string;
  kindLabel: "Recipe" | "Part";
  defaultYield: number;
  initialQuantity: number;
  onScaleChange: (value: number | null) => void;
  className?: string;
}) {
  const [text, setText] = React.useState(() => String(initialQuantity));
  const parsed = parseServings(text);
  const factor = parsed != null ? parsed / defaultYield : null;

  React.useEffect(() => {
    onScaleChange(factor);
    // Only re-run when the computed factor actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factor]);

  return (
    <Field className={className}>
      <FieldLabel htmlFor={`servings-${id}`}>Servings</FieldLabel>
      <Input
        id={`servings-${id}`}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-13"
      />
      <p className="text-muted-foreground text-sm">
        Makes {formatYieldAmount(parsed ?? defaultYield)}. {kindLabel} will be
        scaled by {formatFactor(factor ?? 1)}×.
      </p>
    </Field>
  );
}
