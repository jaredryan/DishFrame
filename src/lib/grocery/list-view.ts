import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  getOwnedGroceryListOrThrow,
  listGroceryCategories,
  listGrocerySourceCandidates,
} from "@/lib/grocery/queries";
import { getOwnedMealPlanOrThrow } from "@/lib/mealplans/queries";
import { decimalToNumber } from "@/lib/dishes/format";
import type {
  GroceryListDetailDto,
  GroceryCategoryOptionDto,
  GroceryListMealPlanEntryDto,
} from "@/lib/grocery/list-schema";
import type { GrocerySourceCandidate } from "@/lib/grocery/queries";

/**
 * Assembles every prop `<GroceryListDetailView>` needs for one list —
 * extracted from `(app)/grocery-lists/[id]/page.tsx`
 * (docs/OFFLINE_IMPLEMENTATION_PLAN.md) so the offline sync snapshot
 * builder (`offline-sync/grocery.ts`) renders from the same assembly the
 * live page uses, rather than a second hand-maintained mapping. The page
 * itself now just calls this and passes the result straight through.
 */
export type GroceryListViewProps = {
  list: GroceryListDetailDto;
  categoryOptions: GroceryCategoryOptionDto[];
  sourceCandidates: GrocerySourceCandidate[];
};

export async function buildGroceryListViewProps(
  userId: string,
  listId: string,
): Promise<GroceryListViewProps> {
  const list = await getOwnedGroceryListOrThrow(userId, listId);

  const categories = await listGroceryCategories(userId);
  const categoryOptions: GroceryCategoryOptionDto[] = categories.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    isFallback: c.isFallback,
  }));
  const sourceCandidates = await listGrocerySourceCandidates(userId);

  let mealPlanEntries: GroceryListMealPlanEntryDto[] = [];
  let removedContributions: GroceryListDetailDto["removedContributions"] = [];
  if (list.mode === "MEAL_PLAN_LINKED" && list.linkedMealPlanId) {
    const mealPlan = await getOwnedMealPlanOrThrow(
      userId,
      list.linkedMealPlanId,
    );
    const excludedIds = new Set(
      list.mealPlanEntryExclusions.map((e) => e.mealPlanEntryId),
    );
    mealPlanEntries = mealPlan.entries.map((entry) => ({
      id: entry.id,
      dishKind: entry.sourceDishKindSnapshot,
      title: entry.sourceDishTitleSnapshot,
      versionLabel: entry.sourceDishVersionLabelSnapshot,
      targetYieldQuantity: decimalToNumber(entry.targetYieldQuantity),
      targetYieldUnit: entry.targetYieldUnit,
      included: !excludedIds.has(entry.id),
    }));
    const tombstones = await prisma.groceryListRemovedContribution.findMany({
      where: { groceryListId: list.id },
    });
    removedContributions = tombstones.map((t) => ({
      id: t.id,
      mealPlanEntryId: t.mealPlanEntryId,
      ingredientLineageId: t.ingredientLineageId,
      wasOptional: t.wasOptional,
    }));
  }

  const dto: GroceryListDetailDto = {
    id: list.id,
    title: list.title,
    createdAt: list.createdAt.toISOString(),
    plannedDate: list.plannedDate.toISOString(),
    completedAt: list.completedAt?.toISOString() ?? null,
    mode: list.mode,
    linkedMealPlanId: list.linkedMealPlanId,
    updatedAt: list.updatedAt.toISOString(),
    sources: list.sources.map((s) => ({
      id: s.id,
      dishId: s.dishId,
      dishVersionId: s.dishVersionId,
      scaleFactor: decimalToNumber(s.scaleFactor) ?? 1,
      sourceDishTitleSnapshot: s.sourceDishTitleSnapshot,
      sourceDishKindSnapshot: s.sourceDishKindSnapshot,
      sourceDishVersionLabelSnapshot: s.sourceDishVersionLabelSnapshot,
      isDeleted: s.dishId == null || s.dishVersionId == null,
    })),
    items: list.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantityText: item.quantityText,
      unit: item.unit,
      isOptional: item.isOptional,
      isManual: item.isManual,
      checkedAt: item.checkedAt?.toISOString() ?? null,
      position: item.position,
      syncFlag: item.syncFlag,
      flagAcknowledgedAt: item.flagAcknowledgedAt?.toISOString() ?? null,
      updatedAt: item.updatedAt.toISOString(),
      category: item.category
        ? {
            id: item.category.id,
            displayName: item.category.displayName,
            isFallback: item.category.isFallback,
          }
        : null,
      contributions: item.contributions.map((c) => {
        const effective =
          c.selectedVariant === "SUBSTITUTE"
            ? {
                name: c.substituteName!,
                quantityDecimal: c.substituteQuantityDecimal,
                quantityText: c.substituteQuantityText,
                unit: c.substituteUnit,
              }
            : {
                name: c.originalName,
                quantityDecimal: c.quantityDecimal,
                quantityText: c.quantityText,
                unit: c.unit,
              };
        return {
          id: c.id,
          groceryListSourceId: c.groceryListSourceId,
          ingredientLineageId: c.ingredientLineageId,
          originalName: effective.name,
          quantityText:
            effective.quantityText ??
            (decimalToNumber(effective.quantityDecimal) != null
              ? String(decimalToNumber(effective.quantityDecimal))
              : null),
          quantityDecimal: decimalToNumber(effective.quantityDecimal),
          unit: effective.unit,
          isOptional: c.isOptional,
          hasSubstitute: c.substituteIngredientLineageId != null,
          selectedVariant: c.selectedVariant,
          syncState: c.mealPlanEntryId != null ? c.state : null,
          previousQuantityText: c.previousQuantityText,
          sourceTitle:
            c.groceryListSource?.sourceDishTitleSnapshot ??
            c.mealPlanEntry?.sourceDishTitleSnapshot ??
            null,
          mealPlanEntryId: c.mealPlanEntryId,
          rawOriginalName: c.originalName,
          rawQuantityDecimal: decimalToNumber(c.quantityDecimal),
          rawQuantityText: c.quantityText,
          rawUnit: c.unit,
          substituteOriginalName: c.substituteName,
          substituteQuantityDecimal: decimalToNumber(
            c.substituteQuantityDecimal,
          ),
          substituteQuantityText: c.substituteQuantityText,
          substituteUnit: c.substituteUnit,
          acknowledgedAt: c.acknowledgedAt?.toISOString() ?? null,
        };
      }),
    })),
    mealPlanEntries,
    removedContributions,
  };

  return { list: dto, categoryOptions, sourceCandidates };
}
