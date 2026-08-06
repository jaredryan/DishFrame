"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { ScaleControl } from "@/components/domain/cooking/scale-control";
import {
  duplicateMealPlan,
  deleteMealPlan,
  addMealPlanEntry,
  updateMealPlanEntry,
  removeMealPlanEntry,
  setMealPlanEntryStatus,
  adoptNewerVersionInEntry,
  addPlannedMeal,
  removePlannedMeal,
  startSessionFromEntry,
  generateGroceryListFromMealPlan,
  getMealPlanRecommendations,
} from "@/lib/mealplans/actions";
import { computeAllocationStatus } from "@/lib/mealplans/allocation";
import type {
  MealPlanDetailDto,
  MealPlanEntryDto,
} from "@/lib/mealplans/schema";
import type { MealPlanEntryCandidate } from "@/lib/mealplans/queries";
import type { Recommendation } from "@/lib/mealplans/recommendations";

/**
 * Meal Plan detail — plan builder, entry status tracking wired to Cooking
 * Sessions, the explainable recommendation panel, and the linked
 * grocery-list view (BUILD_PLAN.md Slice 15). Same client-component
 * mutation pattern `grocery-list-detail-view.tsx` established: a single
 * `runAction`/`isPending` pair shared by every mutation on the page,
 * `router.refresh()` on success to pull the server-recomputed state.
 */

type ActionResult = { status: string; message?: string };
type RunAction = (action: () => Promise<ActionResult>) => void;

function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COOKED: "Cooked",
  SKIPPED: "Skipped",
};

