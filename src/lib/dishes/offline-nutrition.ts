"use client";

import { getEntity } from "@/lib/offline/db";
import type { DishSnapshotDoc } from "@/lib/offline-sync/dishes";
import type {
  ReplicatedVersion,
  ReplicatedVersionSection,
  ReplicatedPartLinkRef,
} from "@/lib/dishes/version-history-snapshot";
import {
  computeSectionEffective,
  computeDishEffective,
  scaleEffectiveNutrition,
  toRawNutritionValues,
  NONE_NUTRITION,
  type EffectiveNutrition,
} from "@/lib/nutrition/calculate";

/**
 * Composable nutrition (owner decision, 2026-09-17, PRODUCT_SPEC.md §54.5):
 * the offline/replica-backed adapter around the same centralized
 * calculation logic `src/lib/nutrition/resolve.ts` (the DB adapter) and
 * `src/lib/sharing/graph.ts` (the share-graph adapter) already use — never
 * a separate offline-specific calculator. Reads the IndexedDB replica
 * (`DishSnapshotDoc.versions`, `version-history-snapshot.ts`'s
 * `ReplicatedVersion` — every saved Version's own raw ingredient/Section
 * nutrition, replicated for exactly this purpose) instead of Postgres.
 *
 * A nested Part's contribution is resolved from the exact
 * `targetDishVersionId` its PartLink pins (never that Part's current
 * Version), matching `resolveDishVersionEffectiveNutrition`'s own
 * guarantee — `ReplicatedPartLinkRef` already carries that pinned id.
 *
 * Returns `null` (distinct from `NONE_NUTRITION`) when the referenced
 * Dish/Version isn't in the local replica at all, so a caller (the
 * editor's live preview) can tell "not replicated yet — fall back to a
 * live lookup" apart from "replicated, and genuinely has no nutrition
 * data" — both are real, different situations.
 */

const MAX_DEPTH = 12;

async function findReplicatedVersion(
  dishId: string,
  versionId: string,
): Promise<ReplicatedVersion | null> {
  const record = await getEntity<DishSnapshotDoc>("dish", dishId);
  if (!record) return null;
  return record.doc.versions.find((v) => v.id === versionId) ?? null;
}

async function resolveLinkContributions(
  links: ReplicatedPartLinkRef[],
  visited: Set<string>,
  depth: number,
): Promise<EffectiveNutrition[]> {
  const resolved = await Promise.all(
    links
      .filter(
        (
          link,
        ): link is ReplicatedPartLinkRef & {
          targetDishId: string;
          targetDishVersionId: string;
        } => !!link.targetDishId && !!link.targetDishVersionId,
      )
      .map(async (link) => {
        const effective = await computeReplicatedEffectiveNutrition(
          link.targetDishId,
          link.targetDishVersionId,
          visited,
          depth + 1,
        );
        // An unreplicated target (`null`) is excluded outright rather than
        // folded in as `NONE_NUTRITION` — it must not count against
        // completeness the way a genuinely-empty nested Part would (see
        // module doc comment above on the null/NONE_NUTRITION distinction).
        if (effective === null) return null;
        return scaleEffectiveNutrition(effective, link.multiplier);
      }),
  );
  return resolved.filter((e): e is EffectiveNutrition => e !== null);
}

async function computeSectionsAndTopLevel(
  sections: ReplicatedVersionSection[],
  topLevelPartLinks: ReplicatedPartLinkRef[],
  visited: Set<string>,
  depth: number,
): Promise<{
  sectionEffectives: EffectiveNutrition[];
  topLevelContributions: EffectiveNutrition[];
}> {
  const sectionEffectives = await Promise.all(
    sections.map(async (section) => {
      const nested = await resolveLinkContributions(
        section.partLinks,
        visited,
        depth,
      );
      return computeSectionEffective(
        toRawNutritionValues(section.nutritionOverride),
        section.ingredients.map((ingredient) =>
          toRawNutritionValues(ingredient.nutrition),
        ),
        nested,
      );
    }),
  );
  const topLevelContributions = await resolveLinkContributions(
    topLevelPartLinks,
    visited,
    depth,
  );
  return { sectionEffectives, topLevelContributions };
}

/**
 * Effective nutrition for one specific replicated Recipe/Part Version —
 * current or historical alike, since `ReplicatedVersion.sections`/
 * `topLevelPartLinks` are that exact Version's own pinned content. Depth/
 * cycle-guarded the same way `resolveDishVersionEffectiveNutrition` is
 * (defense-in-depth only — a real cycle is already rejected at write time).
 */
export async function computeReplicatedEffectiveNutrition(
  dishId: string,
  versionId: string,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<EffectiveNutrition | null> {
  if (depth >= MAX_DEPTH || visited.has(dishId)) return NONE_NUTRITION;
  const version = await findReplicatedVersion(dishId, versionId);
  if (!version) return null;

  const nextVisited = new Set(visited);
  nextVisited.add(dishId);

  const { sectionEffectives, topLevelContributions } =
    await computeSectionsAndTopLevel(
      version.sections,
      version.topLevelPartLinks,
      nextVisited,
      depth + 1,
    );

  return computeDishEffective(
    toRawNutritionValues(version.nutritionOverride),
    sectionEffectives,
    topLevelContributions,
  );
}

/**
 * Convenience for a caller that already has the `ReplicatedVersion` object
 * in hand (e.g. Version History rendering every replicated Version at
 * once) — same computation, skipping the redundant `getEntity` lookup for
 * the root Version itself. Nested Parts still resolve through the replica.
 */
export async function computeReplicatedVersionEffectiveNutrition(
  version: ReplicatedVersion,
  visited: Set<string> = new Set(),
  depth = 0,
): Promise<EffectiveNutrition> {
  const { sectionEffectives, topLevelContributions } =
    await computeSectionsAndTopLevel(
      version.sections,
      version.topLevelPartLinks,
      visited,
      depth,
    );
  return computeDishEffective(
    toRawNutritionValues(version.nutritionOverride),
    sectionEffectives,
    topLevelContributions,
  );
}
