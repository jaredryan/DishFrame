import type { CookableUnit } from "@/lib/cooking/queries";
import type { ConsolidatedUnit } from "@/lib/cooking/consolidation";

export type SetupUnit = {
  unitKey: string;
  kind: "SECTION" | "PART";
  label: string;
  estimatedDurationMinutes: number | null;
  ingredientCount: number;
  instructionCount: number;
  outputQuantity: number | null;
  outputUnit: string | null;
  // SLICE_9.md refinement pass — set only for a Part reached by linking
  // through another Part (never a top-level or Section-nested Part), so the
  // list can show it's a nested, independently selectable unit rather than a
  // sibling of the thing that links to it (PRODUCT_SPEC.md §23.4).
  parentPartLabel: string | null;
};

/** Shared by both the server-rendered setup pages (`cook/page.tsx` for
 * Recipes and Parts) and the client-only `CookingSetupOfflineBoundary` —
 * the exact `buildCookableUnits` row -> `SetupUnit` mapping, so an offline
 * preview built from the replicated `DishSnapshotDoc.cookableUnits` formats
 * identically to the server-rendered page. Kept out of `cooking-setup.tsx`
 * (a `"use client"` module) since a Server Component can't call a function
 * exported from a Client Component module directly. */
export function toSetupUnits(cookableUnits: CookableUnit[]): SetupUnit[] {
  return cookableUnits.map((unit) => ({
    unitKey: unit.unitKey,
    kind: unit.kind,
    label: unit.label,
    estimatedDurationMinutes: unit.estimatedDurationMinutes,
    ingredientCount: unit.checklist.filter((i) => i.kind === "INGREDIENT")
      .length,
    instructionCount: unit.checklist.filter((i) => i.kind === "INSTRUCTION")
      .length,
    outputQuantity: unit.outputQuantity,
    outputUnit: unit.outputUnit,
    parentPartLabel: unit.partViaTitleSnapshot,
  }));
}

export type ConsolidatedSetupContributor = {
  sourceIndex: number;
  sourceDishTitle: string;
  contributionQuantity: number | null;
  contributionUnit: string | null;
};

export type ConsolidatedSetupUnit = SetupUnit & {
  /** Stable key selected/reordered by, and posted back as
   * `units[].mergeKey` to `startMultiSourceCookingSession` — see
   * `consolidation.ts`'s `ConsolidatedUnit.mergeKey`. */
  mergeKey: string;
  /** Only meaningful when `contributors.length > 1` — a Section or a Part
   * contributed by a single source never needs the restrained source-label
   * treatment the owner's multi-source spec calls for ("Source attribution
   * in the combined list"). */
  contributors: ConsolidatedSetupContributor[];
};

/** Multi-source counterpart to `toSetupUnits` — the exact same per-unit
 * mapping, plus each unit's `mergeKey` and per-source contribution
 * breakdown for the combined "Cooking order and scale" list and its
 * restrained source-attribution treatment. */
export function toConsolidatedSetupUnits(
  consolidatedUnits: ConsolidatedUnit[],
  sourceDishTitles: string[],
): ConsolidatedSetupUnit[] {
  return consolidatedUnits.map(({ mergeKey, unit, contributions }) => ({
    unitKey: unit.unitKey,
    kind: unit.kind,
    label: unit.label,
    estimatedDurationMinutes: unit.estimatedDurationMinutes,
    ingredientCount: unit.checklist.filter((i) => i.kind === "INGREDIENT")
      .length,
    instructionCount: unit.checklist.filter((i) => i.kind === "INSTRUCTION")
      .length,
    outputQuantity: unit.outputQuantity,
    outputUnit: unit.outputUnit,
    parentPartLabel: unit.partViaTitleSnapshot,
    mergeKey,
    contributors: contributions.map((c) => ({
      sourceIndex: c.sourceIndex,
      sourceDishTitle: sourceDishTitles[c.sourceIndex] ?? "Untitled",
      contributionQuantity: c.contributionQuantity,
      contributionUnit: c.contributionUnit,
    })),
  }));
}
