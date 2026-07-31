import { normalizeQuantity } from "@/lib/dishes/schema";

/**
 * Parses a typed quantity into a decimal number (PRODUCT_SPEC.md §10.4/
 * §10.6 — whole numbers, decimals, fractions, and mixed numbers are all
 * approved entry forms; the approved schema stores the parsed decimal, not
 * the original text, so "1 1/2" and "1.5" are indistinguishable once
 * saved — that's expected, and matches §10.6 leaving fraction *display*
 * formatting to later scaling/formatting work, not Slice 3).
 * The result is rounded via the shared `normalizeQuantity` helper
 * (PRODUCT_SPEC.md §10.6a) so a repeating fraction like "1/3" commits as a
 * deliberate `0.333`, matching the database's 3-decimal-place precision,
 * rather than an unbounded JS float.
 * Returns `null` for empty/incomplete/invalid text so the caller can leave
 * the field uncommitted while the user is still mid-keystroke.
 *
 * Framework-agnostic (no client-only imports) so it's shared by
 * `number-field.tsx` (which re-exports it, preserving its original import
 * path) and the server-side deterministic paste parser
 * (`src/lib/importExport/paste-parser.ts`), which needs the exact same
 * quantity-recognition rule the editor's own field uses.
 */
export function parseQuantityText(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (/^-?\d*\.?\d+$/.test(trimmed)) {
    return normalizeQuantity(Number(trimmed));
  }

  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return normalizeQuantity(Number(fraction[1]) / denominator);
  }

  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return normalizeQuantity(Number(mixed[1]) + Number(mixed[2]) / denominator);
  }

  return null;
}
