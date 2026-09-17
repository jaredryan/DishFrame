"use client";

import { getEntity } from "@/lib/offline/db";
import {
  compareDishVersions,
  pickDefaultComparisonPair,
  type VersionCompareInput,
  type VersionComparisonResult,
} from "@/lib/dishes/compare";
import { versionLabel as formatVersionLabel } from "@/lib/dishes/version-note";
import { computeReplicatedVersionEffectiveNutrition } from "@/lib/dishes/offline-nutrition";
import type { EffectiveNutrition } from "@/lib/nutrition/calculate";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type { ReplicatedVersion } from "@/lib/dishes/version-history-snapshot";
import type { PartLinkLabelMap } from "@/components/domain/dish/version-compare-view";

/**
 * Offline mirror of `version-compare-page-props.ts` — reuses the exact
 * same pure `compareDishVersions`/`pickDefaultComparisonPair`
 * (`lib/dishes/compare.ts`, already framework/DB-agnostic — no separate
 * "offline reconciliation core" needed here, unlike ingredient-gathering)
 * against `VersionCompareInput` objects built from the replicated
 * `DishSnapshotDoc.versions` instead of Postgres.
 *
 * Two accepted, documented fidelity gaps vs. online, both matching
 * `version-history-snapshot.ts`'s own scope: a MATERIALIZED PartLink
 * (target Part since deleted) isn't replicated, so it never participates
 * in an offline comparison; a linked Part's display label uses its
 * *current* replicated title/version — accurate for the common case
 * (Dish title is stable identity, not Version-scoped) but not
 * necessarily the exact historical Version's own label if that Part has
 * since been edited again.
 */
function toCompareInput(
  version: ReplicatedVersion,
  nutrition: EffectiveNutrition,
): VersionCompareInput {
  return {
    metadata: {
      description: version.description,
      yieldQuantity: version.yieldQuantity,
      yieldUnit: version.yieldUnit,
      prepTimeMinutes: version.prepTimeMinutes,
      cookTimeMinutes: version.cookTimeMinutes,
      difficulty: version.difficulty,
    },
    // Composable nutrition (owner decision, 2026-09-17): computed by the
    // caller via `computeReplicatedVersionEffectiveNutrition` — the same
    // centralized `calculate.ts` logic every other adapter uses, against
    // this replicated Version's own raw ingredient/Section data and
    // whichever nested Part Versions its own PartLinks pin.
    nutrition,
    sections: version.sections.map((section) => ({
      lineageId: section.lineageId,
      name: section.name,
      guidanceNote: section.guidanceNote,
      ingredients: section.ingredients.map((ingredient) => ({
        lineageId: ingredient.lineageId,
        name: ingredient.name,
        quantity: ingredient.quantity,
        quantityEnd: ingredient.quantityEnd,
        isApproximate: ingredient.isApproximate,
        unit: ingredient.unit,
        displayText: ingredient.displayText,
        preparationNote: ingredient.preparationNote,
        isOptional: ingredient.isOptional,
        substitute: ingredient.substitute
          ? {
              name: ingredient.substitute.name,
              quantity: ingredient.substitute.quantity,
              quantityEnd: ingredient.substitute.quantityEnd,
              isApproximate: ingredient.substitute.isApproximate,
              unit: ingredient.substitute.unit,
              displayText: ingredient.substitute.displayText,
              preparationNote: ingredient.substitute.preparationNote,
            }
          : null,
      })),
      instructions: section.instructions.map((instruction) => ({
        lineageId: instruction.lineageId,
        text: instruction.text,
        position: instruction.position,
      })),
      partLinks: section.partLinks
        .filter((link) => link.targetDishId && link.targetDishVersionId)
        .map((link) => ({
          lineageId: link.lineageId,
          targetDishId: link.targetDishId!,
          targetDishVersionId: link.targetDishVersionId!,
          position: link.position,
          multiplier: link.multiplier,
        })),
      position: section.position,
    })),
    partLinks: version.topLevelPartLinks
      .filter((link) => link.targetDishId && link.targetDishVersionId)
      .map((link) => ({
        lineageId: link.lineageId,
        targetDishId: link.targetDishId!,
        targetDishVersionId: link.targetDishVersionId!,
        position: link.position,
        multiplier: link.multiplier,
      })),
    // Not replicated — see this file's doc comment.
    materializedPartLinks: [],
  };
}

async function resolvePartLinkLabelsOffline(
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
        const record = await getEntity<DishSnapshotDoc>("dish", targetDishId);
        const version = record?.doc.versions.find(
          (v) => v.id === targetDishVersionId,
        );
        if (!record || !version) {
          labels[key] = { title: null, versionLabel: "" };
          return;
        }
        labels[key] = {
          title: record.doc.content?.title ?? version.title,
          versionLabel: formatVersionLabel(
            version.majorVersion,
            version.minorVersion,
          ),
        };
      },
    ),
  );
  return labels;
}

export type OfflineCompareResult =
  | { hasEnoughVersions: false }
  | {
      hasEnoughVersions: true;
      versions: ReplicatedVersion[];
      fromId: string;
      toId: string;
      result: VersionComparisonResult;
      fromLabel: string;
      toLabel: string;
      partLinkLabels: PartLinkLabelMap;
    }
  | null;

export async function compareVersionsOffline(
  dishId: string,
  currentVersionId: string | null,
  fromParam: string | undefined,
  toParam: string | undefined,
): Promise<OfflineCompareResult> {
  const record = await getEntity<DishSnapshotDoc>("dish", dishId);
  if (!record) return null;
  const versions = record.doc.versions;
  if (versions.length < 2) return { hasEnoughVersions: false };

  if (fromParam && !versions.some((v) => v.id === fromParam)) return null;
  if (toParam && !versions.some((v) => v.id === toParam)) return null;

  const defaultPair = pickDefaultComparisonPair(versions, currentVersionId);
  const fromId = fromParam || defaultPair.fromId;
  const toId = toParam || defaultPair.toId;
  const fromVersion = versions.find((v) => v.id === fromId);
  const toVersion = versions.find((v) => v.id === toId);
  if (!fromVersion || !toVersion) return null;

  const [fromNutrition, toNutrition] = await Promise.all([
    computeReplicatedVersionEffectiveNutrition(fromVersion),
    computeReplicatedVersionEffectiveNutrition(toVersion),
  ]);
  const result = compareDishVersions(
    toCompareInput(fromVersion, fromNutrition),
    toCompareInput(toVersion, toNutrition),
  );
  const partLinkLabels = await resolvePartLinkLabelsOffline(result);

  return {
    hasEnoughVersions: true,
    versions,
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
