import type { SectionInput } from "@/lib/dishes/schema";

function stripLineageId<T extends { lineageId?: string }>(
  obj: T,
): Omit<T, "lineageId"> {
  const rest = { ...obj };
  delete (rest as { lineageId?: string }).lineageId;
  return rest;
}

/**
 * Duplicate Section: name/guidanceNote/ingredients/instructions carry over;
 * nested linked Parts don't — copying one would create a second direct link
 * to the same Part on this Version, which `findDuplicatePartTargets`
 * (schema.ts) rejects at save time. Every lineageId is stripped so nothing
 * in the copy is treated server-side as the same persisted row as the
 * original (ARCHITECTURE_PROPOSAL.md §D.-1) — editing or deleting the
 * duplicate then can never touch the original. The caller (`dish-editor.tsx`)
 * always overwrites `position` before inserting this into the form.
 */
export function duplicateSectionContent(section: SectionInput): SectionInput {
  return {
    name: section.name,
    guidanceNote: section.guidanceNote,
    ingredients: section.ingredients.map((ingredient) => ({
      ...stripLineageId(ingredient),
      substitute: ingredient.substitute
        ? stripLineageId(ingredient.substitute)
        : null,
    })),
    instructions: section.instructions.map((instruction) =>
      stripLineageId(instruction),
    ),
    partLinks: [],
    position: section.position,
  };
}
