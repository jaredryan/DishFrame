import { canCombine, groupForCombination } from "@/lib/grocery/combine";
import { formatCalculatedQuantity } from "@/lib/units/scaling";
import type {
  GroceryContributionDto,
  GroceryListItemDto,
} from "@/lib/grocery/list-schema";

/**
 * Client-side, DB-free counterpart to `list-service.ts`'s
 * `recomputeMealPlanItemSync` (§81.7 optimistic UI) — recomputes each
 * item's displayed aggregate from already-loaded contribution data the
 * instant a Meal Plan entry's inclusion checkbox is toggled, without
 * waiting on the server. `overrides` maps a Meal Plan entry id to its
 * locally-desired inclusion state; an entry with no override falls back to
 * its last-synced `syncState` (a contribution's `state !== "REMOVED"`).
 *
 * An item left with zero effective contributions is dropped from the
 * returned list entirely, rather than shown with a "no longer in the plan"
 * treatment — that badge means the *Meal Plan itself* dropped the
 * ingredient, a materially different, real removal §81.7 explicitly
 * distinguishes from this list-scoped exclusion. Re-including the entry
 * (or a failed mutation's rollback) simply lets the item reappear next
 * render, since it's still fully present in `list.items`.
 */
export function previewMealPlanEntryInclusion(
  items: GroceryListItemDto[],
  overrides: Map<string, boolean>,
): GroceryListItemDto[] {
  if (overrides.size === 0) return items;

  const result: GroceryListItemDto[] = [];
  for (const item of items) {
    const touchesOverriddenEntry = item.contributions.some(
      (c) => c.mealPlanEntryId != null && overrides.has(c.mealPlanEntryId),
    );
    if (!touchesOverriddenEntry) {
      result.push(item);
      continue;
    }

    const effective = item.contributions.filter((c) => {
      if (c.mealPlanEntryId == null) return true;
      const override = overrides.get(c.mealPlanEntryId);
      return override ?? c.syncState !== "REMOVED";
    });
    if (effective.length === 0) continue;
    if (effective.length === item.contributions.length) {
      result.push(item);
      continue;
    }

    result.push(recomputeAggregate(item, effective));
  }
  return result;
}

function toCombinable(c: GroceryContributionDto) {
  return {
    key: c.id,
    name: c.originalName,
    quantity: c.quantityDecimal,
    unit: c.unit,
    displayText: c.quantityDecimal == null ? c.quantityText : null,
    isOptional: c.isOptional,
  };
}

function recomputeAggregate(
  item: GroceryListItemDto,
  effective: GroceryContributionDto[],
): GroceryListItemDto {
  const first = toCombinable(effective[0]);
  const allCombinable = effective
    .slice(1)
    .every((c) => canCombine(first, toCombinable(c)));

  if (allCombinable) {
    const group = groupForCombination(effective.map(toCombinable))[0];
    return {
      ...item,
      contributions: effective,
      unit: group.unit,
      quantityText:
        group.totalQuantity != null
          ? formatCalculatedQuantity(group.totalQuantity)
          : (effective[0].quantityText ?? null),
      ...(effective.length === 1
        ? { isOptional: effective[0].isOptional }
        : {}),
    };
  }

  return {
    ...item,
    contributions: effective,
    unit: null,
    quantityText: effective
      .map((c) => [c.quantityText, c.unit].filter(Boolean).join(" "))
      .filter(Boolean)
      .join(" + "),
  };
}
