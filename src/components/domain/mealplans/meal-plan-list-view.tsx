"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  deleteMealPlan,
  completeMealPlan,
  reactivateMealPlan,
} from "@/lib/mealplans/actions";

export type MealPlanRowData = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  _count: { entries: number };
};

function formatRange(start: Date, end: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Single Meal Plan row, shared by the Meal Plans index (`MealPlanListView`)
 * and the Home dashboard's "Meal plans" section — one card, no row-level
 * click-through; Edit/Complete-or-Reactivate/Delete are the only ways to
 * act on a row.
 */
export function MealPlanCard({
  plan,
  variant,
}: {
  plan: MealPlanRowData;
  variant: "active" | "completed";
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  function runStatusChange(
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message ?? "Something went wrong.");
      }
    });
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteMealPlan({ mealPlanId: plan.id });
      setDeleteOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        setError(result.message ?? "Could not delete this plan.");
      }
    });
  }

  const isCompleted = variant === "completed";

  return (
    <li className="border-border bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-medium">
          {plan.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-xs">
            {formatRange(plan.startDate, plan.endDate)} · {plan._count.entries}{" "}
            entr{plan._count.entries === 1 ? "y" : "ies"}
          </span>
        </div>
        {error && (
          <p role="alert" className="text-destructive-text mt-1 text-xs">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <TooltipIconButton
          label={`Edit ${plan.title}`}
          tooltip="Edit"
          icon={Pencil}
          onClick={() => router.push(`/meal-plans/${plan.id}`)}
        />
        {isCompleted ? (
          <TooltipIconButton
            label={`Reactivate ${plan.title}`}
            tooltip="Reactivate"
            icon={RotateCcw}
            disabled={isPending}
            onClick={() =>
              runStatusChange(() => reactivateMealPlan({ mealPlanId: plan.id }))
            }
          />
        ) : (
          <TooltipIconButton
            label={`Mark ${plan.title} completed`}
            tooltip="Mark completed"
            icon={CheckCircle2}
            disabled={isPending}
            onClick={() =>
              runStatusChange(() => completeMealPlan({ mealPlanId: plan.id }))
            }
          />
        )}
        <TooltipIconButton
          label={`Delete ${plan.title}`}
          tooltip="Delete"
          icon={Trash2}
          className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
          onClick={() => setDeleteOpen(true)}
        />
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{plan.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              Linked grocery lists are kept as standalone lists rather than
              deleted. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

/**
 * Meal Plans index — Active/Completed columns, each row a `MealPlanCard`.
 */
export function MealPlanListView({
  active,
  completed,
}: {
  active: MealPlanRowData[];
  completed: MealPlanRowData[];
}) {
  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <CalendarRange className="size-8" aria-hidden="true" />
        <p>No Meal Plans yet — create one to start planning.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Active
        </h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground text-sm">No active Meal Plans.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((plan) => (
              <MealPlanCard key={plan.id} plan={plan} variant="active" />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Completed
        </h2>
        {completed.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No completed Meal Plans yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {completed.map((plan) => (
              <MealPlanCard key={plan.id} plan={plan} variant="completed" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
