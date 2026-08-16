"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  duplicateMealPlan,
  deleteMealPlan,
  setMealPlanEntryStatus,
  startSessionFromEntry,
  generateGroceryListFromMealPlan,
} from "@/lib/mealplans/actions";
import type {
  MealPlanDetailDto,
  MealPlanEntryDto,
} from "@/lib/mealplans/schema";
import { formatDateOnly } from "@/lib/date";

/**
 * Read-only Meal Plan view (Slice 22 redesign) — the default destination for
 * an existing Meal Plan. Shows the plan's Details and Meals, plus the
 * day-to-day workflow actions that *use* a saved plan (Start cooking,
 * Resume session, Mark cooked/skipped) and the Grocery list section that
 * generates from it. Composition changes (title/dates, adding/removing
 * Meals, Planned meals, adopting a newer Version) live on the Edit page
 * instead — reached from the pencil action below.
 */

type ActionResult = { status: string; message?: string };
type RunAction = (action: () => Promise<ActionResult>) => void;

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COOKED: "Cooked",
  SKIPPED: "Skipped",
};

export function MealPlanView({ mealPlan }: { mealPlan: MealPlanDetailDto }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [reuseOpen, setReuseOpen] = React.useState(false);

  const runAction: RunAction = (action) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status !== "success") {
        setError(result.message ?? "Something went wrong.");
      } else {
        router.refresh();
      }
    });
  };

  function handleStartSession(entryId: string) {
    setError(null);
    startTransition(async () => {
      const result = await startSessionFromEntry({
        mealPlanId: mealPlan.id,
        entryId,
      });
      if (result.status === "success") {
        router.push(`/cook/${result.sessionId}`);
      } else {
        setError(result.message);
      }
    });
  }

  const sortedEntries = [...mealPlan.entries].sort((a, b) =>
    a.cookDate.localeCompare(b.cookDate),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
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
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

      {error && (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Meals</h2>
        {sortedEntries.length === 0 ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">
              No meals in this plan yet. Edit the meal plan to add meals.
            </p>
            <Button asChild size="sm">
              <Link href={`/meal-plans/${mealPlan.id}/edit`}>
                <Pencil /> Edit meal plan
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {sortedEntries.map((entry) => (
              <ViewEntryCard
                key={entry.id}
                mealPlanId={mealPlan.id}
                entry={entry}
                isPending={isPending}
                runAction={runAction}
                onStartSession={() => handleStartSession(entry.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Grocery lists</h2>
        {mealPlan.linkedGroceryLists.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No grocery lists generated yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mealPlan.linkedGroceryLists.map((list) => (
              <li key={list.id}>
                <Link
                  href={`/grocery-lists/${list.id}`}
                  className="border-border bg-card hover:bg-muted/50 flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors"
                >
                  <span className="text-sm">{list.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {list.completedAt
                      ? "Completed"
                      : list.mode === "MEAL_PLAN_LINKED"
                        ? "Synced"
                        : "Standalone"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => setGenerateOpen(true)}
          disabled={mealPlan.entries.length === 0}
        >
          Generate grocery list
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this meal plan?</DialogTitle>
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
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteMealPlan({
                    mealPlanId: mealPlan.id,
                  });
                  if (result.status === "success") {
                    router.push("/meal-plans");
                  } else {
                    setError(result.message ?? "Could not delete this plan.");
                    setDeleteOpen(false);
                  }
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {generateOpen && (
        <GenerateGroceryListDialog
          mealPlanId={mealPlan.id}
          entries={mealPlan.entries}
          onClose={() => setGenerateOpen(false)}
          onGenerated={(listId) => router.push(`/grocery-lists/${listId}`)}
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
 * silently shifting by the source plan's own span.
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
            disabled={isPending || !title.trim()}
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
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewEntryCard({
  mealPlanId,
  entry,
  isPending,
  runAction,
  onStartSession,
}: {
  mealPlanId: string;
  entry: MealPlanEntryDto;
  isPending: boolean;
  runAction: RunAction;
  onStartSession: () => void;
}) {
  const canStartSession =
    entry.dishId != null && entry.status !== "IN_PROGRESS";

  return (
    <li className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-medium">
            {entry.title}{" "}
            <span className="text-muted-foreground font-normal">
              {entry.versionLabel}
            </span>
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDateOnly(entry.cookDate)}
            {entry.targetYieldQuantity != null &&
              ` · Makes ${entry.targetYieldQuantity} ${entry.targetYieldUnit ?? ""}`.trim()}
          </p>
          {entry.note && (
            <p className="text-muted-foreground text-xs">{entry.note}</p>
          )}
          {entry.dishId == null && (
            <p className="text-destructive-text text-xs">
              Source deleted — kept for history.
            </p>
          )}
        </div>
        <Badge
          variant={
            entry.status === "COOKED"
              ? "default"
              : entry.status === "SKIPPED"
                ? "outline"
                : "secondary"
          }
        >
          {STATUS_LABEL[entry.status] ?? entry.status}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canStartSession && (
          <Button size="sm" disabled={isPending} onClick={onStartSession}>
            Start cooking
          </Button>
        )}
        {entry.status === "IN_PROGRESS" && entry.linkedSessionId && (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/cook/${entry.linkedSessionId}`}>Resume session</Link>
          </Button>
        )}
        {entry.status !== "COOKED" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              runAction(() =>
                setMealPlanEntryStatus({
                  mealPlanId,
                  entryId: entry.id,
                  status: "COOKED",
                }),
              )
            }
          >
            Mark cooked
          </Button>
        )}
        {entry.status !== "SKIPPED" && entry.status !== "COOKED" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              runAction(() =>
                setMealPlanEntryStatus({
                  mealPlanId,
                  entryId: entry.id,
                  status: "SKIPPED",
                }),
              )
            }
          >
            Mark skipped
          </Button>
        )}
      </div>

      {entry.plannedMeals.length > 0 && (
        <ul className="flex flex-col gap-1 pl-2">
          {entry.plannedMeals.map((meal) => (
            <li key={meal.id} className="text-muted-foreground text-xs">
              {meal.label} — {meal.servings} serving
              {meal.servings === 1 ? "" : "s"} ({formatDateOnly(meal.date)})
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function GenerateGroceryListDialog({
  mealPlanId,
  entries,
  onClose,
  onGenerated,
}: {
  mealPlanId: string;
  entries: MealPlanEntryDto[];
  onClose: () => void;
  onGenerated: (listId: string) => void;
}) {
  const [title, setTitle] = React.useState("Grocery list");
  const [selectedIds, setSelectedIds] = React.useState<string[]>(
    entries.map((e) => e.id),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate grocery list</DialogTitle>
          <DialogDescription>
            Choose which entries to include. The list stays synced with this
            plan while active.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="generate-title">Title</FieldLabel>
            <Input
              id="generate-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedIds.includes(entry.id)}
                    onCheckedChange={() => toggle(entry.id)}
                  />
                  {entry.title} ({formatDateOnly(entry.cookDate)})
                </label>
              </li>
            ))}
          </ul>
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
            disabled={isPending || selectedIds.length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await generateGroceryListFromMealPlan({
                  mealPlanId,
                  title,
                  entryIds: selectedIds,
                });
                if (result.status === "success") {
                  onGenerated(result.listId);
                } else {
                  setError(result.message);
                }
              })
            }
          >
            {isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
