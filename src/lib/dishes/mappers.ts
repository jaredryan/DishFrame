import { Prisma } from "@/generated/prisma/client";
import { decimalToNumber } from "@/lib/dishes/format";
import type { IngredientInput, SectionInput } from "@/lib/dishes/schema";

/**
 * Prisma-row → plain-object mappers shared by every caller that needs a
 * persisted Version's content in `SectionInput[]` shape: `service.ts`
 * (content-diffing, duplication, promotion) and the Version-comparison
 * route (`compare.ts`'s input). One shared mapping, not a second copy that
 * could silently drift from what `dishToFormValues` and the diffing logic
 * already treat as the canonical persisted-row shape.
 */

type IngredientWithSubstitute = Prisma.IngredientGetPayload<{
  include: { substitute: true };
}>;

// Always includes `lineageId` — safe for every current caller:
// `duplicateDish`/`promoteHistoricalVersion` pass the result through
// `insertSections(..., {mintFreshLineage: true | false})`, and `editDish`'s
// content-diffing needs the real `lineageId` to match rows.
export function toIngredientInput(
  ingredient: IngredientWithSubstitute,
): IngredientInput {
  return {
    lineageId: ingredient.lineageId,
    name: ingredient.name,
    quantity: decimalToNumber(ingredient.quantity),
    quantityEnd: decimalToNumber(ingredient.quantityEnd),
    isApproximate: ingredient.isApproximate,
    unit: ingredient.unit,
    displayText: ingredient.displayText,
    preparationNote: ingredient.preparationNote,
    isOptional: ingredient.isOptional,
    substitute: ingredient.substitute
      ? {
          lineageId: ingredient.substitute.lineageId,
          name: ingredient.substitute.name,
          quantity: decimalToNumber(ingredient.substitute.quantity),
          quantityEnd: decimalToNumber(ingredient.substitute.quantityEnd),
          isApproximate: ingredient.substitute.isApproximate,
          unit: ingredient.substitute.unit,
          displayText: ingredient.substitute.displayText,
          preparationNote: ingredient.substitute.preparationNote,
        }
      : null,
  };
}

export type VersionSectionRow = Prisma.SectionGetPayload<{
  include: {
    ingredients: { include: { substitute: true } };
    instructions: true;
  };
}>;

export function sectionRowsToInput(
  sections: VersionSectionRow[],
): SectionInput[] {
  return sections.map((section) => ({
    lineageId: section.lineageId,
    name: section.name,
    guidanceNote: section.guidanceNote,
    ingredients: section.ingredients
      .filter((ingredient) => ingredient.substituteForIngredientId === null)
      .map(toIngredientInput),
    instructions: section.instructions.map((instruction) => ({
      lineageId: instruction.lineageId,
      text: instruction.text,
    })),
  }));
}
