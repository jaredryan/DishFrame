import type { Prisma } from "@/generated/prisma/client";

export function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

/**
 * "Makes {quantity} {unit}" — when no unit was authored, falls back to
 * "serving"/"servings" agreeing with `quantity` (not a bare literal
 * "servings", which reads as "Makes 1 servings" for a singular yield). An
 * authored unit is shown as-is; pluralizing arbitrary user-typed unit text
 * is out of scope here.
 */
export function formatYieldAmount(
  quantity: number,
  unit?: string | null,
): string {
  if (unit) return `${quantity} ${unit}`;
  return `${quantity} serving${quantity === 1 ? "" : "s"}`;
}

/**
 * Shared by every server-rendered Ingredient/Substitute line (the Recipe/
 * Part detail view, the Version-history view, the comparison view) — the
 * read-side counterpart to `ingredient-summary.ts`'s
 * `formatIngredientSummary`, which formats in-progress editor form state
 * instead (see that file's own doc comment for why the two stay separate
 * rather than one function accepting either input shape).
 *
 * `formatQuantityText` (Slice 5): defaults to the plain `String(...)`
 * conversion this function has always used — the authored-style display
 * (PRODUCT_SPEC.md §52.6, "preserves the author's stored quantity style
 * where practical"). The scaled/calculated display
 * (`src/lib/dishes/scaled-display.ts`) passes
 * `formatCalculatedQuantity` instead (§52.7's kitchen-fraction-or-decimal
 * style) — one shared line-assembly rule, not two copies that could drift.
 */
export function formatIngredientLine(
  ingredient: {
    quantity?: number | null;
    quantityEnd?: number | null;
    isApproximate?: boolean;
    unit?: string | null;
    displayText?: string | null;
    name?: string | null;
    preparationNote?: string | null;
  },
  formatQuantityText: (value: number) => string = String,
): string {
  const parts: string[] = [];

  if (ingredient.displayText) {
    parts.push(ingredient.displayText);
  } else if (ingredient.quantity != null) {
    const quantity = formatQuantityText(ingredient.quantity);
    parts.push(ingredient.isApproximate ? `about ${quantity}` : quantity);
    if (ingredient.quantityEnd != null) {
      parts.push(`–${formatQuantityText(ingredient.quantityEnd)}`);
    }
  }
  if (ingredient.unit) parts.push(ingredient.unit);
  parts.push(ingredient.name?.trim() || "Untitled ingredient");

  const line = parts.join(" ").replace(/ –/, "–");
  return ingredient.preparationNote
    ? `${line}, ${ingredient.preparationNote}`
    : line;
}
