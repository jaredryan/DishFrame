import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/dishes/format";
import { nutritionValuesFromRow } from "@/lib/dishes/mappers";
import {
  sectionContentInclude,
  partLinkContentInclude,
} from "@/lib/dishes/queries";
import { Prisma } from "@/generated/prisma/client";
import type {
  NutritionValuesInput,
  NutritionBasisValue,
  NutritionSourceProviderValue,
} from "@/lib/dishes/schema";

type VersionSectionRow = Prisma.SectionGetPayload<{
  include: typeof sectionContentInclude.include;
}>;
type VersionPartLinkRow = Prisma.PartLinkGetPayload<{
  select: typeof partLinkContentInclude.select;
}>;

export type ReplicatedPartLinkRef = {
  id: string;
  lineageId: string;
  position: number;
  targetDishId: string | null;
  targetDishVersionId: string | null;
  // Offline grocery generation/resync (docs/OFFLINE_IMPLEMENTATION_PLAN.md
  // §4) — the ingredient-gathering walk composes this multiplicatively
  // with every ancestor PartLink's own multiplier.
  multiplier: number;
};

export type ReplicatedVersionSubstitute = {
  lineageId: string;
  name: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
};

export type ReplicatedVersionIngredient = {
  id: string;
  lineageId: string;
  name: string;
  quantity: number | null;
  quantityEnd: number | null;
  isApproximate: boolean;
  unit: string | null;
  displayText: string | null;
  preparationNote: string | null;
  isOptional: boolean;
  // Offline grocery generation/resync — see `ReplicatedPartLinkRef`'s
  // `multiplier` comment; these two mirror exactly what `ingredient-
  // gather-core.ts`'s shared walker needs from an ingredient row.
  substituteForIngredientId: string | null;
  substitute: ReplicatedVersionSubstitute | null;
  // Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md
  // §54.5): this ingredient's own contribution, replicated raw (not a
  // precomputed total) so effective nutrition can be calculated locally —
  // offline editor preview and offline Version History/compare both reuse
  // `src/lib/nutrition/calculate.ts` against this same data, never a
  // separate offline-specific calculator.
  nutrition: NutritionValuesInput | null;
};

export type ReplicatedVersionSection = {
  id: string;
  lineageId: string;
  position: number;
  name: string | null;
  guidanceNote: string | null;
  ingredients: ReplicatedVersionIngredient[];
  instructions: {
    id: string;
    lineageId: string;
    text: string;
    position: number;
  }[];
  // Plain references, not resolved nested trees — see this file's doc
  // comment (docs/OFFLINE_IMPLEMENTATION_PLAN.md §2's scoped fidelity note).
  partLinks: ReplicatedPartLinkRef[];
  // Composable nutrition: this Section's own manual override, if any.
  nutritionOverride: NutritionValuesInput | null;
};

export type ReplicatedVersion = {
  id: string;
  majorVersion: number;
  minorVersion: number;
  title: string;
  versionNote: string | null;
  sourceVersionId: string | null;
  createdAt: string;
  description: string | null;
  yieldQuantity: number | null;
  yieldUnit: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  difficulty: string | null;
  imageAssetId: string | null;
  // Composable nutrition: the whole-Dish manual override, if any — raw, not
  // precomputed, for the same local-calculation reason as above. Basis/
  // source are only ever meaningful when this override is active.
  nutritionOverride: NutritionValuesInput | null;
  nutritionBasis: NutritionBasisValue | null;
  nutritionBasisQuantity: number | null;
  nutritionBasisUnit: string | null;
  nutritionSourceProvider: NutritionSourceProviderValue | null;
  nutritionSourceName: string | null;
  sections: ReplicatedVersionSection[];
  topLevelPartLinks: ReplicatedPartLinkRef[];
};

