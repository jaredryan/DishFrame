// PRODUCT_SPEC.md §10.5/§10.7: an ingredient's amount is either a single
// quantity, a range, one of the two common free-text presets ("To taste" /
// "As needed"), or arbitrary free text ("a splash", "a handful", ...). This
// is a UI-only concept layered on top of the existing `quantity`/
// `quantityEnd`/`displayText` schema fields (Gate 2 remediation — replaces
// the old unlabeled Range toggle) — no new schema field, no migration.
export const amountModeValues = [
  "single",
  "range",
  "to_taste",
  "as_needed",
  "free_text",
] as const;
export type AmountMode = (typeof amountModeValues)[number];

export const AMOUNT_MODE_LABEL: Record<AmountMode, string> = {
  single: "Single amount",
  range: "Range",
  to_taste: "To taste",
  as_needed: "As needed",
  free_text: "Free text",
};

export const TO_TASTE_TEXT = "To taste";
export const AS_NEEDED_TEXT = "As needed";

// Unit is only meaningful alongside a structured quantity — Free text,
// To taste, and As needed all describe the whole amount themselves, so a
// separate Unit input would double-describe (or, for the two presets,
// have nothing to attach to at all).
export function amountModeShowsUnit(mode: AmountMode): boolean {
  return mode === "single" || mode === "range";
}

/**
 * Infers which amount mode a loaded (or freshly blank) row is in from its
 * three underlying fields — used once, at mount, to seed local mode state;
 * afterward the mode is whatever the user last chose, not re-derived.
 */
export function deriveAmountMode(values: {
  quantity?: number | null;
  quantityEnd?: number | null;
  displayText?: string | null;
}): AmountMode {
  if (values.quantityEnd != null) return "range";
  if (values.quantity != null) return "single";
  if (values.displayText === TO_TASTE_TEXT) return "to_taste";
  if (values.displayText === AS_NEEDED_TEXT) return "as_needed";
  if (values.displayText && values.displayText.trim()) return "free_text";
  return "single";
}
