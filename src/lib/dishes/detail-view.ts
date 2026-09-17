import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
  getOwnedDishDetailOrThrow,
  listCurrentPartUsages,
  type dishDetailInclude,
  type sectionContentInclude,
} from "@/lib/dishes/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import { resolvePartLinkTrees } from "@/lib/sections/service";
import { getLastCookedAt } from "@/lib/cooking/queries";
import {
  getRatingSummary,
  computePrincipalRating,
} from "@/lib/reviews/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { listCuisines } from "@/lib/cuisines/queries";
import { prisma } from "@/lib/db/prisma";
import type { EffectiveNutritionDisplayData } from "@/components/domain/dish/nutrition-summary";
import type { ScaledSectionRow } from "@/components/domain/dish/scaled-version-view";
import type {
  DishKindValue,
  NutritionSourceProviderValue,
} from "@/lib/dishes/schema";
import { resolveDishVersionEffectiveNutrition } from "@/lib/nutrition/resolve";
import { scaleEffectiveNutrition } from "@/lib/nutrition/calculate";

type DishDetail = Prisma.DishGetPayload<{ include: typeof dishDetailInclude }>;
export type VersionSectionRow = Prisma.SectionGetPayload<{
  include: typeof sectionContentInclude.include;
}>;

/**
 * `<DishDetailView>`'s exact prop assembly, extracted so both the live page
 * and the offline snapshot builder (`offline-sync/dishes.ts`) produce the
 * identical shape — same pattern as `lib/cooking/session-view.ts`. All the
 * Decimal->number/Date->ISO-string conversion happens here, once, so the
 * result is safe to both pass to a Client Component and `JSON.stringify`
 * into the offline replica.
 */
export function toDisplaySections(
  sections: VersionSectionRow[],
  sectionPartLinkTreeLists: Awaited<ReturnType<typeof resolvePartLinkTrees>>[],
): ScaledSectionRow[] {
  return sections.map((section, index) => ({
    id: section.id,
    position: section.position,
    name: section.name,
    guidanceNote: section.guidanceNote,
    partLinks: sectionPartLinkTreeLists[index] ?? [],
    ingredients: section.ingredients.map((ingredient) => ({
      id: ingredient.id,
      lineageId: ingredient.lineageId,
      name: ingredient.name,
      quantity: decimalToNumber(ingredient.quantity),
      quantityEnd: decimalToNumber(ingredient.quantityEnd),
      isApproximate: ingredient.isApproximate,
      unit: ingredient.unit,
      displayText: ingredient.displayText,
      preparationNote: ingredient.preparationNote,
      isOptional: ingredient.isOptional,
      substituteForIngredientId: ingredient.substituteForIngredientId,
      substitute: ingredient.substitute
        ? {
            name: ingredient.substitute.name,
            quantity: decimalToNumber(ingredient.substitute.quantity),
            quantityEnd: decimalToNumber(ingredient.substitute.quantityEnd),
            isApproximate: ingredient.substitute.isApproximate,
            unit: ingredient.substitute.unit,
            displayText: ingredient.substitute.displayText,
            preparationNote: ingredient.substitute.preparationNote,
          }
        : null,
    })),
    instructions: section.instructions.map((instruction) => ({
      id: instruction.id,
      text: instruction.text,
      position: instruction.position,
    })),
  }));
}

