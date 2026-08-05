import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedMealPlanOrThrow,
  listMealPlanEntryCandidates,
} from "@/lib/mealplans/queries";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { MealPlanDetailView } from "@/components/domain/mealplans/meal-plan-detail-view";
import type { MealPlanDetailDto } from "@/lib/mealplans/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getServerSession();
  if (!session) return {};
  const { id } = await params;
  try {
    const mealPlan = await getOwnedMealPlanOrThrow(session.user.id, id);
    return { title: mealPlan.title };
  } catch {
    return {};
  }
}

export default async function MealPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { id } = await params;

  let mealPlan;
  try {
    mealPlan = await getOwnedMealPlanOrThrow(session.user.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const candidates = await listMealPlanEntryCandidates(session.user.id);

  const dto: MealPlanDetailDto = {
    id: mealPlan.id,
    title: mealPlan.title,
    startDate: mealPlan.startDate.toISOString(),
    endDate: mealPlan.endDate.toISOString(),
    notes: mealPlan.notes,
    entries: mealPlan.entries.map((entry) => ({
      id: entry.id,
      dishId: entry.dishId,
      dishKind: entry.sourceDishKindSnapshot,
      title: entry.sourceDishTitleSnapshot,
      versionLabel: entry.sourceDishVersionLabelSnapshot,
      cookDate: entry.cookDate.toISOString(),
      targetYieldQuantity: decimalToNumber(entry.targetYieldQuantity),
      targetYieldUnit: entry.targetYieldUnit,
      note: entry.note,
      status: entry.status,
      linkedSessionId: entry.linkedSessionId,
      plannedMeals: entry.plannedMeals.map((meal) => ({
        id: meal.id,
        label: meal.label,
        date: meal.date.toISOString(),
        servings: decimalToNumber(meal.servings) ?? 0,
      })),
    })),
    linkedGroceryLists: mealPlan.linkedGroceryLists.map((list) => ({
      id: list.id,
      title: list.title,
      mode: list.mode,
      completedAt: list.completedAt?.toISOString() ?? null,
    })),
  };

  return <MealPlanDetailView mealPlan={dto} candidates={candidates} />;
}
