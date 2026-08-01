import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth/session";
import { listMealPlansForOwner } from "@/lib/mealplans/queries";
import { NewMealPlanForm } from "@/components/domain/mealplans/new-meal-plan-form";

export const metadata: Metadata = { title: "Meal Plans" };

function formatRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function MealPlansPage() {
  const session = await getServerSession();
  if (!session) redirect("/sign-in");

  const mealPlans = await listMealPlansForOwner(session.user.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Meal Plans
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Build a date-range plan from your Recipes and Parts, then generate a
          grocery list that stays in sync while you shop.
        </p>
      </div>

      <NewMealPlanForm />

      <div className="flex flex-col gap-2">
        {mealPlans.length === 0 ? (
          <p className="text-muted-foreground text-sm">No Meal Plans yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mealPlans.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/meal-plans/${plan.id}`}
                  className="border-border bg-card hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors"
                >
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      {plan.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatRange(plan.startDate, plan.endDate)} ·{" "}
                      {plan._count.entries} entr
                      {plan._count.entries === 1 ? "y" : "ies"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
