import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/dishes/format";
import type { MoreNutrientEntry } from "@/lib/dishes/schema";
import {
  computeDishEffective,
  computeSectionEffective,
  scaleEffectiveNutrition,
  NONE_NUTRITION,
  type EffectiveNutrition,
  type RawNutritionValues,
} from "@/lib/nutrition/calculate";

/**
 * The server-only, DB-backed half of the centralized nutrition calculation
 * (see `calculate.ts`'s doc comment) — resolves a Recipe/Part Version's
 * effective nutrition by recursively walking its own Sections/Ingredients
 * and any linked Parts, exactly mirroring `sections/service.ts`'s
 * `resolvePartLinkTreeInner` cycle-guard/depth-limit pattern (a real cycle
 * is already rejected at write time; this is defense-in-depth against a
 * rendering pass ever infinite-looping). Reused unchanged for the ROOT
 * Recipe/Part being viewed and for every nested Part it links — a nested
 * Part's own effective nutrition (override-or-calculated) is resolved once,
 * then contributed to its container as a single scaled value
 * (PRODUCT_SPEC.md's "do not separately traverse Part B's ingredients again
 * from the parent calculation").
 */

const MAX_DEPTH = 12;

function moreNutrientsFromJson(value: unknown): MoreNutrientEntry[] | null {
  return Array.isArray(value) ? (value as MoreNutrientEntry[]) : null;
}

function rawValues(row: {
  calories: Prisma.Decimal | null;
  protein: Prisma.Decimal | null;
  carbs: Prisma.Decimal | null;
  fat: Prisma.Decimal | null;
  moreNutrients: unknown;
}): RawNutritionValues {
  return {
    calories: decimalToNumber(row.calories),
    protein: decimalToNumber(row.protein),
    carbs: decimalToNumber(row.carbs),
    fat: decimalToNumber(row.fat),
    moreNutrients: moreNutrientsFromJson(row.moreNutrients),
  };
}

/**
 * Resolves one Recipe/Part Version's effective nutrition. `ownerId` scopes
 * every lookup (a nested Part must be owned by the same account, matching
 * `resolvePartLinkTreeInner`'s own ownership check) — never trusted merely
 * because a PartLink row references it.
 */
export async function resolveDishVersionEffectiveNutrition(
  ownerId: string,
  dishId: string,
  versionId: string,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<EffectiveNutrition> {
  if (depth >= MAX_DEPTH || visited.has(dishId)) {
    return NONE_NUTRITION;
  }

  const version = await prisma.dishVersion.findFirst({
    where: { id: versionId, dishId, dish: { ownerId } },
    select: {
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
      moreNutrients: true,
      sections: {
        select: {
          id: true,
          calories: true,
          protein: true,
          carbs: true,
          fat: true,
          moreNutrients: true,
          ingredients: {
            where: { substituteForIngredientId: null },
            select: {
              calories: true,
              protein: true,
              carbs: true,
              fat: true,
              moreNutrients: true,
            },
          },
        },
      },
      partLinks: {
        where: { linkState: "LIVE" },
        select: {
          sectionId: true,
          multiplier: true,
          targetDishId: true,
          targetDishVersionId: true,
        },
      },
    },
  });
  if (!version) return NONE_NUTRITION;

  type PartLinkRow = (typeof version)["partLinks"][number];

  const nextVisited = new Set(visited);
  nextVisited.add(dishId);

  const linksBySection = new Map<string, PartLinkRow[]>();
  const topLevelLinks: PartLinkRow[] = [];
  for (const link of version.partLinks) {
    if (link.sectionId === null) {
      topLevelLinks.push(link);
    } else {
      const list = linksBySection.get(link.sectionId) ?? [];
      list.push(link);
      linksBySection.set(link.sectionId, list);
    }
  }

  async function resolveLinkContributions(
    links: PartLinkRow[],
  ): Promise<EffectiveNutrition[]> {
    return Promise.all(
      links
        .filter(
          (
            link,
          ): link is typeof link & {
            targetDishId: string;
            targetDishVersionId: string;
          } => !!link.targetDishId && !!link.targetDishVersionId,
        )
        .map(async (link) => {
          const effective = await resolveDishVersionEffectiveNutrition(
            ownerId,
            link.targetDishId,
            link.targetDishVersionId,
            nextVisited,
            depth + 1,
          );
          return scaleEffectiveNutrition(
            effective,
            decimalToNumber(link.multiplier) ?? 1,
          );
        }),
    );
  }

  const sectionEffectives = await Promise.all(
    version.sections.map(async (section) => {
      const nestedLinks = linksBySection.get(section.id) ?? [];
      const linkContributions = await resolveLinkContributions(nestedLinks);
      return computeSectionEffective(
        rawValues(section),
        section.ingredients.map(rawValues),
        linkContributions,
      );
    }),
  );

  const topLevelContributions = await resolveLinkContributions(topLevelLinks);

  return computeDishEffective(
    rawValues(version),
    sectionEffectives,
    topLevelContributions,
  );
}