function toIngredient(
  row: VersionSectionRow["ingredients"][number],
): ReplicatedVersionIngredient {
  return {
    id: row.id,
    lineageId: row.lineageId,
    name: row.name,
    quantity: decimalToNumber(row.quantity),
    quantityEnd: decimalToNumber(row.quantityEnd),
    isApproximate: row.isApproximate,
    unit: row.unit,
    displayText: row.displayText,
    preparationNote: row.preparationNote,
    isOptional: row.isOptional,
    substituteForIngredientId: row.substituteForIngredientId,
    nutrition: nutritionValuesFromRow(row),
    substitute: row.substitute
      ? {
          lineageId: row.substitute.lineageId,
          name: row.substitute.name,
          quantity: decimalToNumber(row.substitute.quantity),
          quantityEnd: decimalToNumber(row.substitute.quantityEnd),
          isApproximate: row.substitute.isApproximate,
          unit: row.substitute.unit,
          displayText: row.substitute.displayText,
          preparationNote: row.substitute.preparationNote,
        }
      : null,
  };
}

function toPartLinkRef(row: VersionPartLinkRow): ReplicatedPartLinkRef {
  return {
    id: row.id,
    lineageId: row.lineageId,
    position: row.position,
    targetDishId: row.targetDishId,
    targetDishVersionId: row.targetDishVersionId,
    multiplier: decimalToNumber(row.multiplier) ?? 1,
  };
}

/**
 * Replicates every saved Version's read-only content (docs/
 * OFFLINE_IMPLEMENTATION_PLAN.md §2), so Version History can be viewed and
 * a historical Version promoted offline — not just the Dish's current one
 * (`DishSnapshotDoc.content`/`.detail`). Deliberately narrower than the
 * live Version History page: PartLinks are plain `{targetDishId,
 * targetDishVersionId}` references, not resolved nested content trees
 * (`resolvePartLinkTrees`) — fully resolving a historical Version's linked
 * Parts *at the versions they were pinned to* would mean replicating every
 * version of every Dish ever linked from anywhere, an unbounded expansion
 * this pass doesn't attempt. A reference still identifies which Part was
 * linked; only its inline expanded content isn't shown offline.
 */
export async function buildDishVersionHistorySnapshot(
  dishId: string,
): Promise<ReplicatedVersion[]> {
  const versions = await prisma.dishVersion.findMany({
    where: { dishId },
    include: {
      sections: sectionContentInclude,
      partLinks: partLinkContentInclude,
    },
    orderBy: [{ majorVersion: "asc" }, { minorVersion: "asc" }],
  });

  return versions.map((version) => ({
    id: version.id,
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    title: version.title,
    versionNote: version.versionNote,
    sourceVersionId: version.sourceVersionId,
    createdAt: version.createdAt.toISOString(),
    description: version.description,
    yieldQuantity: decimalToNumber(version.yieldQuantity),
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    difficulty: version.difficulty,
    imageAssetId: version.imageAssetId,
    nutritionOverride: nutritionValuesFromRow(version),
    nutritionBasis: version.nutritionBasis,
    nutritionBasisQuantity: decimalToNumber(version.nutritionBasisQuantity),
    nutritionBasisUnit: version.nutritionBasisUnit,
    nutritionSourceProvider:
      version.nutritionSourceProvider as NutritionSourceProviderValue | null,
    nutritionSourceName: version.nutritionSourceName,
    sections: version.sections.map((section) => ({
      id: section.id,
      lineageId: section.lineageId,
      position: section.position,
      name: section.name,
      guidanceNote: section.guidanceNote,
      ingredients: section.ingredients.map(toIngredient),
      instructions: section.instructions.map((instruction) => ({
        id: instruction.id,
        lineageId: instruction.lineageId,
        text: instruction.text,
        position: instruction.position,
      })),
      partLinks: version.partLinks
        .filter((link) => link.sectionId === section.id)
        .map(toPartLinkRef),
      nutritionOverride: nutritionValuesFromRow(section),
    })),
    topLevelPartLinks: version.partLinks
      .filter((link) => link.sectionId === null)
      .map(toPartLinkRef),
  }));
}
