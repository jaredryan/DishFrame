import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listMealPlansForOwner } from "@/lib/mealplans/queries";
import {
  MealPlanCreateProvider,
  MealPlanCreateTrigger,
  MealPlanCreatePanel,
} from "@/components/domain/mealplans/new-meal-plan-form";
import { MealPlanListView } from "@/components/domain/mealplans/meal-plan-list-view";
import { CoachMark } from "@/components/onboarding/coach-mark";
import { AppPageLayout } from "@/components/app/app-page-layout";

export const metadata: Metadata = { title: "Meal Plans" };

export default async function MealPlansPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const { active, completed } = await listMealPlansForOwner(session.user.id);

  return (
    <MealPlanCreateProvider>
      <AppPageLayout
        title="Meal Plans"
        description="Build a date-range plan from your Recipes and Parts, then generate a grocery list that stays in sync while you shop."
        action={<MealPlanCreateTrigger />}
      >
        <CoachMark guideKey="meal-plans-intro" title="Meal Plans">
          A Meal Plan is a batch of planned meals across a date range, each
          pointing at an exact Recipe/Part Version. Add entries below, then
          generate a grocery list from the plan — it keeps synchronizing with
          later plan changes until you complete it, which freezes it as a
          historical record.
        </CoachMark>

        <MealPlanCreatePanel />

        <MealPlanListView active={active} completed={completed} />
      </AppPageLayout>
    </MealPlanCreateProvider>
  );
}
