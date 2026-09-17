import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { loadMealPlanEditorOptions } from "@/lib/mealplans/queries";
import { MealPlanEditorOfflineBoundary } from "@/components/domain/mealplans/meal-plan-editor-offline-boundary";

export const metadata: Metadata = { title: "Create meal plan" };

export default async function NewMealPlanPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { candidates, tagOptions, cuisineOptions, flavorProfileOptions } =
    await loadMealPlanEditorOptions(session.user.id);

  return (
    <MealPlanEditorOfflineBoundary
      mode="create"
      serverOptions={{
        candidates,
        tagOptions,
        cuisineOptions,
        flavorProfileOptions,
      }}
    />
  );
}
