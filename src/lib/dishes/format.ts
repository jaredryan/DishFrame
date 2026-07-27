import type { Prisma } from "@/generated/prisma/client";

export function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value ? value.toNumber() : null;
}

/**
 * Shared by every server-rendered Ingredient/Substitute line (the Recipe/
 * Part detail view, the Version-history view, the comparison view) — the
 * read-side counterpart to `ingredient-summary.ts`'s
 * `formatIngredientSummary`, which formats in-progress editor form state
 * instead (see that file's own doc comment for why the two stay separate
 * rather than one function accepting either input shape).
 */
export function formatIngredientLine(ingredient: {
  quantity?: number | null;
  quantityEnd?: number | null;
  isApproximate?: boolean;
  unit?: string | null;
  displayText?: string | null;
  name?: string | null;
  preparationNote?: string | null;
}): string {
  const parts: string[] = [];

  if (ingredient.displayText) {
    parts.push(ingredient.displayText);
  } else if (ingredient.quantity != null) {
    const quantity = String(ingredient.quantity);
    parts.push(ingredient.isApproximate ? `about ${quantity}` : quantity);
    if (ingredient.quantityEnd != null) {
      parts.push(`–${ingredient.quantityEnd}`);
    }
  }
  if (ingredient.unit) parts.push(ingredient.unit);
  parts.push(ingredient.name?.trim() || "Untitled ingredient");

  const line = parts.join(" ").replace(/ –/, "–");
  return ingredient.preparationNote
    ? `${line}, ${ingredient.preparationNote}`
    : line;
}
