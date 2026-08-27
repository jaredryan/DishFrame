import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  getOwnedMealPlanOrThrow,
  loadMealPlanEditorOptions,
  toMealPlanDetailDto,
} from "@/lib/mealplans/queries";
import { NotFoundError } from "@/lib/errors";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";

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

  const { candidates, tagOptions, cuisineOptions, flavorProfileOptions } =
    await loadMealPlanEditorOptions(session.user.id);

  return (
    <MealPlanEditor
      mode="edit"
      mealPlan={toMealPlanDetailDto(mealPlan)}
      candidates={candidates}
      tagOptions={tagOptions}
      cuisineOptions={cuisineOptions}
      flavorProfileOptions={flavorProfileOptions}
    />
  );
}
