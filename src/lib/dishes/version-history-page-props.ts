import "server-only";
import { notFound } from "next/navigation";
import {
  getOwnedVersionDetailOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/db/prisma";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import { toNutritionSummaryData } from "@/components/domain/dish/nutrition-summary";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { VersionSectionRow } from "@/components/domain/dish/version-sections-view";
import {
  resolvePartLinkTrees,
  resolveMaterializedPartLinkTreesForVersion,
  mergeLiveAndMaterializedTrees,
} from "@/lib/sections/service";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * `<VersionHistoryView>`'s exact async data assembly, extracted from the
 * former Server Component the same way `lib/dishes/detail-view.ts` was
 * extracted from `DishDetailView` — so both the live page and
 * `VersionHistoryOfflineBoundary`'s "trust the server" branch render from
 * one shared function, and the boundary's replica-only fallback
 * (`VersionHistoryOfflineView`) can stay a genuinely simpler renderer
 * without the two ever silently drifting on what "current" or "resolved
 * content" means.
 */
export async function buildVersionHistoryViewProps(
  ownerId: string,
  dishId: string,
  versionId: string,
  kind: DishKindValue,
) {
  let dish, version;
  try {
    const result = await getOwnedVersionDetailOrThrow(
      ownerId,
      dishId,
      versionId,
      kind,
    );
    dish = result.dish;
    version = result.version;
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const [versions, tagSelections] = await Promise.all([
    listDishVersionSummaries(dish.id),
    prisma.dish.findUnique({
      where: { id: dish.id },
      select: {
        tags: {
          select: { tag: { select: { displayName: true, isFavorite: true } } },
        },
        flavorProfiles: {
          select: { flavorProfileValue: { select: { displayName: true } } },
        },
        cuisines: {
          select: {
            cuisine: { select: { displayName: true, position: true } },
          },
        },
      },
    }),
  ]);
  const tagNames = (tagSelections?.tags ?? [])
    .filter((t) => !t.tag.isFavorite)
    .map((t) => t.tag.displayName);
  const flavorProfileNames = (tagSelections?.flavorProfiles ?? []).map(
    (f) => f.flavorProfileValue.displayName,
  );
  const cuisineNames = (tagSelections?.cuisines ?? [])
    .map((c) => c.cuisine)
    .sort((a, b) => a.position - b.position)
    .map((c) => c.displayName);

  const highestMajor = versions.reduce(
    (max, v) => Math.max(max, v.majorVersion),
    0,
  );
  const isCurrent = version.id === dish.currentVersionId;

  const { sections: sectionPartLinkInputs, partLinks: topLevelPartLinkInputs } =
    versionContentToInput(version.sections, version.partLinks);
  const [[topLevelLiveTrees, ...sectionLiveTreeLists], materializedTrees] =
    await Promise.all([
      Promise.all([
        resolvePartLinkTrees(dish.ownerId, topLevelPartLinkInputs),
        ...sectionPartLinkInputs.map((section) =>
          resolvePartLinkTrees(dish.ownerId, section.partLinks),
        ),
      ]),
      resolveMaterializedPartLinkTreesForVersion(dish.ownerId, version.id),
    ]);
  const topLevelPartLinkTrees = mergeLiveAndMaterializedTrees(
    topLevelPartLinkInputs,
    topLevelLiveTrees,
    materializedTrees.topLevel,
  );
  const sectionPartLinkTreeLists = sectionPartLinkInputs.map(
    (section, sectionIndex) =>
      mergeLiveAndMaterializedTrees(
        section.partLinks,
        sectionLiveTreeLists[sectionIndex],
        materializedTrees.bySectionId.get(version.sections[sectionIndex].id) ??
          [],
      ).map((entry) => entry.tree),
  );

  const basePath = dishBasePath(kind);
  const collectionLabel = kind === "PART" ? "Parts" : "Recipes";
  const versionLabel = formatVersionLabel(
    version.majorVersion,
    version.minorVersion,
  );
  const displayTitle = dish.currentTitle || version.title;

  return {
    dishId: dish.id,
    kind,
    basePath,
    collectionLabel,
    displayTitle,
    versionId: version.id,
    versionLabel,
    isCurrent,
    stage: dish.stage,
    currentVersionId: dish.currentVersionId,
    highestMajor,
    versions: versions.map((v) => ({
      id: v.id,
      majorVersion: v.majorVersion,
      minorVersion: v.minorVersion,
      title: v.title,
      versionNote: v.versionNote,
      sourceVersionId: v.sourceVersionId,
      createdAt: v.createdAt,
    })),
    tagNames,
    flavorProfileNames,
    cuisineNames,
    description: version.description,
    versionNote: version.versionNote,
    imageAssetId: version.imageAssetId,
    yieldQuantity: decimalToNumber(version.yieldQuantity),
    yieldUnit: version.yieldUnit,
    prepTimeMinutes: version.prepTimeMinutes,
    cookTimeMinutes: version.cookTimeMinutes,
    difficulty: version.difficulty,
    nutrition: toNutritionSummaryData(version),
    sections: toPlainSections(version.sections),
    sectionPartLinks: sectionPartLinkTreeLists,
    topLevelPartLinks: topLevelPartLinkTrees,
  };
}

/** Raw Prisma section/ingredient rows -> the plain, Decimal-free shape
 * `<VersionSectionsView>` renders — see that component's doc comment for
 * why it can't accept Prisma-typed rows directly (client-bundle safety). */
function toPlainSections(
  sections: Awaited<
    ReturnType<typeof getOwnedVersionDetailOrThrow>
  >["version"]["sections"],
): VersionSectionRow[] {
  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    guidanceNote: section.guidanceNote,
    position: section.position,
    ingredients: section.ingredients.map((ingredient) => ({
      id: ingredient.id,
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

export type VersionHistoryViewProps = Awaited<
  ReturnType<typeof buildVersionHistoryViewProps>
>;
