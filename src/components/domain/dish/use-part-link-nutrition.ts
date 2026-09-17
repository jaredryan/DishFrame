"use client";

import * as React from "react";
import { getPartLinkEffectiveNutrition } from "@/lib/nutrition/actions";
import { computeReplicatedEffectiveNutrition } from "@/lib/dishes/offline-nutrition";
import {
  NONE_NUTRITION,
  type EffectiveNutrition,
} from "@/lib/nutrition/calculate";

export type PartLinkNutritionRef = {
  targetDishId: string;
  targetDishVersionId: string;
};

function keyFor(ref: PartLinkNutritionRef): string {
  return `${ref.targetDishId}:${ref.targetDishVersionId}`;
}

/**
 * Resolves one linked Part occurrence's effective nutrition, preferring the
 * local offline replica (`computeReplicatedEffectiveNutrition` —
 * `src/lib/dishes/offline-nutrition.ts`, reusing the exact same
 * `calculate.ts` logic every adapter uses) over a live Server Action —
 * PRODUCT_SPEC.md/owner decision 2026-09-17: "must not depend on a live
 * Server Action when the required Part data is already in the local
 * replica." The replica lookup returns `null` (not `NONE_NUTRITION`) when
 * that exact Dish/Version isn't replicated at all, distinct from "replicated
 * but genuinely has no nutrition data" — only the former falls back to the
 * network, and never at all while offline (a network attempt would just
 * fail after a timeout).
 */
async function resolvePartLinkNutrition(
  link: PartLinkNutritionRef,
): Promise<EffectiveNutrition> {
  const local = await computeReplicatedEffectiveNutrition(
    link.targetDishId,
    link.targetDishVersionId,
  );
  if (local !== null) return local;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return NONE_NUTRITION;
  }
  const result = await getPartLinkEffectiveNutrition(link);
  return result.status === "success" ? result.nutrition : NONE_NUTRITION;
}

/**
 * Composable nutrition (owner decision, 2026-09-17): the editor's live
 * Section/whole-Dish nutrition preview needs each linked Part occurrence's
 * own effective nutrition — resolved on demand (`resolvePartLinkNutrition`
 * above) and cached by `targetDishId:targetDishVersionId` for the
 * component's lifetime, so the same Part linked in several places (or
 * re-rendered on every keystroke elsewhere in the form) only ever triggers
 * one lookup per distinct target. A lookup miss (still loading, or the
 * fetch failed) returns `NONE_NUTRITION` — the calculation degrades to "no
 * data from this Part yet" rather than blocking or throwing, matching how a
 * genuinely nutrition-less contributor already behaves.
 */
export function usePartLinkEffectiveNutritionMap(
  links: PartLinkNutritionRef[],
): Map<string, EffectiveNutrition> {
  const cacheRef = React.useRef<Map<string, EffectiveNutrition>>(new Map());
  const [snapshot, setSnapshot] = React.useState<
    Map<string, EffectiveNutrition>
  >(() => new Map());
  const dedupedKey = links.map(keyFor).sort().join(",");

  React.useEffect(() => {
    let cancelled = false;
    const uniqueRefs = [...new Map(links.map((l) => [keyFor(l), l])).values()];
    const missing = uniqueRefs.filter(
      (link) => !cacheRef.current.has(keyFor(link)),
    );
    if (missing.length === 0) return;

    (async () => {
      const results = await Promise.all(
        missing.map(
          async (link) =>
            [keyFor(link), await resolvePartLinkNutrition(link)] as const,
        ),
      );
      if (cancelled) return;
      for (const [key, nutrition] of results) {
        cacheRef.current.set(key, nutrition);
      }
      setSnapshot(new Map(cacheRef.current));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupedKey]);

  return snapshot;
}

export function lookupPartLinkNutrition(
  map: Map<string, EffectiveNutrition>,
  ref: PartLinkNutritionRef,
): EffectiveNutrition {
  return map.get(keyFor(ref)) ?? NONE_NUTRITION;
}
