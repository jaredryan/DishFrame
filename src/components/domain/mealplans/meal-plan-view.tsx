"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  ChefHat,
  Copy,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ShoppingCart,
  Soup,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { useToast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { CLICKABLE_ROW_CLASS } from "@/components/ui/clickable-row";
import {
  ViewScheduleDayCard,
  groupScheduleByDate,
  type ScheduleViewItem,
} from "@/components/domain/mealplans/schedule-shared";
import { GroceryListCard } from "@/components/domain/grocery/grocery-list-rows";
import {
  duplicateMealPlan,
  deleteMealPlan,
  completeMealPlan,
  reactivateMealPlan,
  setMealPlanEntryStatus,
  startSessionFromEntry,
  generateGroceryListFromMealPlan,
  setPlannedMealEaten,
  markScheduleDayEaten,
} from "@/lib/mealplans/actions";
import type {
  MealPlanDetailDto,
  MealPlanEntryDto,
} from "@/lib/mealplans/schema";
import { formatDateOnly, toIsoDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Meal Plan Details (Meal Plan QA redesign) — the read-only "put the plan
 * into practice" view. Three sections: `Meals to cook` (an execution list —
 * cooked checkbox + Cook action, nothing else), `Schedule` (when/how many
 * servings are intended to be eaten, with per-meal eaten checkboxes), and
 * `Grocery lists` (generated from this plan, kept automatically in sync).
 * Composition changes (title/dates, adding/removing Meals, the Schedule's
 * own structure) live on the Edit page instead, reached from the pencil
 * action below. A completed plan reuses this exact presentation read-only,
 * with active execution controls disabled rather than removed (§13).
 */

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

const CLOSED_PLAN_HINT = "This meal plan is closed. Reopen it to make changes.";

type ActionResult = { status: string; message?: string };
type EntryPendingAction = `cook-${string}` | `start-${string}`;
type ScheduleAction = `eaten-${string}` | `mark-day-${string}`;
type PendingKey =
  EntryPendingAction | ScheduleAction | "delete-plan" | "lifecycle";
type RunAction = (
  actionKey: PendingKey,
  action: () => Promise<ActionResult>,
) => void;

export function MealPlanView({ mealPlan }: { mealPlan: MealPlanDetailDto }) {
  const router = useRouter();
  const { pendingAction, isPending, run } = usePendingAction<PendingKey>();
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [reuseOpen, setReuseOpen] = React.useState(false);
  const { showToast } = useToast();

  // §6 optimistic checkbox UI — local overrides for cooked/eaten state, the
  // same pattern `GroceryListDetailView` already uses for its own checkbox
  // toggles: the checkbox reflects the override immediately, the mutation
  // persists in the background, and a failure rolls the override back and
  // shows the shared error toast rather than leaving a false success
  // displayed. Cleared once a successful mutation's `router.refresh()`
  // brings a new `mealPlan` prop (detected below), never stale otherwise.
  const [cookedOverrides, setCookedOverrides] = React.useState<
    Map<string, boolean>
  >(new Map());
  const [eatenOverrides, setEatenOverrides] = React.useState<
    Map<string, boolean>
  >(new Map());
  const [prevMealPlan, setPrevMealPlan] = React.useState(mealPlan);
  if (prevMealPlan !== mealPlan) {
    setPrevMealPlan(mealPlan);
    setCookedOverrides(new Map());
    setEatenOverrides(new Map());
  }

  const isCompleted = mealPlan.completedAt != null;

  const runAction: RunAction = (actionKey, action) => {
    run(actionKey, async () => {
      const result = await action();
      if (result.status !== "success") {
        showToast({
          variant: "error",
          title: result.message ?? "Something went wrong.",
        });
      } else {
        router.refresh();
      }
    });
  };

  function handleStartSession(entryId: string) {
    run(`start-${entryId}`, async () => {
      const result = await startSessionFromEntry({
        mealPlanId: mealPlan.id,
        entryId,
      });
      if (result.status === "success") {
        router.push(`/cook/${result.sessionId}`);
      } else {
        showToast({ variant: "error", title: result.message });
      }
    });
  }

  function handleCook(entry: MealPlanEntryDto) {
    if (entry.status === "IN_PROGRESS" && entry.linkedSessionId) {
      router.push(`/cook/${entry.linkedSessionId}`);
      return;
    }
    handleStartSession(entry.id);
  }

  function toggleCooked(entry: MealPlanEntryDto, checked: boolean) {
    const previous = cookedOverrides.get(entry.id) ?? entry.status === "COOKED";
    setCookedOverrides((prev) => new Map(prev).set(entry.id, checked));
    run(`cook-${entry.id}`, async () => {
      const result = await setMealPlanEntryStatus({
        mealPlanId: mealPlan.id,
        entryId: entry.id,
        status: checked ? "COOKED" : "PLANNED",
      });
      if (result.status === "success") {
        router.refresh();
      } else {
        setCookedOverrides((prev) => new Map(prev).set(entry.id, previous));
        showToast({
          variant: "error",
          title: result.message ?? "Could not update this meal.",
        });
      }
    });
  }

  function toggleEaten(plannedMealId: string, eaten: boolean) {
    const previous = eatenOverrides.get(plannedMealId);
    setEatenOverrides((prev) => new Map(prev).set(plannedMealId, eaten));
    run(`eaten-${plannedMealId}`, async () => {
      const result = await setPlannedMealEaten({
        mealPlanId: mealPlan.id,
        plannedMealId,
        eaten,
      });
      if (result.status === "success") {
        router.refresh();
      } else {
        setEatenOverrides((prev) => {
          const next = new Map(prev);
          if (previous === undefined) next.delete(plannedMealId);
          else next.set(plannedMealId, previous);
          return next;
        });
        showToast({
          variant: "error",
          title: result.message ?? "Could not update this meal.",
        });
      }
    });
  }

  function markDayEaten(dateIso: string) {
    const group = scheduleDayGroups.find((g) => g.dateIso === dateIso);
    const affectedIds = (group?.items ?? [])
      .filter((item) => !item.eaten)
      .map((item) => item.id);
    const previousValues = new Map(
      affectedIds.map((id) => [id, eatenOverrides.get(id)]),
    );
    setEatenOverrides((prev) => {
      const next = new Map(prev);
      for (const id of affectedIds) next.set(id, true);
      return next;
    });
    run(`mark-day-${dateIso}`, async () => {
      const result = await markScheduleDayEaten({
        mealPlanId: mealPlan.id,
        date: dateIso,
      });
      if (result.status === "success") {
        router.refresh();
      } else {
        setEatenOverrides((prev) => {
          const next = new Map(prev);
          for (const id of affectedIds) {
            const prior = previousValues.get(id);
            if (prior === undefined) next.delete(id);
            else next.set(id, prior);
          }
          return next;
        });
        showToast({
          variant: "error",
          title: result.message ?? "Could not update this day.",
        });
      }
    });
  }

  // Optimistic overrides applied before grouping/sorting, so a just-toggled
  // checkbox's day-card grouping, counts, and collapse state all react
  // immediately too — not just the checkbox itself.
  const displayEntries: MealPlanEntryDto[] = mealPlan.entries.map((entry) =>
    cookedOverrides.has(entry.id)
      ? {
          ...entry,
          status: cookedOverrides.get(entry.id)
            ? ("COOKED" as const)
            : ("PLANNED" as const),
        }
      : entry,
  );

  // §7 — unfinished (not yet cooked) meals first, cooked meals moved to the
  // end and visually de-emphasized; no user-defined ordering to preserve
  // here, so each group simply sorts by cook date.
  const unfinishedEntries = displayEntries
    .filter((e) => e.status !== "COOKED")
    .sort((a, b) => a.cookDate.localeCompare(b.cookDate));
  const cookedEntries = displayEntries
    .filter((e) => e.status === "COOKED")
    .sort((a, b) => a.cookDate.localeCompare(b.cookDate));
  const orderedEntries = [...unfinishedEntries, ...cookedEntries];

  const scheduleDayGroups = groupScheduleByDate(
    mealPlan.entries.flatMap((entry) =>
      entry.plannedMeals.map(
        (meal): ScheduleViewItem & { dateIso: string } => ({
          id: meal.id,
          label: meal.label,
          mealTitle: `${entry.title} ${entry.versionLabel}`.trim(),
          servings: meal.servings,
          eaten: eatenOverrides.get(meal.id) ?? meal.eaten,
          dateIso: isoDate(meal.date),
        }),
      ),
    ),
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: "Meal Plans", href: "/meal-plans" },
          { label: mealPlan.title },
        ]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {mealPlan.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatDateOnly(mealPlan.startDate)} –{" "}
            {formatDateOnly(mealPlan.endDate)}
          </p>
          {mealPlan.notes && (
            <p className="text-muted-foreground mt-1 text-sm">
              {mealPlan.notes}
            </p>
          )}
          {isCompleted && (
            <p className="text-muted-foreground mt-2 text-sm">
              This meal plan has been closed. Reopen it to make changes, or
              reuse this plan for future dates.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isCompleted ? (
            <DisabledActionHint explanation={CLOSED_PLAN_HINT}>
              <Button
                variant="outline"
                size="icon"
                disabled
                aria-label="Edit Meal Plan (unavailable)"
              >
                <Pencil aria-hidden="true" />
              </Button>
            </DisabledActionHint>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline" size="icon">
                    <Link
                      href={`/meal-plans/${mealPlan.id}/edit`}
                      aria-label="Edit Meal Plan"
                    >
                      <Pencil aria-hidden="true" />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Meal Plan</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuItem
                className="whitespace-nowrap"
                onClick={() => setReuseOpen(true)}
              >
                <Copy /> Reuse for new dates
              </DropdownMenuItem>
              {isCompleted ? (
                <DropdownMenuItem
                  onClick={() =>
                    runAction("lifecycle", () =>
                      reactivateMealPlan({ mealPlanId: mealPlan.id }),
                    )
                  }
                >
                  <RotateCcw /> Reopen
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() =>
                    runAction("lifecycle", () =>
                      completeMealPlan({ mealPlanId: mealPlan.id }),
                    )
                  }
                >
                  Mark complete
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Meals to cook</h2>
        {orderedEntries.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">
              No meals in this plan yet. Edit the meal plan to add meals.
            </p>
            {!isCompleted && (
              <Button asChild size="sm">
                <Link href={`/meal-plans/${mealPlan.id}/edit`}>
                  <Pencil /> Edit meal plan
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 md:items-start">
            {orderedEntries.map((entry) => (
              <MealsToCookCard
                key={entry.id}
                entry={entry}
                disabled={isCompleted}
                isPending={isPending}
                pendingAction={pendingAction}
                onToggleCooked={(checked) => toggleCooked(entry, checked)}
                onCook={() => handleCook(entry)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Schedule</h2>
        {scheduleDayGroups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nothing scheduled for this meal plan yet.
          </p>
        ) : (
          <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {scheduleDayGroups.map((group) => (
              <ViewScheduleDayCard
                key={group.dateIso}
                dateIso={group.dateIso}
                items={group.items}
                disabled={isCompleted}
                onToggleEatenAction={toggleEaten}
                onMarkAllEatenAction={() => markDayEaten(group.dateIso)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-lg font-medium">Grocery lists</h2>
          {isCompleted ? (
            <DisabledActionHint explanation={CLOSED_PLAN_HINT}>
              <Button size="sm" disabled>
                <ShoppingCart /> Generate grocery list
              </Button>
            </DisabledActionHint>
          ) : (
            <Button
              size="sm"
              onClick={() => setGenerateOpen(true)}
              disabled={mealPlan.entries.length === 0}
            >
              <ShoppingCart /> Generate grocery list
            </Button>
          )}
        </div>
        {mealPlan.linkedGroceryLists.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No grocery lists generated yet.
          </p>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 md:items-start">
            {mealPlan.linkedGroceryLists.map((list) => (
              <GroceryListCard
                key={list.id}
                showLifecycleBadge
                list={{
                  id: list.id,
                  title: list.title,
                  date: new Date(list.plannedDate),
                  completedAt: list.completedAt
                    ? new Date(list.completedAt)
                    : null,
                  itemCount: list.itemCount,
                }}
              />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChangeAction={setDeleteOpen}
        title="Delete this meal plan?"
        description="Linked grocery lists are kept as standalone lists rather than deleted. This can't be undone."
        confirmLabel="Delete"
        destructive
        loading={pendingAction === "delete-plan"}
        onConfirmAction={() =>
          run("delete-plan", async () => {
            const result = await deleteMealPlan({
              mealPlanId: mealPlan.id,
            });
            if (result.status === "success") {
              router.push("/meal-plans");
            } else {
              showToast({
                variant: "error",
                title: result.message ?? "Could not delete this plan.",
              });
              setDeleteOpen(false);
            }
          })
        }
      />

      {generateOpen && (
        <GenerateGroceryListDialog
          mealPlanId={mealPlan.id}
          entries={mealPlan.entries}
          onClose={() => setGenerateOpen(false)}
          onSaved={(listId) => router.push(`/grocery-lists/${listId}`)}
        />
      )}

      {reuseOpen && (
        <ReuseMealPlanDialog
          mealPlan={mealPlan}
          onClose={() => setReuseOpen(false)}
          onReused={(newMealPlanId) =>
            router.push(`/meal-plans/${newMealPlanId}`)
          }
        />
      )}
    </div>
  );
}

/**
 * "Reuse for new dates" (the former "Copy to next date range" overflow
 * action) — same `duplicateMealPlan` call (existing meals/content
 * preserved), now asking for the new plan's Name/Start/End instead of
 * silently shifting by the source plan's own span. Enabled regardless of
 * completed state (§13) — it's the primary reason to revisit a closed plan.
 */
function ReuseMealPlanDialog({
  mealPlan,
  onClose,
  onReused,
}: {
  mealPlan: MealPlanDetailDto;
  onClose: () => void;
  onReused: (mealPlanId: string) => void;
}) {
  const start = new Date(mealPlan.startDate);
  const end = new Date(mealPlan.endDate);
  const spanMs = end.getTime() - start.getTime();
  const defaultStart = new Date(end.getTime());
  const defaultEnd = new Date(defaultStart.getTime() + spanMs);

  const [title, setTitle] = React.useState(`${mealPlan.title} (copy)`);
  const [startDate, setStartDate] = React.useState(
    isoDate(defaultStart.toISOString()),
  );
  const [endDate, setEndDate] = React.useState(
    isoDate(defaultEnd.toISOString()),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reuse meal plan</DialogTitle>
          <DialogDescription>
            Creates a copy of this plan, with its meals, using the name and date
            range below.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="reuse-title">Name</FieldLabel>
            <Input
              id="reuse-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="reuse-start">Start date</FieldLabel>
              <DatePickerField
                id="reuse-start"
                value={startDate}
                onChange={setStartDate}
                ariaLabel="Start date"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reuse-end">End date</FieldLabel>
              <DatePickerField
                id="reuse-end"
                value={endDate}
                onChange={setEndDate}
                ariaLabel="End date"
              />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim()}
            loading={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await duplicateMealPlan({
                  mealPlanId: mealPlan.id,
                  title,
                  startDate,
                  endDate,
                });
                if (result.status === "success") {
                  onReused(result.mealPlanId);
                } else {
                  setError(result.message);
                }
              })
            }
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function yieldChipLabel(quantity: number | null, unit: string | null): string {
  return quantity != null
    ? `Makes ${quantity} ${unit ?? ""}`.trim()
    : "No specified yield";
}

/**
 * §7 — the execution-list card: a large-hit-region cooked checkbox on the
 * left, entry info in the middle, and the single remaining explicit action
 * (Cook) on the right. Clicking anywhere else on the card triggers Cook;
 * the checkbox region and the Cook icon both stop that click from
 * double-firing.
 */
function MealsToCookCard({
  entry,
  disabled,
  isPending,
  pendingAction,
  onToggleCooked,
  onCook,
}: {
  entry: MealPlanEntryDto;
  disabled: boolean;
  isPending: boolean;
  pendingAction: string | null;
  onToggleCooked: (checked: boolean) => void;
  onCook: () => void;
}) {
  const cooked = entry.status === "COOKED";
  const canCook = entry.dishId != null && !disabled;
  const checkboxLabel = cooked
    ? "This meal was cooked"
    : "This meal has not yet been cooked";
  const cookTooltip =
    entry.status === "IN_PROGRESS" ? "Resume cooking session" : "Cook";

  function handleRowClick() {
    if (!canCook) return;
    onCook();
  }

  return (
    <li
      role={canCook ? "button" : undefined}
      tabIndex={canCook ? 0 : undefined}
      aria-label={canCook ? `Cook ${entry.title}` : undefined}
      onClick={handleRowClick}
      onKeyDown={(event) => {
        if (!canCook) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onCook();
        }
      }}
      className={cn(
        "border-border bg-card flex items-stretch gap-0 rounded-lg border",
        cooked && "opacity-60",
        canCook && cn(CLICKABLE_ROW_CLASS, "cursor-pointer"),
      )}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className="flex shrink-0 cursor-pointer items-center justify-center self-stretch pr-2 pl-4 pointer-coarse:pl-6"
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox
                checked={cooked}
                disabled={disabled}
                aria-label={checkboxLabel}
                onCheckedChange={(checked) => onToggleCooked(checked === true)}
              />
            </label>
          </TooltipTrigger>
          <TooltipContent>{checkboxLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-4 pr-2 pl-2">
        <p className="text-foreground text-sm font-medium">
          {entry.title}{" "}
          <span className="text-muted-foreground font-normal">
            {entry.versionLabel}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="gap-1">
            <CalendarDays className="size-3" aria-hidden="true" />
            {formatDateOnly(entry.cookDate)}
          </Badge>
          <SemanticChip semantic="orange">
            <Soup className="size-3" aria-hidden="true" />
            {yieldChipLabel(entry.targetYieldQuantity, entry.targetYieldUnit)}
          </SemanticChip>
        </div>
        {entry.dishId == null && (
          <p className="text-destructive-text text-xs">
            Source deleted — kept for history.
          </p>
        )}
      </div>

      <div
        className="flex shrink-0 items-center pr-3"
        onClick={(event) => event.stopPropagation()}
      >
        {!canCook ? (
          <DisabledActionHint
            explanation={
              disabled
                ? CLOSED_PLAN_HINT
                : "Source deleted — this meal can no longer be cooked from the plan."
            }
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled
              aria-label="Cook (unavailable)"
            >
              <ChefHat className="size-4" aria-hidden="true" />
            </Button>
          </DisabledActionHint>
        ) : (
          <TooltipIconButton
            label={cookTooltip}
            tooltip={cookTooltip}
            icon={ChefHat}
            disabled={isPending}
            loading={pendingAction === `start-${entry.id}`}
            onClick={onCook}
          />
        )}
      </div>
    </li>
  );
}

/**
 * §9 — the Generate-grocery-list form: Name, Date, Meals to include, in
 * that order, matching the ordinary Grocery List generation flow's field
 * order. Creates a new Meal-Plan-linked list.
 *
 * A prior "Edit" mode (regenerating an existing linked list's title/date/
 * included meals in place) was dropped from this dialog when the Meal Plan
 * Details grocery-list card switched to the shared `GroceryListCard` (§9
 * card-reuse) — that card's action set (View/Mark complete-or-Reopen/
 * Delete) matches the Grocery Lists page and has no per-card Edit. The
 * now-dead `updateMealPlanLinkedGroceryList` action/schema/service function
 * and its integration test were removed with it.
 */
function GenerateGroceryListDialog({
  mealPlanId,
  entries,
  onClose,
  onSaved,
}: {
  mealPlanId: string;
  entries: MealPlanEntryDto[];
  onClose: () => void;
  onSaved: (listId: string) => void;
}) {
  const [title, setTitle] = React.useState("Grocery list");
  const [plannedDate, setPlannedDate] = React.useState(() =>
    toIsoDateOnly(new Date()),
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>(() =>
    entries.map((e) => e.id),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSave() {
    startTransition(async () => {
      const result = await generateGroceryListFromMealPlan({
        mealPlanId,
        title,
        plannedDate,
        entryIds: selectedIds,
      });
      if (result.status === "success") {
        onSaved(result.listId);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate grocery list</DialogTitle>
          <DialogDescription>
            Choose which meals to include. The list stays synced with this
            plan while active.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="grocery-list-title">Name</FieldLabel>
            <Input
              id="grocery-list-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="grocery-list-date">Date</FieldLabel>
            <DatePickerField
              id="grocery-list-date"
              value={plannedDate}
              onChange={setPlannedDate}
              ariaLabel="Grocery list date"
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Meals to include</span>
            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <label className="flex items-center gap-2 py-1 text-sm">
                    <Checkbox
                      checked={selectedIds.includes(entry.id)}
                      onCheckedChange={() => toggle(entry.id)}
                      aria-label={entry.title}
                    />
                    {entry.title} ({formatDateOnly(entry.cookDate)})
                  </label>
                </li>
              ))}
            </ul>
          </div>
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={selectedIds.length === 0 || !title.trim()}
            loading={isPending}
            onClick={handleSave}
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
