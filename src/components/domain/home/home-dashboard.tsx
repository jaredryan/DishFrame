import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChefHat,
  Clock,
  ListChecks,
  ShoppingCart,
  CalendarRange,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ActiveCookSessionCard,
  type SessionRowData,
} from "@/components/domain/cooking/cook-sessions-view";
import { StartCookingButton } from "@/components/domain/cooking/start-cooking-button";
import {
  MealPlanCard,
  type MealPlanRowData,
} from "@/components/domain/mealplans/meal-plan-list-view";
import {
  GroceryListCard,
  type GroceryListRowItem,
} from "@/components/domain/grocery/grocery-list-rows";
import { DishCompactCard } from "@/components/domain/dish/dish-compact-card";
import type { DishCardItem } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";
import { CreateDishMenu } from "@/components/domain/home/create-dish-menu";

export type RecentlyUpdatedDishItem = DishCardItem & { kind: DishKindValue };

export type HomeDashboardProps = {
  activeSessions: SessionRowData[];
  recentlyUpdated: RecentlyUpdatedDishItem[];
  activeMealPlans: MealPlanRowData[];
  hasCompletedMealPlans: boolean;
  activeGroceryLists: GroceryListRowItem[];
};

function SectionCard({
  title,
  icon: Icon,
  action,
  footer,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  action: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-foreground flex items-center gap-2 text-sm font-semibold">
          <Icon className="text-muted-foreground size-4" aria-hidden={true} />
          {title}
        </h2>
        {action}
      </div>
      {children}
      <div className="flex flex-wrap items-center gap-4">{footer}</div>
    </section>
  );
}

function ViewLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs hover:underline"
    >
      {children}
      <ArrowRight className="size-3" aria-hidden="true" />
    </Link>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

/**
 * Home dashboard's four sections, each combining a mini-list of current
 * work with a top-right primary create/start action and bottom-left View
 * link(s) into the corresponding full page. Pure presentational component —
 * `home/page.tsx` fetches the data, so this stays testable without mocking
 * the session/database.
 */
export function HomeDashboard({
  activeSessions,
  recentlyUpdated,
  activeMealPlans,
  hasCompletedMealPlans,
  activeGroceryLists,
}: HomeDashboardProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="Continue cooking"
        icon={ChefHat}
        action={<StartCookingButton size="sm" />}
        footer={<ViewLink href="/cook">View cooking sessions</ViewLink>}
      >
        {activeSessions.length === 0 ? (
          <EmptyRow>
            Open a Recipe or Part and choose{" "}
            <span className="text-foreground font-medium">Cook</span> to start a
            Cooking Session.
          </EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeSessions.map((s) => (
              <ActiveCookSessionCard key={s.id} session={s} />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Recently updated"
        icon={Clock}
        action={<CreateDishMenu />}
        footer={
          <>
            <ViewLink href="/recipes">View recipes</ViewLink>
            <ViewLink href="/parts">View parts</ViewLink>
          </>
        }
      >
        {recentlyUpdated.length === 0 ? (
          <EmptyRow>
            Nothing saved yet —{" "}
            <Link href="/recipes/new" className="text-foreground underline">
              create your first Recipe
            </Link>
            .
          </EmptyRow>
        ) : (
          <div className="flex flex-col gap-2">
            {recentlyUpdated.map((dish) => (
              <DishCompactCard
                key={dish.id}
                dish={dish}
                kind={dish.kind}
                showKind
              />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Meal plans"
        icon={CalendarRange}
        action={
          <Button size="sm" asChild>
            <Link href="/meal-plans/new">
              <CalendarDays />
              Plan meals
            </Link>
          </Button>
        }
        footer={<ViewLink href="/meal-plans">View meal plans</ViewLink>}
      >
        {activeMealPlans.length === 0 ? (
          <EmptyRow>
            {hasCompletedMealPlans
              ? "No active Meal Plans — previous plans remain available from the Meal Plans page."
              : "No Meal Plans yet."}
          </EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeMealPlans.map((plan) => (
              <MealPlanCard key={plan.id} plan={plan} variant="active" />
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Grocery lists"
        icon={ShoppingCart}
        action={
          <Button size="sm" asChild>
            <Link href="/grocery-lists">
              <ListChecks />
              Make grocery list
            </Link>
          </Button>
        }
        footer={<ViewLink href="/grocery-lists">View grocery lists</ViewLink>}
      >
        {activeGroceryLists.length === 0 ? (
          <EmptyRow>No active grocery lists.</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeGroceryLists.map((list) => (
              <GroceryListCard key={list.id} list={list} variant="active" />
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
