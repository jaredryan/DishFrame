import { normalizeName } from "@/lib/account/defaults";
import {
  normalizeUnitName,
  convertQuantity,
  unitFamilyOf,
} from "@/lib/units/conversion";

/**
 * Safe grocery-item combination (PRODUCT_SPEC.md §61). Pure, DB-free — same
 * rationale as `src/lib/units/scaling.ts`/`conversion.ts`: name equivalence
 * (§61.1's "names are sufficiently equivalent") plus compatible, safely
 * convertible units. Deliberately conservative per §61.2 — exact normalized-
 * name matching only (no stemming/pluralization), and any free-text or
 * quantity-less occurrence never combines with anything, since there is
 * nothing numeric to sum. Required and optional contributions never combine
 * with each other either (Slice 12 correction).
 */

export type CombinableOccurrence = {
  /** Caller-supplied identity used only to report grouping results back. */
  key: string;
  name: string;
  quantity: number | null;
  /** A range end (e.g. "1–2 cups"). Summing two ranges is mathematically
   * well-defined but adds real ambiguity for a shopping line — treated like
   * free text, a range occurrence never auto-combines (deliberately
   * conservative, §61.2). */
  quantityEnd?: number | null;
  unit: string | null;
  /** A free-text quantity (e.g. "to taste") — never combined (§10.7). */
  displayText: string | null;
  /** Required and optional never auto-combine, even on an otherwise exact
   * match (Slice 12 correction — an optional item must stay removable). */
  isOptional: boolean;
};

/** §61.1's name-equivalence check — trimmed/lowercased exact match, matching
 * every other owner-scoped dedup rule in this codebase (`normalizeName`). */
export function normalizedIngredientName(name: string): string {
  return normalizeName(name);
}

/**
 * §61.1/§61.2: two occurrences combine only when their names are equivalent
 * and either their units are identical (including both count-based/null,
 * e.g. "2 onions" + "3 onions") or both resolve to a recognized unit in the
 * same convertible family (§53.2). An unrecognized unit (e.g. "can") or a
 * unit/no-unit mismatch (e.g. count vs. "cup") never combines — DishFrame
 * never guesses (§61.2's own examples).
 */
export function canCombine(
  a: CombinableOccurrence,
  b: CombinableOccurrence,
): boolean {
  if (a.isOptional !== b.isOptional) return false;
  if (a.displayText || b.displayText) return false;
  if (a.quantityEnd != null || b.quantityEnd != null) return false;
  if (a.quantity == null || b.quantity == null) return false;
  if (normalizedIngredientName(a.name) !== normalizedIngredientName(b.name)) {
    return false;
  }
  if (a.unit === b.unit) return true;
  if (a.unit == null || b.unit == null) return false;

  const canonicalA = normalizeUnitName(a.unit);
  const canonicalB = normalizeUnitName(b.unit);
  if (!canonicalA || !canonicalB) return false;
  if (unitFamilyOf[canonicalA] !== unitFamilyOf[canonicalB]) return false;
  return convertQuantity(1, canonicalA, canonicalB) != null;
}

export type CombinedGroup<T extends CombinableOccurrence> = {
  /** The unit every member's quantity was converted into, when the group
   * has more than one recognized-unit member; the group's own shared unit
   * (possibly null for a count) otherwise. */
  unit: string | null;
  /** Sum of every member's quantity, expressed in `unit`. Null when the
   * group's sole member has no numeric quantity (free text or unit-less
   * quantity-less row). */
  totalQuantity: number | null;
  /** The representative display name — the first member's own name. */
  name: string;
  members: T[];
};

/**
 * Groups occurrences for automatic combination (§61.1/§61.3). Greedy
 * single-pass grouping: each occurrence joins the first existing group it
 * `canCombine`s with (transitive via that group's first/representative
 * member), or starts a new group. A free-text or quantity-less occurrence
 * always starts (and stays in) its own singleton group, since `canCombine`
 * never matches it to anything — this keeps every multi-member group's
 * combined-quantity arithmetic simple (every member is guaranteed
 * numeric+convertible).
 */
export function groupForCombination<T extends CombinableOccurrence>(
  occurrences: T[],
): CombinedGroup<T>[] {
  const groups: CombinedGroup<T>[] = [];

  for (const occurrence of occurrences) {
    const representative = groups.find((group) =>
      canCombine(group.members[0], occurrence),
    );
    if (representative) {
      representative.members.push(occurrence);
      // canCombine already guarantees unit compatibility with this group's
      // representative member (both count-based/null, or both convertible)
      // — a mismatched pairing could never have joined this group.
      if (occurrence.quantity != null) {
        const converted =
          representative.unit == null
            ? occurrence.quantity
            : convertUnitSafe(
                occurrence.quantity,
                occurrence.unit!,
                representative.unit,
              );
        if (converted != null) {
          representative.totalQuantity =
            (representative.totalQuantity ?? 0) + converted;
        }
      }
      continue;
    }
    groups.push({
      unit: occurrence.unit,
      totalQuantity: occurrence.quantity,
      name: occurrence.name,
      members: [occurrence],
    });
  }

  return groups;
}

function convertUnitSafe(
  value: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  if (fromUnit === toUnit) return value;
  const canonicalFrom = normalizeUnitName(fromUnit);
  const canonicalTo = normalizeUnitName(toUnit);
  if (!canonicalFrom || !canonicalTo) return null;
  return convertQuantity(value, canonicalFrom, canonicalTo);
}
