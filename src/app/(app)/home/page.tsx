import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listSessionsForOwner } from "@/lib/cooking/queries";
import { listRecentlyUpdatedDishes } from "@/lib/dishes/queries";
import { listMealPlansForOwner } from "@/lib/mealplans/queries";
import {
  listGroceryListsForOwner,
  listGrocerySourceCandidates,
} from "@/lib/grocery/queries";
import { prisma } from "@/lib/db/prisma";
import { HomeDashboard } from "@/components/domain/home/home-dashboard";

export const metadata: Metadata = {
  title: "Home",
};

const RECENTLY_UPDATED_LIMIT = 3;
const MEAL_PLAN_LIMIT = 3;
const GROCERY_LIST_LIMIT = 3;
const ACTIVE_SESSION_LIMIT = 3;

export default async function AppHomePage() {
  const session = await getServerSession();
  if (!session) {
    redirect("/sign-in");
  }
  const ownerId = session.user.id;

  const [
    sessions,
    preference,
    mealPlans,
    groceryLists,
    grocerySourceCandidates,
  ] = await Promise.all([
    listSessionsForOwner(ownerId),
    prisma.userPreference.findUnique({
      where: { userId: ownerId },
      select: { primaryRatingDisplay: true },
    }),
    listMealPlansForOwner(ownerId),
    listGroceryListsForOwner(ownerId),
    listGrocerySourceCandidates(ownerId),
  ]);
  const recentlyUpdated = await listRecentlyUpdatedDishes(
    ownerId,
    RECENTLY_UPDATED_LIMIT,
    preference?.primaryRatingDisplay ?? "GROUP_AVERAGE",
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Home
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Pick up where you left off.
        </p>
      </div>

      <HomeDashboard
        activeSessions={sessions.active.slice(0, ACTIVE_SESSION_LIMIT)}
        recentlyUpdated={recentlyUpdated}
        activeMealPlans={mealPlans.active.slice(0, MEAL_PLAN_LIMIT)}
        hasCompletedMealPlans={mealPlans.completed.length > 0}
        activeGroceryLists={groceryLists.active.slice(0, GROCERY_LIST_LIMIT)}
        grocerySourceCandidates={grocerySourceCandidates}
        mealPlanGroceryCandidates={mealPlans.active}
      />
    </div>
  );
}
