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
      category: item.category
        ? {
            id: item.category.id,
            displayName: item.category.displayName,
            isFallback: item.category.isFallback,
          }
        : null,
      contributions: item.contributions.map((c) => ({
        id: c.id,
        groceryListSourceId: c.groceryListSourceId,
        originalName: c.originalName,
        quantityText:
          c.quantityText ??
          (decimalToNumber(c.quantityDecimal) != null
            ? String(decimalToNumber(c.quantityDecimal))
            : null),
        unit: c.unit,
        hasSubstitute: c.substituteIngredientLineageId != null,
      })),
    })),
  };

  return <GroceryListDetailView list={dto} categoryOptions={categoryOptions} />;
}
