// Mirrors dish-detail-view.tsx's `formatIngredientLine`, deliberately not
// shared with it: that one formats already-persisted rows (`Prisma.Decimal`
// quantities from a Server Component), this one formats in-progress editor
// form state (plain numbers) for the collapsed-row summary. Kept as two
// small pure functions rather than a shared one that would need to accept
// either input shape.
export function formatIngredientSummary(ingredient: {
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
