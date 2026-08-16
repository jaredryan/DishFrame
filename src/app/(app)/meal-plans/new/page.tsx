import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listMealPlanEntryCandidates } from "@/lib/mealplans/queries";
import { listDistinctCuisines } from "@/lib/dishes/queries";
import { listTags } from "@/lib/tags/queries";
import { listFlavorProfileValues } from "@/lib/flavor-profiles/queries";
import { MealPlanEditor } from "@/components/domain/mealplans/meal-plan-editor";

export const metadata: Metadata = { title: "Create meal plan" };

export default async function NewMealPlanPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const ownerId = session.user.id;
  const [candidates, tags, recipeCuisines, partCuisines, flavorProfiles] =
    await Promise.all([
      listMealPlanEntryCandidates(ownerId),
      listTags(ownerId),
      listDistinctCuisines(ownerId, "RECIPE"),
      listDistinctCuisines(ownerId, "PART"),
      listFlavorProfileValues(ownerId),
    ]);

  return (
    <MealPlanEditor
      mode="create"
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
