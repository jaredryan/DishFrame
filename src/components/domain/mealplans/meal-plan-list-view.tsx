"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  CheckCircle2,
  Eye,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  CLICKABLE_ROW_CLASS,
  ClickableRowOverlay,
} from "@/components/ui/clickable-row";
import { cn } from "@/lib/utils";
import {
  deleteMealPlan,
  completeMealPlan,
  reactivateMealPlan,
} from "@/lib/mealplans/actions";
import { formatDateOnly } from "@/lib/date";

export type MealPlanRowData = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  _count: { entries: number };
};

function formatRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  return `${formatDateOnly(start, options)} – ${formatDateOnly(end, options)}`;
}

/**
 * Single Meal Plan row, shared by the Meal Plans index (`MealPlanListView`)
 * and the Home dashboard's "Meal plans" section. The whole row is also a
 * click target for View, its primary/leftmost action; Complete-or-
 * Reactivate/Delete stay explicit icon-only controls.
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
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { showToast } = useToast();

  function runStatusChange(
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.status === "success") {
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Something went wrong.",
        });
      }
    });
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteMealPlan({ mealPlanId: plan.id });
      setDeleteOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not delete this plan.",
        });
      }
    });
  }

  const isCompleted = variant === "completed";

  return (
    <li
      className={cn(
        "border-border bg-card relative flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
        CLICKABLE_ROW_CLASS,
      )}
    >
      <ClickableRowOverlay
        href={`/meal-plans/${plan.id}`}
        label={`View ${plan.title}`}
      />
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
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <TooltipIconButton
          label={`View ${plan.title}`}
          tooltip="View"
          icon={Eye}
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

      <ConfirmDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        title={<>Delete &ldquo;{plan.title}&rdquo;?</>}
        description="Linked grocery lists are kept as standalone lists rather than deleted. This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={isPending}
        onConfirmAction={confirmDelete}
      />
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
    <div className="grid gap-6 md:grid-cols-2 md:items-start">
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
