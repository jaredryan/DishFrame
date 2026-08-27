import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { loadMealPlanEditorOptions } from "@/lib/mealplans/queries";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";

export const metadata: Metadata = { title: "Create meal plan" };

export default async function NewMealPlanPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { candidates, tagOptions, cuisineOptions, flavorProfileOptions } =
    await loadMealPlanEditorOptions(session.user.id);

  return (
    <MealPlanEditor
      mode="create"
      candidates={candidates}
      tagOptions={tagOptions}
      cuisineOptions={cuisineOptions}
      flavorProfileOptions={flavorProfileOptions}
    />
  );
}
