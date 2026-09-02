import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  listGroceryListsForOwner,
  listGrocerySourceCandidates,
} from "@/lib/grocery/queries";
import { listMealPlansForOwner } from "@/lib/mealplans/queries";
import {
  GrocerySourcePickerProvider,
  GrocerySourcePickerTrigger,
  GrocerySourcePickerPanel,
} from "@/components/domain/grocery/grocery-source-picker";
import { GroceryListRows } from "@/components/domain/grocery/grocery-list-rows";
import { CoachMark } from "@/components/onboarding/coach-mark";
import { AppPageLayout } from "@/components/app/app-page-layout";

export const metadata: Metadata = { title: "Grocery lists" };

export default async function GroceryListsPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const [{ active, completed }, candidates, mealPlans] = await Promise.all([
    listGroceryListsForOwner(session.user.id),
    listGrocerySourceCandidates(session.user.id),
    listMealPlansForOwner(session.user.id),
  ]);
  const hasAnyCandidates = candidates.length > 0 || mealPlans.active.length > 0;

  return (
    <GrocerySourcePickerProvider>
      <AppPageLayout
        title="Grocery lists"
        description="Generate a shopping list from your Recipes and Parts, combine equivalent items, and check them off as you shop."
        action={<GrocerySourcePickerTrigger hasCandidates={hasAnyCandidates} />}
      >
        <CoachMark guideKey="grocery-lists-intro" title="Grocery Lists">
          Generate a list from one or more Recipes/Parts, or from a Meal Plan.
          Equivalent items combine automatically, and checking items off here
          never changes the Recipe or Part itself.
        </CoachMark>

        <GrocerySourcePickerPanel
          candidates={candidates}
          mealPlanCandidates={mealPlans.active}
        />

        <GroceryListRows active={active} completed={completed} />
      </AppPageLayout>
    </GrocerySourcePickerProvider>
  );
}
