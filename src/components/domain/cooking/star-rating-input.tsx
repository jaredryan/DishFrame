"use client";

import * as React from "react";
import { Star } from "lucide-react";

/**
 * PRODUCT_SPEC.md §35.1: touch-friendly whole 1-5 star selection, no
 * half-star input. Each star is its own ≥44px tap target (min-h/min-w-11)
 * per the Cooking Mode's existing touch-target convention.
 */
export function StarRatingInput({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const displayValue = hovered ?? value ?? 0;

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          disabled={disabled}
          className="flex min-h-11 min-w-9 items-center justify-center disabled:opacity-50"
          onMouseEnter={() => setHovered(star)}
          onFocus={() => setHovered(star)}
          onBlur={() => setHovered(null)}
          onClick={() => onChange(value === star ? null : star)}
        >
          <Star
            className={
              star <= displayValue
                ? "size-6 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
                : "text-muted-foreground/40 size-6"
            }
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}
