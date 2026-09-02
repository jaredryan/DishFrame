"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Eye,
  RotateCcw,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  EntityRowActions,
  type EntityRowAction,
} from "@/components/ui/entity-row-actions";
import {
  CLICKABLE_ROW_CLASS,
  ClickableRowOverlay,
} from "@/components/ui/clickable-row";
import { cn } from "@/lib/utils";
import {
  deleteGroceryList,
  completeGroceryList,
  reopenGroceryList,
} from "@/lib/grocery/list-actions";

export type GroceryListRowItem = {
  id: string;
  title: string;
  createdAt: Date;
  completedAt: Date | null;
  linkedMealPlanId: string | null;
  linkedMealPlan: { title: string } | null;
  _count: { items: number };
};

/**
 * Single Grocery List row, shared by the Grocery Lists index
 * (`GroceryListRows`) and the Home dashboard's "Grocery lists" section.
 * Follows the same settled entity-card rule `MealPlanCard` established:
 * `View details` is the card's primary action and default whole-row/card
 * click target; Mark complete/Reopen and Delete stay explicit secondary
 * icon controls, collapsing into `EntityRowActions`' shared overflow menu
 * at constrained card widths.
 */
export function GroceryListCard({ list }: { list: GroceryListRowItem }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const { showToast } = useToast();
  const isCompleted = list.completedAt != null;

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
      const result = await deleteGroceryList({ listId: list.id });
      setDeleteOpen(false);
      if (result.status === "success") {
        router.refresh();
      } else {
        showToast({
          variant: "error",
          title: result.message ?? "Could not delete this list.",
        });
      }
    });
  }

  const actions: EntityRowAction[] = [
    {
      key: "view",
      label: `View details for ${list.title}`,
      tooltip: "View details",
      icon: Eye,
      onClick: () => router.push(`/grocery-lists/${list.id}`),
    },
    isCompleted
      ? {
          key: "reopen",
          label: `Reopen ${list.title}`,
          tooltip: "Reopen",
          icon: RotateCcw,
          disabled: isPending,
          onClick: () =>
            runStatusChange(() => reopenGroceryList({ listId: list.id })),
        }
      : {
          key: "complete",
          label: `Mark ${list.title} complete`,
          tooltip: "Mark complete",
          icon: CheckCircle2,
          disabled: isPending,
          onClick: () =>
            runStatusChange(() => completeGroceryList({ listId: list.id })),
        },
    {
      key: "delete",
      label: `Delete ${list.title}`,
      tooltip: "Delete",
      icon: Trash2,
      destructive: true,
      onClick: () => setDeleteOpen(true),
    },
  ];

  return (
    <li
      className={cn(
        "border-border bg-card @container relative flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
        CLICKABLE_ROW_CLASS,
      )}
    >
      <ClickableRowOverlay
        href={`/grocery-lists/${list.id}`}
        label={`View details for ${list.title}`}
      />
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-medium">
          {list.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-muted-foreground text-xs">
            {list.createdAt.toLocaleDateString()} · {list._count.items} item
            {list._count.items === 1 ? "" : "s"}
          </p>
          {list.linkedMealPlanId && (
            <Link
              href={`/meal-plans/${list.linkedMealPlanId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-primary relative z-10 flex items-center text-xs font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              Linked to meal plan
              {list.linkedMealPlan ? `: ${list.linkedMealPlan.title}` : ""}
            </Link>
          )}
        </div>
      </div>
      <EntityRowActions actions={actions} className="relative z-10" />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        title={<>Delete &ldquo;{list.title}&rdquo;?</>}
        description="This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={isPending}
        onConfirmAction={confirmDelete}
      />
    </li>
  );
}

/**
 * Grocery Lists index — Active/Completed columns, same two-column layout as
 * the Cook and Meal Plans pages, each row a `GroceryListCard`.
 */
export function GroceryListRows({
  active,
  completed,
}: {
  active: GroceryListRowItem[];
  completed: GroceryListRowItem[];
}) {
  if (active.length === 0 && completed.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <ShoppingCart className="size-8" aria-hidden="true" />
        <p>No grocery lists yet — generate one from a Recipe or Part.</p>
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
          <p className="text-muted-foreground text-sm">
            No active grocery lists.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((list) => (
              <GroceryListCard key={list.id} list={list} />
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
            No completed grocery lists yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {completed.map((list) => (
              <GroceryListCard key={list.id} list={list} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
