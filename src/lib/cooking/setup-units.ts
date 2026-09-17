import type { CookableUnit } from "@/lib/cooking/queries";

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
