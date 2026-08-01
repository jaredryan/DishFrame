import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedGroceryListOrThrow,
  listGroceryCategories,
} from "@/lib/grocery/queries";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { GroceryListDetailView } from "@/components/domain/grocery/grocery-list-detail-view";
import type {
  GroceryListDetailDto,
  GroceryCategoryOptionDto,
} from "@/lib/grocery/list-schema";

export const metadata: Metadata = { title: "Grocery list" };

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

  const dto: GroceryListDetailDto = {
    id: list.id,
    title: list.title,
    createdAt: list.createdAt.toISOString(),
    completedAt: list.completedAt?.toISOString() ?? null,
    mode: list.mode,
    linkedMealPlanId: list.linkedMealPlanId,
    sources: list.sources.map((s) => ({
      id: s.id,
      dishId: s.dishId,
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
        };
      }),
    })),
  };

  return <GroceryListDetailView list={dto} categoryOptions={categoryOptions} />;
}
