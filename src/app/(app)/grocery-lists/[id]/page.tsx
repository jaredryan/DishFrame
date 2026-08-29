import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedGroceryListOrThrow,
  listGroceryCategories,
  listGrocerySourceCandidates,
} from "@/lib/grocery/queries";
import { getOwnedMealPlanOrThrow } from "@/lib/mealplans/queries";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { GroceryListDetailView } from "@/components/domain/grocery/grocery-list-detail-view";
import type {
  GroceryListDetailDto,
  GroceryCategoryOptionDto,
  GroceryListMealPlanEntryDto,
} from "@/lib/grocery/list-schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { id } = await params;
  try {
    const list = await getOwnedGroceryListOrThrow(session.user.id, id);
    return { title: list.title };
  } catch {
    return {};
  }
}

export default async function GroceryListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { id } = await params;

  let list;
  try {
    list = await getOwnedGroceryListOrThrow(session.user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const categories = await listGroceryCategories(session.user.id);
  const categoryOptions: GroceryCategoryOptionDto[] = categories.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    isFallback: c.isFallback,
  }));
  const sourceCandidates = await listGrocerySourceCandidates(session.user.id);

  // §81.6 — a Meal-Plan-linked list's Meals section is populated straight
  // from the linked Meal Plan's own entries, not from this list's
  // (nonexistent, for this mode) `GroceryListSource` rows.
  let mealPlanEntries: GroceryListMealPlanEntryDto[] = [];
  if (list.mode === "MEAL_PLAN_LINKED" && list.linkedMealPlanId) {
    const mealPlan = await getOwnedMealPlanOrThrow(
      session.user.id,
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
  }

  const dto: GroceryListDetailDto = {
    id: list.id,
    title: list.title,
    createdAt: list.createdAt.toISOString(),
    plannedDate: list.plannedDate.toISOString(),
    completedAt: list.completedAt?.toISOString() ?? null,
    mode: list.mode,
    linkedMealPlanId: list.linkedMealPlanId,
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
      category: item.category
        ? {
            id: item.category.id,
            displayName: item.category.displayName,
            isFallback: item.category.isFallback,
          }
        : null,
      contributions: item.contributions.map((c) => {
        // The currently-effective snapshot (Slice 12 correction 2) — the
        // frozen primary fields, or the frozen substitute fields when this
        // contribution's selectedVariant is SUBSTITUTE. Both snapshots
        // always stay populated regardless of which is selected.
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
          originalName: effective.name,
          quantityText:
            effective.quantityText ??
            (decimalToNumber(effective.quantityDecimal) != null
              ? String(decimalToNumber(effective.quantityDecimal))
              : null),
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
        };
      }),
    })),
    mealPlanEntries,
  };

  return (
    <GroceryListDetailView
      list={dto}
      categoryOptions={categoryOptions}
      sourceCandidates={sourceCandidates}
    />
  );
}
