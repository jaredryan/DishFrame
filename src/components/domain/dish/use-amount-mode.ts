"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import {
  AS_NEEDED_TEXT,
  TO_TASTE_TEXT,
  deriveAmountMode,
  type AmountMode,
} from "@/components/domain/dish/amount-mode";

/**
 * Shared amount-mode state + mode-switch clearing logic for Ingredient and
 * Substitute rows (final Gate 2 correction pass — extracted from
 * `amount-mode-field.tsx` so the parent row component can also know the
 * current mode, needed to place Unit correctly in the reorganized amount
 * row). Untyped `useFormContext()` — see ingredient-fields.tsx's doc
 * comment for why.
 */
export function useAmountMode(prefix: string) {
  const { watch, setValue } = useFormContext();
  const quantity = watch(`${prefix}.quantity`);
  const quantityEnd = watch(`${prefix}.quantityEnd`);
  const displayText: string | null | undefined = watch(`${prefix}.displayText`);

  const [mode, setMode] = React.useState<AmountMode>(() =>
    deriveAmountMode({ quantity, quantityEnd, displayText }),
  );

  function chooseMode(next: AmountMode) {
    setMode(next);
    switch (next) {
      case "single":
        setValue(`${prefix}.quantityEnd`, null, { shouldDirty: true });
        setValue(`${prefix}.displayText`, null, { shouldDirty: true });
        break;
      case "range":
        setValue(`${prefix}.displayText`, null, { shouldDirty: true });
        break;
      case "to_taste":
        setValue(`${prefix}.quantity`, null, { shouldDirty: true });
        setValue(`${prefix}.quantityEnd`, null, { shouldDirty: true });
        setValue(`${prefix}.displayText`, TO_TASTE_TEXT, {
          shouldDirty: true,
        });
        break;
      case "as_needed":
        setValue(`${prefix}.quantity`, null, { shouldDirty: true });
        setValue(`${prefix}.quantityEnd`, null, { shouldDirty: true });
        setValue(`${prefix}.displayText`, AS_NEEDED_TEXT, {
          shouldDirty: true,
        });
        break;
      case "free_text":
        setValue(`${prefix}.quantity`, null, { shouldDirty: true });
        setValue(`${prefix}.quantityEnd`, null, { shouldDirty: true });
        // A preset's canonical text isn't meaningful free text the user
        // typed — clear it so they start from a blank box. Anything else
        // (including free text carried over from a previous edit) stays.
        if (displayText === TO_TASTE_TEXT || displayText === AS_NEEDED_TEXT) {
          setValue(`${prefix}.displayText`, null, { shouldDirty: true });
        }
        // Unit isn't rendered in free-text mode (a structured Unit next to
        // arbitrary free text like "a splash" double-describes the
        // amount) — clear any stale value so it can't silently resurface
        // if the user switches back to Single/Range/a preset.
        setValue(`${prefix}.unit`, null, { shouldDirty: true });
        break;
    }
  }

  return { mode, chooseMode };
}
