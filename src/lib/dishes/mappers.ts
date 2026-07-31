import { Prisma } from "@/generated/prisma/client";
import { decimalToNumber } from "@/lib/dishes/format";
import type {
  IngredientInput,
  SectionInput,
  PartLinkInput,
} from "@/lib/dishes/schema";
import type { partLinkContentInclude } from "@/lib/dishes/queries";

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
    originalImportedText: ingredient.originalImportedText,
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

export type VersionPartLinkRow = Prisma.PartLinkGetPayload<{
  select: typeof partLinkContentInclude.select;
}>;

/**
 * Slice 6: a `LIVE` PartLink row is guaranteed (by the `linkState` CHECK
 * constraint, schema.prisma §D.6) to carry both target fields — asserted
 * here rather than silently coerced, since a null target on a row this
 * function is ever handed would be a genuine data-integrity bug, not a
 * normal "not set yet" case worth swallowing.
 */
export function toPartLinkInput(partLink: VersionPartLinkRow): PartLinkInput {
  if (!partLink.targetDishId || !partLink.targetDishVersionId) {
    throw new Error(
      "A LIVE PartLink row must have both targetDishId and targetDishVersionId set.",
    );
  }
  return {
    lineageId: partLink.lineageId,
    targetDishId: partLink.targetDishId,
    targetDishVersionId: partLink.targetDishVersionId,
    position: partLink.position,
    // Never actually null (schema.prisma default 1, NOT NULL) — the `?? 1`
    // is defensive typing only, matching decimalToNumber's general nullable
    // signature.
    multiplier: decimalToNumber(partLink.multiplier) ?? 1,
  };
}

export type VersionContent = {
  sections: SectionInput[];
  partLinks: PartLinkInput[];
};

/**
 * Combines a Version's Section rows with its flat PartLink list (fetched
 * separately — see `partLinkContentInclude`'s doc comment, `queries.ts`)
 * into the editor/diffing shape: each Section gets its own nested
 * `partLinks`, and any `sectionId: null` rows surface as top-level
 * `partLinks` on the returned object. One shared mapping, used by every
 * caller that needs a persisted Version's full content in
 * `SectionInput[]`/`PartLinkInput[]` shape (`service.ts`'s content-diffing,
 * duplication, and promotion, and the Version-comparison route).
 */
export function versionContentToInput(
  sections: VersionSectionRow[],
  partLinks: VersionPartLinkRow[],
): VersionContent {
  const bySectionId = new Map<string, PartLinkInput[]>();
  const topLevel: PartLinkInput[] = [];

  for (const partLink of partLinks) {
    const input = toPartLinkInput(partLink);
    if (partLink.sectionId === null) {
      topLevel.push(input);
    } else {
      const list = bySectionId.get(partLink.sectionId) ?? [];
      list.push(input);
      bySectionId.set(partLink.sectionId, list);
    }
  }

  return {
    sections: sections.map((section) => ({
      lineageId: section.lineageId,
      name: section.name,
      guidanceNote: section.guidanceNote,
      position: section.position,
      ingredients: section.ingredients
        .filter((ingredient) => ingredient.substituteForIngredientId === null)
        .map(toIngredientInput),
      instructions: section.instructions.map((instruction) => ({
        lineageId: instruction.lineageId,
        text: instruction.text,
      })),
      partLinks: bySectionId.get(section.id) ?? [],
    })),
    partLinks: topLevel,
  };
}
