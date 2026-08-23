import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedMealPlanOrThrow,
  listMealPlanEntryCandidates,
} from "@/lib/mealplans/queries";
import { listDistinctCuisines } from "@/lib/dishes/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { NotFoundError } from "@/lib/errors";
import { decimalToNumber } from "@/lib/dishes/format";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";
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
    return { title: `${mealPlan.title} — Edit` };
  } catch {
    return {};
  }
}

export default async function EditMealPlanPage({
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

  const ownerId = session.user.id;
  const [candidates, tags, recipeCuisines, partCuisines, flavorProfiles] =
    await Promise.all([
      listMealPlanEntryCandidates(ownerId),
      listTags(ownerId),
      listDistinctCuisines(ownerId, "RECIPE"),
      listDistinctCuisines(ownerId, "PART"),
      listFlavorProfileValues(ownerId),
    ]);

  const dto: MealPlanDetailDto = {
    id: mealPlan.id,
    title: mealPlan.title,
    startDate: mealPlan.startDate.toISOString(),
    endDate: mealPlan.endDate.toISOString(),
    notes: mealPlan.notes,
    entries: mealPlan.entries.map((entry) => ({
      id: entry.id,
      dishId: entry.dishId,
      dishVersionId: entry.dishVersionId,
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

  return (
    <MealPlanEditor
      mode="edit"
      mealPlan={dto}
      candidates={candidates}
      tagOptions={tags.map((tag) => ({
        id: tag.id,
        displayName: tag.displayName,
      }))}
      cuisineOptions={[...new Set([...recipeCuisines, ...partCuisines])].sort(
        (a, b) => a.localeCompare(b),
      )}
      flavorProfileOptions={flavorProfiles.map((value) => ({
        id: value.id,
        displayName: value.displayName,
      }))}
    />
  );
}