export function MealPlanDetailView({
  mealPlan,
  candidates,
}: {
  mealPlan: MealPlanDetailDto;
  candidates: MealPlanEntryCandidate[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [prefillDishId, setPrefillDishId] = React.useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  const runAction: RunAction = (action) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status !== "success") {
        setError(result.message ?? "Something went wrong.");
      } else {
        refresh();
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-semibold">
            {mealPlan.title}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatDate(mealPlan.startDate)} – {formatDate(mealPlan.endDate)}
          </p>
          {mealPlan.notes && (
            <p className="text-muted-foreground mt-1 text-sm">
              {mealPlan.notes}
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon">
              <MoreHorizontal aria-hidden="true" />
              <span className="sr-only">Meal Plan actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                startTransition(async () => {
                  const start = new Date(mealPlan.startDate);
                  const end = new Date(mealPlan.endDate);
                  const spanMs = end.getTime() - start.getTime();
                  const newStart = new Date(end.getTime());
                  const newEnd = new Date(newStart.getTime() + spanMs);
                  const result = await duplicateMealPlan({
                    mealPlanId: mealPlan.id,
                    title: `${mealPlan.title} (copy)`,
                    startDate: isoDate(newStart.toISOString()),
                    endDate: isoDate(newEnd.toISOString()),
                  });
                  if (result.status === "success") {
                    router.push(`/meal-plans/${result.mealPlanId}`);
                  } else {
                    setError(result.message);
                  }
                })
              }
            >
              Duplicate into next range
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive-text"
              onClick={() => setDeleteOpen(true)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Entries
        </h2>
        {sortedEntries.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No entries yet — add a Recipe or Part below.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sortedEntries.map((entry) => (
              <EntryCard
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

      <AddEntryForm
        mealPlanId={mealPlan.id}
        candidates={candidates}
        runAction={runAction}
        isPending={isPending}
        prefillDishId={prefillDishId}
        onConsumedPrefill={() => setPrefillDishId(null)}
      />

      <RecommendationsPanel
        candidates={candidates}
        onAddDish={(dishId) => setPrefillDishId(dishId)}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Grocery lists
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGenerateOpen(true)}
            disabled={mealPlan.entries.length === 0}
          >
            Generate grocery list
          </Button>
        </div>
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
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this Meal Plan?</DialogTitle>
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
    </div>
  );
}

function EntryCard({
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
  const [editing, setEditing] = React.useState(false);
  const [addingMeal, setAddingMeal] = React.useState(false);
  const allocation = computeAllocationStatus(
    entry.targetYieldQuantity,
    entry.plannedMeals,
  );
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
            {formatDate(entry.cookDate)}
            {entry.targetYieldQuantity != null &&
              ` · Makes ${entry.targetYieldQuantity} ${entry.targetYieldUnit ?? ""}`.trim()}
          </p>
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
        {entry.dishId != null && (
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              runAction(() =>
                adoptNewerVersionInEntry({ mealPlanId, entryId: entry.id }),
              )
            }
          >
            Update to latest Version
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing((p) => !p)}>
          {editing ? "Close" : "Edit"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive-text"
          disabled={isPending}
          onClick={() =>
            runAction(() =>
              removeMealPlanEntry({ mealPlanId, entryId: entry.id }),
            )
          }
        >
          Remove
        </Button>
      </div>

      {editing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const cookDate = String(formData.get("cookDate") ?? "");
            const targetYieldQuantity = String(
              formData.get("targetYieldQuantity") ?? "",
            ).trim();
            const note = String(formData.get("note") ?? "").trim();
            runAction(() =>
              updateMealPlanEntry({
                mealPlanId,
                entryId: entry.id,
                cookDate: cookDate ? new Date(cookDate) : undefined,
                targetYieldQuantity: targetYieldQuantity
                  ? Number(targetYieldQuantity)
                  : null,
                note: note || null,
              }),
            );
            setEditing(false);
          }}
        >
          <Field>
            <FieldLabel htmlFor={`cookDate-${entry.id}`}>Cook date</FieldLabel>
            <Input
              id={`cookDate-${entry.id}`}
              name="cookDate"
              type="date"
              defaultValue={isoDate(entry.cookDate)}
              className="h-9"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`yield-${entry.id}`}>Target yield</FieldLabel>
            <Input
              id={`yield-${entry.id}`}
              name="targetYieldQuantity"
              type="number"
              step="any"
              min="0"
              defaultValue={entry.targetYieldQuantity ?? ""}
              className="h-9 w-24"
              placeholder="Auto"
            />
          </Field>
          <Field className="min-w-40 flex-1">
            <FieldLabel htmlFor={`note-${entry.id}`}>Note</FieldLabel>
            <Input
              id={`note-${entry.id}`}
              name="note"
              defaultValue={entry.note ?? ""}
              className="h-9"
            />
          </Field>
          <Button type="submit" size="sm">
            Save
          </Button>
        </form>
      )}

      <div className="flex flex-col gap-1 pl-2">
        {entry.plannedMeals.length > 0 && (
          <ul className="flex flex-col gap-1">
            {entry.plannedMeals.map((meal) => (
              <li
                key={meal.id}
                className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
              >
                <span>
                  {meal.label} — {meal.servings} serving
                  {meal.servings === 1 ? "" : "s"} ({formatDate(meal.date)})
                </span>
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    runAction(() =>
                      removePlannedMeal({
                        mealPlanId,
                        entryId: entry.id,
                        plannedMealId: meal.id,
                      }),
                    )
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {allocation !== "unknown" && (
          <Badge
            variant={allocation === "balanced" ? "outline" : "secondary"}
            className="w-fit"
          >
            {allocation === "under" && "Yield not fully allocated"}
            {allocation === "over" && "Allocated more than expected yield"}
            {allocation === "balanced" && "Fully allocated"}
          </Badge>
        )}
        {addingMeal ? (
          <form
            className="mt-1 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const label = String(formData.get("label") ?? "").trim();
              const date = String(formData.get("date") ?? "");
              const servings = Number(formData.get("servings") ?? 0);
              if (label && date && servings > 0) {
                runAction(() =>
                  addPlannedMeal({
                    mealPlanId,
                    entryId: entry.id,
                    label,
                    date: new Date(date),
                    servings,
                  }),
                );
                setAddingMeal(false);
              }
            }}
          >
            <Input
              name="label"
              placeholder="e.g. Monday lunch"
              className="h-8 w-40"
            />
            <Input
              name="date"
              type="date"
              defaultValue={isoDate(entry.cookDate)}
              className="h-8"
            />
            <Input
              name="servings"
              type="number"
              step="any"
              min="0"
              placeholder="Servings"
              className="h-8 w-24"
            />
            <Button type="submit" size="sm">
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAddingMeal(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto w-fit px-0"
            onClick={() => setAddingMeal(true)}
          >
            + Planned meal
          </Button>
        )}
      </div>
    </li>
  );
}

function AddEntryForm({
  mealPlanId,
  candidates,
  runAction,
  isPending,
  prefillDishId,
  onConsumedPrefill,
}: {
  mealPlanId: string;
  candidates: MealPlanEntryCandidate[];
  runAction: RunAction;
  isPending: boolean;
  prefillDishId: string | null;
  onConsumedPrefill: () => void;
}) {
  const [dishId, setDishId] = React.useState("");
  const [cookDate, setCookDate] = React.useState(() =>
    isoDate(new Date().toISOString()),
  );
  const [targetMultiplier, setTargetMultiplier] = React.useState<number | null>(
    null,
  );
  const [note, setNote] = React.useState("");

  // Adjust dishId while rendering (react.dev/learn/you-might-not-need-an-effect)
  // instead of syncing it from the prop in an effect.
  const [appliedPrefillDishId, setAppliedPrefillDishId] = React.useState<
    string | null
  >(null);
  if (prefillDishId && prefillDishId !== appliedPrefillDishId) {
    setAppliedPrefillDishId(prefillDishId);
    setDishId(prefillDishId);
  }

  React.useEffect(() => {
    if (prefillDishId) {
      onConsumedPrefill();
    }
  }, [prefillDishId, onConsumedPrefill]);

  const candidate = candidates.find((c) => c.dishId === dishId);

  return (
    <ContentCard className="gap-4">
      <h2 className={CONTENT_CARD_TITLE_CLASS}>Add to plan</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!dishId) return;
          const targetYieldQuantity =
            candidate?.yieldQuantity != null && targetMultiplier != null
              ? candidate.yieldQuantity * targetMultiplier
              : null;
          runAction(() =>
            addMealPlanEntry({
              mealPlanId,
              dishId,
              cookDate: new Date(cookDate),
              targetYieldQuantity,
              targetYieldUnit: candidate?.yieldUnit ?? null,
              note: note || null,
            }),
          );
          setNote("");
          setTargetMultiplier(null);
        }}
      >
        <Field>
          <FieldLabel htmlFor="entry-dish">Recipe or Part</FieldLabel>
          <Select value={dishId} onValueChange={setDishId}>
            <SelectTrigger
              id="entry-dish"
              aria-label="Recipe or Part"
              className="w-full"
            >
              <SelectValue placeholder="Choose…" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.dishId} value={c.dishId}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="entry-date">Cook date</FieldLabel>
          <Input
            id="entry-date"
            type="date"
            value={cookDate}
            onChange={(e) => setCookDate(e.target.value)}
            className="w-48"
          />
        </Field>
        {candidate && (
          <ScaleControl
            outputQuantity={candidate.yieldQuantity}
            outputUnit={candidate.yieldUnit}
            targetLabel="Target yield"
            onMultiplierChange={setTargetMultiplier}
          />
        )}
        <Field>
          <FieldLabel htmlFor="entry-note">Note</FieldLabel>
          <Input
            id="entry-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <div>
          <Button type="submit" disabled={!dishId || isPending}>
            Add entry
          </Button>
        </div>
      </form>
    </ContentCard>
  );
}

function RecommendationsPanel({
  candidates,
  onAddDish,
}: {
  candidates: MealPlanEntryCandidate[];
  onAddDish: (dishId: string) => void;
}) {
  const [includeExperimental, setIncludeExperimental] = React.useState(false);
  const [includeIdea, setIncludeIdea] = React.useState(false);
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const [results, setResults] = React.useState<Recommendation[] | null>(null);
  const [recipeEligibility, setRecipeEligibility] = React.useState<{
    totalRecipeCount: number;
    eligibleRecipeCount: number;
  } | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function fetchRecommendations() {
    setError(null);
    startTransition(async () => {
      const result = await getMealPlanRecommendations({
        includeExperimental,
        includeIdea,
        favoritesOnly,
      });
      if (result.status === "success") {
        setResults(result.recommendations);
        setRecipeEligibility({
          totalRecipeCount: result.totalRecipeCount,
          eligibleRecipeCount: result.eligibleRecipeCount,
        });
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <ContentCard className="gap-3">
      <h2 className={CONTENT_CARD_TITLE_CLASS}>Recommendations</h2>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox
            checked={includeExperimental}
            onCheckedChange={(v) => setIncludeExperimental(v === true)}
          />
          Include Experimental
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={includeIdea}
            onCheckedChange={(v) => setIncludeIdea(v === true)}
          />
          Include Ideas
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={favoritesOnly}
            onCheckedChange={(v) => setFavoritesOnly(v === true)}
          />
          Favorites only
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={fetchRecommendations}
          disabled={isPending}
        >
          {isPending ? "Loading…" : "Get recommendations"}
        </Button>
      </div>
      {error && <p className="text-destructive-text text-sm">{error}</p>}
      {results &&
        (results.length === 0 ? (
          recipeEligibility?.totalRecipeCount === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                Recommendations are drawn from your saved Recipes — you
                don&apos;t have any yet.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/recipes/new">Create a Recipe</Link>
                </Button>
              </div>
            </div>
          ) : recipeEligibility?.eligibleRecipeCount === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-sm">
                None of your saved Recipes are currently eligible for
                recommendations — archived Recipes aren&apos;t included.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/recipes">View your Recipes</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No matches — try adjusting the filters above.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {results.slice(0, 10).map((r) => {
              const candidate = candidates.find((c) => c.dishId === r.dishId);
              return (
                <li
                  key={r.dishId}
                  className="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-lg border p-2"
                >
                  <div>
                    <p className="text-sm font-medium">{r.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {r.explanation}
                    </p>
                  </div>
                  {candidate && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAddDish(r.dishId)}
                    >
                      Add to plan
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
    </ContentCard>
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
                  {entry.title} ({formatDate(entry.cookDate)})
                </label>
              </li>
            ))}
          </ul>
          {error && <p className="text-destructive-text text-sm">{error}</p>}
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