async function buildDishDetailViewPropsFor(
  dish: DishDetail,
  kind: DishKindValue,
) {
  const version = dish.currentVersion;
  const label = kind === "PART" ? "Part" : "Recipe";

  if (!version) {
    return {
      hasVersion: false as const,
      dishId: dish.id,
      kind,
      label,
      collectionLabel: kind === "PART" ? "Parts" : "Recipes",
      displayTitle: dish.currentTitle || "",
      stage: dish.stage,
      currentVersionId: dish.currentVersionId,
      isFavorite: dish.tags.some((t) => t.tag.isFavorite),
    };
  }

  // PRODUCT_SPEC.md §71: only meaningful for a Part.
  const usages =
    kind === "PART" ? await listCurrentPartUsages(dish.ownerId, dish.id) : null;

  const [
    preference,
    ratingSummary,
    lastCookedAt,
    tagOptions,
    flavorProfileOptions,
    cuisineOptions,
  ] = await Promise.all([
    prisma.userPreference.findUnique({
      where: { userId: dish.ownerId },
      select: { primaryRatingDisplay: true },
    }),
    getRatingSummary(dish.id, dish.currentVersionId),
    getLastCookedAt(dish.ownerId, dish.id, kind),
    listTags(dish.ownerId),
    listFlavorProfileValues(dish.ownerId),
    listCuisines(dish.ownerId),
  ]);

  const selectedTagIds = dish.tags.map((t) => t.tagId);
  const selectedFlavorProfileValueIds = dish.flavorProfiles.map(
    (f) => f.flavorProfileValueId,
  );
  const selectedCuisineIds = dish.cuisines.map((c) => c.cuisineId);
  const isFavorite = dish.tags.some((t) => t.tag.isFavorite);
  const nonFavoriteTagNames = dish.tags
    .filter((t) => !t.tag.isFavorite)
    .map((t) => t.tag.displayName);
  const flavorProfileNames = dish.flavorProfiles.map(
    (f) => f.flavorProfileValue.displayName,
  );
  const cuisineNames = dish.cuisines
    .map((c) => c.cuisine)
    .sort((a, b) => a.position - b.position)
    .map((c) => c.displayName);
  const principalRating = computePrincipalRating(
    ratingSummary,
    dish.currentVersionId,
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
    {
      sourceKind: dish.sourceKind,
      sourceAggregateRating: decimalToNumber(dish.sourceAggregateRating),
      sourceRatingCount: dish.sourceRatingCount,
      sourceTitle: dish.sourceTitle,
      sourceDishVersionLabel: dish.sourceDishVersionLabel,
    },
  );
  const startingPoint =
    dish.sourceKind === "DUPLICATE" && dish.sourceTitle
      ? {
          title: dish.sourceTitle,
          versionLabel: dish.sourceDishVersionLabel ?? "—",
          aggregateRating: decimalToNumber(dish.sourceAggregateRating),
          ratingCount: dish.sourceRatingCount,
          sessionCount: dish.sourceSessionCount,
        }
      : null;

  // Slice 6 post-gate, §67.4: linked Parts (top-level and Section-nested)
  // render their full pinned content inline — resolved once, here.
  const { sections: sectionPartLinkInputs, partLinks: topLevelPartLinkInputs } =
    versionContentToInput(version.sections, version.partLinks);
  const [topLevelPartLinkTrees, ...sectionPartLinkTreeLists] =
    await Promise.all([
      resolvePartLinkTrees(dish.ownerId, topLevelPartLinkInputs),
      ...sectionPartLinkInputs.map((section) =>
        resolvePartLinkTrees(dish.ownerId, section.partLinks),
      ),
    ]);

  // Sections and top-level PartLinks share one interleaved persisted
  // ordering sequence — positions matched back onto resolved trees by
  // target identity, matching `mergeLiveAndMaterializedTrees`'s pattern.
  const topLevelPartLinkPositionByTarget = new Map(
    topLevelPartLinkInputs.map((input) => [
      `${input.targetDishId}:${input.targetDishVersionId}`,
      input.position,
    ]),
  );
  const displayTopLevelPartLinks = topLevelPartLinkTrees.map((tree) => ({
    position:
      topLevelPartLinkPositionByTarget.get(
        `${tree.targetDishId}:${tree.targetDishVersionId}`,
      ) ?? 0,
    tree,
  }));

  const versionLabel = formatVersionLabel(
    version.majorVersion,
    version.minorVersion,
  );
  const displayTitle = dish.currentTitle || version.title;

  const yieldQuantity = decimalToNumber(version.yieldQuantity);
  const defaultScale = decimalToNumber(dish.defaultScale);
  const effectiveScale =
    defaultScale != null && defaultScale > 0 ? defaultScale : 1;
  const effectiveYieldQuantity =
    yieldQuantity != null ? yieldQuantity * effectiveScale : null;

  // Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md
  // §54.5): the whole-Dish override if active, otherwise the calculated
  // ingredient/Section/nested-Part sum (`src/lib/nutrition/resolve.ts`),
  // scaled by the same `Dish.defaultScale` batch multiplier the yield above
  // already applies — "scaling a Dish should scale nutrition
  // proportionally."
  const rawEffectiveNutrition = await resolveDishVersionEffectiveNutrition(
    dish.ownerId,
    dish.id,
    version.id,
  );
  const scaledEffectiveNutrition = scaleEffectiveNutrition(
    rawEffectiveNutrition,
    effectiveScale,
  );
  const nutrition: EffectiveNutritionDisplayData = {
    ...scaledEffectiveNutrition,
    basis:
      scaledEffectiveNutrition.state === "OVERRIDE"
        ? {
            nutritionBasis: version.nutritionBasis,
            nutritionBasisQuantity: decimalToNumber(
              version.nutritionBasisQuantity,
            ),
            nutritionBasisUnit: version.nutritionBasisUnit,
          }
        : null,
    source:
      scaledEffectiveNutrition.state === "OVERRIDE" &&
      version.nutritionSourceProvider
        ? {
            provider:
              version.nutritionSourceProvider as NutritionSourceProviderValue,
            name: version.nutritionSourceName,
          }
        : null,
  };

  return {
    hasVersion: true as const,
    dishId: dish.id,
    kind,
    label,
    collectionLabel: kind === "PART" ? "Parts" : "Recipes",
    displayTitle,
    stage: dish.stage,
    currentVersionId: version.id,
    isFavorite,
    versionLabel,
    tagNames: nonFavoriteTagNames,
    cuisineNames,
    flavorProfileNames,
    principalRating,
    lastCookedAt: lastCookedAt ? lastCookedAt.toISOString() : null,
    yieldQuantity: effectiveYieldQuantity,
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    difficulty: version.difficulty,
    description: version.description,
    versionNote: version.versionNote,
    nutrition,
    ratingSummary,
    startingPoint,
    tagOptions,
    flavorProfileOptions,
    cuisineOptions,
    selectedTagIds,
    selectedFlavorProfileValueIds,
    selectedCuisineIds,
    imageAssetId: version.imageAssetId,
    usages,
    sections: toDisplaySections(version.sections, sectionPartLinkTreeLists),
    topLevelPartLinks: displayTopLevelPartLinks,
    defaultScale,
    preferredUnitOverrides: dish.preferredUnitOverrides,
  };
}

export async function buildDishDetailViewProps(
  userId: string,
  dishId: string,
  kind: DishKindValue,
) {
  const dish = await getOwnedDishDetailOrThrow(userId, dishId, kind);
  return buildDishDetailViewPropsFor(dish, kind);
}

export type DishDetailViewProps = Awaited<
  ReturnType<typeof buildDishDetailViewProps>
>;
