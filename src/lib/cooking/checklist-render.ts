import {
  scaleIngredientQuantity,
  formatCalculatedQuantity,
} from "@/lib/units/scaling";

/**
 * Extracted from `cooking/service.ts` (docs/OFFLINE_IMPLEMENTATION_PLAN.md)
 * so the offline client's local, provisional "start cooking" preview can
 * render checklist rows with the exact same formatting the server uses,
 * without importing anything from a `server-only` module. Server-side
 * authority is unaffected: `service.ts` imports this same module instead of
 * keeping its own private copy — one implementation, not two that could
 * drift apart. This module has no Prisma/React dependency, matching
 * `src/lib/units/scaling.ts`'s own existing convention.
 *
 * The offline preview this feeds is provisional only — §22.4's "never
 * trusted from the client" invariant is unaffected, since the real
 * `startCookingSession`/`addSessionUnits` calls always re-derive checklist
 * content from `buildCookableUnits` at sync time regardless of what a
 * client rendered locally beforehand (see those functions' doc comments).
 */

/** Structurally identical to `cooking/queries.ts`'s `CookableChecklistRaw` —
 * redeclared here (rather than imported) purely to keep this module free of
 * any import chain that could pull in that file's Prisma-backed neighbors
 * into a client bundle. */
export type ChecklistRawInput =
  | {
      kind: "INGREDIENT";
      sourceLineageId: string;
      name: string;
      quantity: number | null;
      quantityEnd: number | null;
      isApproximate: boolean;
      unit: string | null;
      freeText: string | null;
      preparationNote: string | null;
    }
  | { kind: "INSTRUCTION"; sourceLineageId: string; text: string };

export type ChecklistDisplay = {
  displayText: string;
  displayQuantity: string | null;
  displayUnit: string | null;
  baseQuantity: number | null;
  baseQuantityEnd: number | null;
  isApproximate: boolean;
};

/**
 * Formats a structured quantity at `multiplier`, matching the same authored-
 * vs-calculated formatting split `scaled-display.ts` established for the
 * Recipe/Part detail view's own temporary-scaling control: unscaled
 * (`multiplier === 1`) renders in plain authored style, any real scaling
 * renders in kitchen-fraction/decimal calculated style.
 */
export function formatScaledQuantity(
  quantity: number,
  quantityEnd: number | null,
  isApproximate: boolean,
  multiplier: number,
): string {
  const scaled = scaleIngredientQuantity(
    { quantity, quantityEnd, isApproximate, displayText: null },
    multiplier,
  );
  const formatFn = multiplier === 1 ? String : formatCalculatedQuantity;
  const approxPrefix = isApproximate ? "about " : "";
  const rangeText =
    scaled.quantityEnd != null ? `–${formatFn(scaled.quantityEnd)}` : "";
  return `${approxPrefix}${formatFn(scaled.quantity!)}${rangeText}`;
}

/** Renders one checklist row's self-contained display fields at the
 * effective multiplier for its unit — see `cooking/service.ts`'s
 * `startCookingSession`/`addSessionUnits`, the two server-side callers that
 * remain the actual authority on session content. */
export function renderChecklistDisplay(
  raw: ChecklistRawInput,
  multiplier: number,
): ChecklistDisplay {
  if (raw.kind === "INSTRUCTION") {
    return {
      displayText: raw.text,
      displayQuantity: null,
      displayUnit: null,
      baseQuantity: null,
      baseQuantityEnd: null,
      isApproximate: false,
    };
  }

  const name = raw.name?.trim() || "Untitled ingredient";
  const displayText = raw.preparationNote
    ? `${name}, ${raw.preparationNote}`
    : name;

  if (raw.freeText) {
    return {
      displayText,
      displayQuantity: raw.freeText,
      displayUnit: null,
      baseQuantity: null,
      baseQuantityEnd: null,
      isApproximate: false,
    };
  }
  if (raw.quantity == null) {
    return {
      displayText,
      displayQuantity: null,
      displayUnit: null,
      baseQuantity: null,
      baseQuantityEnd: null,
      isApproximate: false,
    };
  }

  return {
    displayText,
    displayQuantity: formatScaledQuantity(
      raw.quantity,
      raw.quantityEnd,
      raw.isApproximate,
      multiplier,
    ),
    displayUnit: raw.unit,
    baseQuantity: raw.quantity,
    baseQuantityEnd: raw.quantityEnd,
    isApproximate: raw.isApproximate,
  };
}
