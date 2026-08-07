import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import {
  listGroceryListsForOwner,
  listGrocerySourceCandidates,
} from "@/lib/grocery/queries";
import {
  GrocerySourcePickerProvider,
  GrocerySourcePickerTrigger,
  GrocerySourcePickerPanel,
} from "@/components/domain/grocery/grocery-source-picker";
import { GroceryListRows } from "@/components/domain/grocery/grocery-list-rows";
import { CoachMark } from "@/components/onboarding/coach-mark";

export const metadata: Metadata = { title: "Grocery lists" };

export default async function GroceryListsPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const [{ active, completed }, candidates] = await Promise.all([
    listGroceryListsForOwner(session.user.id),
    listGrocerySourceCandidates(session.user.id),
  ]);

  return (
    <GrocerySourcePickerProvider>
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-foreground text-2xl font-semibold">
              Grocery lists
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Generate a shopping list from your Recipes and Parts, combine
              equivalent items, and check them off as you shop.
            </p>
          </div>
          <GrocerySourcePickerTrigger hasCandidates={candidates.length > 0} />
        </div>

        <CoachMark guideKey="grocery-lists-intro" title="Grocery Lists">
          Generate a list from one or more Recipes/Parts, or from a Meal Plan.
          Equivalent items combine automatically, and checking items off here
          never changes the Recipe or Part itself.
        </CoachMark>

        <GrocerySourcePickerPanel candidates={candidates} />

        <GroceryListRows active={active} completed={completed} />
      </div>
    </GrocerySourcePickerProvider>
  );
}
