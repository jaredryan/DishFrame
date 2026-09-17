import "server-only";
import { notFound } from "next/navigation";
import {
  getOwnedDishOrThrow,
  getDishScopedVersionContentOrThrow,
  listDishVersionSummaries,
} from "@/lib/dishes/queries";
import { NotFoundError } from "@/lib/errors";
import {
  compareDishVersions,
  pickDefaultComparisonPair,
  type VersionCompareInput,
  type VersionComparisonResult,
} from "@/lib/dishes/compare";
import { versionContentToInput } from "@/lib/dishes/mappers";
import { decimalToNumber } from "@/lib/dishes/format";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import {
  resolvePartLinkDisplayInfo,
  listMaterializedPartLinkSnapshots,
} from "@/lib/sections/service";
import type { PartLinkLabelMap } from "@/components/domain/dish/version-compare-view";
import type { DishKindValue } from "@/lib/dishes/schema";

async function toCompareInput(
  dishId: string,
  versionId: string,
): Promise<{
  input: VersionCompareInput;
  majorVersion: number;
  minorVersion: number;
}> {
  const version = await getDishScopedVersionContentOrThrow(dishId, versionId);
  const content = versionContentToInput(version.sections, version.partLinks);
  const materializedPartLinks = await listMaterializedPartLinkSnapshots(
    version.id,
  );
  return {
    majorVersion: version.majorVersion,
    minorVersion: version.minorVersion,
    input: {
      metadata: {
        description: version.description,
        yieldQuantity: decimalToNumber(version.yieldQuantity),
        yieldUnit: version.yieldUnit,
        prepTimeMinutes: version.prepTimeMinutes,
        cookTimeMinutes: version.cookTimeMinutes,
        difficulty: version.difficulty,
      },
      nutrition: {
        calories: decimalToNumber(version.calories),
        protein: decimalToNumber(version.protein),
        carbs: decimalToNumber(version.carbs),
        fat: decimalToNumber(version.fat),
      },
      sections: content.sections,
      partLinks: content.partLinks,
      materializedPartLinks,
    },
  };
}

async function resolvePartLinkLabels(
  ownerId: string,
  result: VersionComparisonResult,
): Promise<PartLinkLabelMap> {
  const pairs = new Map<
    string,
    { targetDishId: string; targetDishVersionId: string }
  >();
  function collect(
    entries: {
      targetDishId: string | null;
      targetDishVersionId: string | null;
    }[],
  ) {
    for (const entry of entries) {
      if (!entry.targetDishId || !entry.targetDishVersionId) continue;
      pairs.set(`${entry.targetDishId}:${entry.targetDishVersionId}`, {
        targetDishId: entry.targetDishId,
        targetDishVersionId: entry.targetDishVersionId,
      });
    }
  }
  collect(result.partLinks.added);
  collect(result.partLinks.removed);
  collect(result.partLinks.changed.map((change) => change.before));
  collect(result.partLinks.changed.map((change) => change.after));

  const labels: PartLinkLabelMap = {};
  await Promise.all(
    [...pairs.entries()].map(
      async ([key, { targetDishId, targetDishVersionId }]) => {
        try {
          const info = await resolvePartLinkDisplayInfo(
            ownerId,
            targetDishId,
            targetDishVersionId,
          );
          labels[key] = {
            title: info.title,
            versionLabel: formatVersionLabel(
              info.majorVersion,
              info.minorVersion,
            ),
          };
        } catch (error) {
          if (error instanceof NotFoundError) {
            labels[key] = { title: null, versionLabel: "" };
          } else {
            throw error;
          }
        }
      },
    ),
  );
  return labels;
}

/**
 * `RecipeComparePage`/`PartComparePage`'s exact async data assembly,
 * extracted the same way `version-history-page-props.ts` was — shared by
 * the live page and `VersionCompareOfflineBoundary`'s "trust the server"
 * branch.
 */
export async function buildVersionCompareViewProps(
  ownerId: string,
  dishId: string,
  kind: DishKindValue,
  fromParam: string | undefined,
  toParam: string | undefined,
) {
  let dish;
  try {
    dish = await getOwnedDishOrThrow(ownerId, dishId, kind);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const versions = await listDishVersionSummaries(dish.id);
  const basePath = dishBasePath(kind);
  const displayTitle =
    dish.currentTitle ??
    (kind === "PART" ? "Untitled part" : "Untitled recipe");

  if (versions.length < 2) {
    return {
      hasEnoughVersions: false as const,
      dishId: dish.id,
      kind,
      basePath,
      displayTitle,
    };
  }

  if (fromParam && !versions.some((v) => v.id === fromParam)) notFound();
  if (toParam && !versions.some((v) => v.id === toParam)) notFound();

  const defaultPair = pickDefaultComparisonPair(
    versions,
    dish.currentVersionId,
  );
  const fromId = fromParam || defaultPair.fromId;
  const toId = toParam || defaultPair.toId;

  const [fromVersion, toVersion] = await Promise.all([
    toCompareInput(dish.id, fromId),
    toCompareInput(dish.id, toId),
  ]);
  const result = compareDishVersions(fromVersion.input, toVersion.input);
  const partLinkLabels = await resolvePartLinkLabels(ownerId, result);

  return {
    hasEnoughVersions: true as const,
    dishId: dish.id,
    kind,
    basePath,
    displayTitle,
    versions: versions.map((v) => ({
      id: v.id,
      majorVersion: v.majorVersion,
      minorVersion: v.minorVersion,
      title: v.title,
      versionNote: v.versionNote,
      sourceVersionId: v.sourceVersionId,
      createdAt: v.createdAt,
    })),
    fromId,
    toId,
    result,
    fromLabel: formatVersionLabel(
      fromVersion.majorVersion,
      fromVersion.minorVersion,
    ),
    toLabel: formatVersionLabel(toVersion.majorVersion, toVersion.minorVersion),
    partLinkLabels,
  };
}

export type VersionCompareViewProps = Awaited<
  ReturnType<typeof buildVersionCompareViewProps>
>;
