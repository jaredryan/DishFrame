"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SearchInput } from "@/components/ui/search-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DishYieldScalingField } from "@/components/domain/grocery/dish-yield-scaling-field";
import {
  SelectableDishRow,
  type DishSelectionItem,
} from "@/components/domain/dish/selectable-dish-row";
import { RecipePartPicker } from "@/components/domain/dish/recipe-part-picker";
import { RichVersionPickerField } from "@/components/domain/dish/version-picker-field";
import { useStepScrollReset } from "@/components/ui/use-step-scroll-reset";
import { useToast } from "@/components/ui/toast";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { cn } from "@/lib/utils";
import {
  generateGroceryList,
  listGrocerySourceVersionOptions,
} from "@/lib/grocery/list-actions";
import {
  generateGroceryListFromMealPlan,
  listMealPlanEntriesForGrocerySelection,
  type MealPlanEntryForGrocerySelectionDto,
} from "@/lib/mealplans/actions";
import { toIsoDateOnly, formatDateOnly } from "@/lib/date";
import type {
  GrocerySourceCandidate,
  DishVersionYieldOption,
} from "@/lib/grocery/queries";

export function candidateToSelectionItem(
  candidate: GrocerySourceCandidate,
): DishSelectionItem {
  return {
    id: candidate.dishId,
    kind: candidate.kind,
    title: candidate.title,
    versionLabel: candidate.versionLabel,
    stage: candidate.stage,
    cuisine: candidate.cuisine,
    imageAssetId: candidate.imageAssetId,
    tagNames: candidate.tagNames,
    rating: candidate.rating,
  };
}

export type MealPlanGroceryCandidate = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  _count: { entries: number };
};

type OpenState = [boolean, React.Dispatch<React.SetStateAction<boolean>>];

const GrocerySourcePickerContext = React.createContext<OpenState | null>(null);

/**
 * Shares open/closed state between `GrocerySourcePickerTrigger` (rendered in
 * the page header, top-right) and `GrocerySourcePickerPanel` (rendered
 * below, in the page body) so the two can live in different parts of the
 * page layout. Also shared by the Home dashboard (§8) — the same provider/
 * trigger/panel trio, so Home and `/grocery-lists` never diverge.
 */
export function GrocerySourcePickerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const state = React.useState(false);
  return (
    <GrocerySourcePickerContext.Provider value={state}>
      {children}
    </GrocerySourcePickerContext.Provider>
  );
}

function useGrocerySourcePickerState(): OpenState {
  const context = React.useContext(GrocerySourcePickerContext);
  if (!context) {
    throw new Error(
      "GrocerySourcePickerTrigger/Panel must be used within a GrocerySourcePickerProvider",
    );
  }
  return context;
}

export function GrocerySourcePickerTrigger({
  hasCandidates,
}: {
  hasCandidates: boolean;
}) {
  const [, setOpen] = useGrocerySourcePickerState();

  if (!hasCandidates) {
    return (
      <DisabledActionHint explanation="Create a Recipe or Part first — a grocery list is generated from what you've saved.">
        <Button disabled>
          <ListChecks />
          Make grocery list
        </Button>
      </DisabledActionHint>
    );
  }

  return (
    <Button onClick={() => setOpen(true)}>
      <ListChecks />
      Make grocery list
    </Button>
  );
}

type Basis = "MEAL_PLAN" | "RECIPES_PARTS";

const BASIS_OPTIONS: { value: Basis; label: string }[] = [
  { value: "MEAL_PLAN", label: "Meal plan" },
  { value: "RECIPES_PARTS", label: "Recipes & parts" },
];

/** Compact segmented control (§8's "Basis of list") — a plain two-button
 * group is enough here (no existing shared segmented-control primitive to
 * reuse elsewhere in DishFrame), styled to match `Button`'s own tokens. */
function BasisToggle({
  value,
  onChange,
}: {
  value: Basis;
  onChange: (value: Basis) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Basis of list"
      className="border-border inline-flex rounded-lg border p-0.5"
    >
      {BASIS_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[calc(var(--radius-lg)-2px)] px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function formatMealPlanRange(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  return `${formatDateOnly(start, options)} – ${formatDateOnly(end, options)}`;
}

/**
 * Meal Plan search/select (§8's `Meal plan` basis) — single-choice, same
 * pattern DishFrame uses elsewhere for a single-select searchable entity:
 * search results collapse into the selected plan once chosen, with a way
 * to change the selection.
 */
function MealPlanBasisFields({
  candidates,
  search,
  onSearchChange,
  selectedId,
  onSelect,
  entries,
  entriesError,
  selectedEntryIds,
  onToggleEntry,
}: {
  candidates: MealPlanGroceryCandidate[];
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  entries: MealPlanEntryForGrocerySelectionDto[] | null;
  entriesError: string | null;
  selectedEntryIds: Set<string>;
  onToggleEntry: (id: string) => void;
}) {
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.title.toLowerCase().includes(q));
  }, [candidates, search]);

  if (selected) {
    return (
      <div className="flex flex-col gap-3">
        <div className="border-border bg-card flex items-center justify-between gap-2 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.title}</p>
            <p className="text-muted-foreground text-xs">
              {formatMealPlanRange(selected.startDate, selected.endDate)} ·{" "}
              {selected._count.entries} entr
              {selected._count.entries === 1 ? "y" : "ies"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Change Meal Plan"
            onClick={() => onSelect(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Meals to include</span>
          {entriesError ? (
            <p className="text-destructive-text text-sm">{entriesError}</p>
          ) : entries ? (
            entries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                This Meal Plan has no entries yet.
              </p>
            ) : (
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <label className="flex items-center gap-2 py-1 text-sm pointer-coarse:min-h-11">
                      <Checkbox
                        checked={selectedEntryIds.has(entry.id)}
                        onCheckedChange={() => onToggleEntry(entry.id)}
                        aria-label={entry.title}
                      />
                      <span>{entry.title}</span>
                      <span className="text-muted-foreground">
                        ({formatDateOnly(entry.cookDate)})
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-muted-foreground text-sm">Loading meals…</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SearchInput
        placeholder="Search Meal Plans"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {candidates.length === 0
            ? "No Meal Plans yet — create one first."
            : "No Meal Plans match that search."}
        </p>
      ) : (
        <ul className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
          {filtered.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                onClick={() => onSelect(plan.id)}
                className="border-border hover:bg-muted/50 flex w-full items-center gap-3 rounded-lg border p-3 text-left pointer-coarse:min-h-11"
              >
                <CalendarRange
                  className="text-muted-foreground shrink-0"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{plan.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatMealPlanRange(plan.startDate, plan.endDate)} ·{" "}
                    {plan._count.entries} entr
                    {plan._count.entries === 1 ? "y" : "ies"}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Source-selection modal (Build Plan Slice 12, widened + `Meal plan` basis
 * added per §7/§8 grocery combine/polish QA pass) — pick a Meal Plan (the
 * default, structured source for a planned shopping trip) or one/many
 * Recipes/Parts, and generate a Grocery List. Per-ingredient optional-
 * removal/substitute-selection is handled after generation, in the
 * generated-list view.
 */
type Step = "select" | "configure";

export function GrocerySourcePickerPanel({
  candidates,
  mealPlanCandidates,
}: {
  candidates: GrocerySourceCandidate[];
  mealPlanCandidates: MealPlanGroceryCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useGrocerySourcePickerState();
  const [basis, setBasis] = React.useState<Basis>("MEAL_PLAN");
  const [step, setStep] = React.useState<Step>("select");
  const [title, setTitle] = React.useState("Grocery list");
  const [plannedDate, setPlannedDate] = React.useState(() =>
    toIsoDateOnly(new Date()),
  );

  // Recipes & parts basis state
  const [selectedDishIds, setSelectedDishIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [scales, setScales] = React.useState<Record<string, number | null>>({});
  const [versionsByDishId, setVersionsByDishId] = React.useState<
    Record<string, DishVersionYieldOption[]>
  >({});
  const [versionLoadErrors, setVersionLoadErrors] = React.useState<
    Record<string, string>
  >({});
  const [selectedVersionByDishId, setSelectedVersionByDishId] = React.useState<
    Record<string, string>
  >({});
  const [search, setSearch] = React.useState("");

  // Meal plan basis state
  const [mealPlanSearch, setMealPlanSearch] = React.useState("");
  const [selectedMealPlanId, setSelectedMealPlanId] = React.useState<
    string | null
  >(null);
  const [mealPlanEntries, setMealPlanEntries] = React.useState<
    MealPlanEntryForGrocerySelectionDto[] | null
  >(null);
  const [mealPlanEntriesError, setMealPlanEntriesError] = React.useState<
    string | null
  >(null);
  const [selectedEntryIds, setSelectedEntryIds] = React.useState<Set<string>>(
    new Set(),
  );

  const [isPending, startTransition] = React.useTransition();
  const scrollRef = useStepScrollReset(
    basis === "RECIPES_PARTS" ? step : basis,
  );
  const { showToast } = useToast();

  const candidatesById = React.useMemo(
    () => new Map(candidates.map((c) => [c.dishId, c])),
    [candidates],
  );
  const pickerItems = React.useMemo(
    () => candidates.map(candidateToSelectionItem),
    [candidates],
  );

  // Each selected meal gets its own explicit Version choice — fetched on
  // demand (with its own authored yield, for `DishYieldScalingField`) the
  // first time it's selected, defaulting to the version this candidate is
  // currently showing.
  React.useEffect(() => {
    const toFetch = [...selectedDishIds].filter(
      (dishId) => !versionsByDishId[dishId] && !versionLoadErrors[dishId],
    );
    for (const dishId of toFetch) {
      listGrocerySourceVersionOptions({ dishId }).then((result) => {
        if (result.status !== "success") {
          setVersionLoadErrors((prev) => ({
            ...prev,
            [dishId]: result.message,
          }));
          return;
        }
        setVersionsByDishId((prev) => ({ ...prev, [dishId]: result.versions }));
        setSelectedVersionByDishId((prev) => {
          if (prev[dishId]) return prev;
          const candidate = candidatesById.get(dishId);
          const current = result.versions.find(
            (v) =>
              `V${v.majorVersion}.${v.minorVersion}` ===
              candidate?.versionLabel,
          );
          const chosen = current ?? result.versions[result.versions.length - 1];
          return chosen ? { ...prev, [dishId]: chosen.id } : prev;
        });
      });
    }
  }, [selectedDishIds, versionsByDishId, versionLoadErrors, candidatesById]);

  // Fetches the selected Meal Plan's entries the moment it's chosen,
  // defaulting every entry to included (matching "Generate grocery list"
  // from Meal Plan Details' own default).
  React.useEffect(() => {
    if (!selectedMealPlanId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets to loading when selectedMealPlanId changes, before the async fetch resolves
    setMealPlanEntries(null);

    setMealPlanEntriesError(null);
    listMealPlanEntriesForGrocerySelection({
      mealPlanId: selectedMealPlanId,
    }).then((result) => {
      if (cancelled) return;
      if (result.status !== "success") {
        setMealPlanEntriesError(result.message);
        return;
      }
      setMealPlanEntries(result.entries);
      setSelectedEntryIds(new Set(result.entries.map((e) => e.id)));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMealPlanId]);

  function toggle(dishId: string) {
    setSelectedDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  }

  function toggleEntry(entryId: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function close() {
    setOpen(false);
    setBasis("MEAL_PLAN");
    setStep("select");
    setTitle("Grocery list");
    setPlannedDate(toIsoDateOnly(new Date()));
    setSelectedDishIds(new Set());
    setScales({});
    setVersionsByDishId({});
    setVersionLoadErrors({});
    setSelectedVersionByDishId({});
    setSearch("");
    setMealPlanSearch("");
    setSelectedMealPlanId(null);
    setMealPlanEntries(null);
    setMealPlanEntriesError(null);
    setSelectedEntryIds(new Set());
  }

  function handleGenerate() {
    startTransition(async () => {
      if (basis === "MEAL_PLAN") {
        if (!selectedMealPlanId) return;
        const result = await generateGroceryListFromMealPlan({
          mealPlanId: selectedMealPlanId,
          title,
          plannedDate,
          entryIds: [...selectedEntryIds],
        });
        if (result.status === "success") {
          close();
          router.push(`/grocery-lists/${result.listId}`);
        } else {
          showToast({ variant: "error", title: result.message });
        }
        return;
      }
      const result = await generateGroceryList({
        title,
        plannedDate: new Date(plannedDate),
        sources: [...selectedDishIds].map((dishId) => ({
          dishId,
          dishVersionId: selectedVersionByDishId[dishId],
          scaleFactor: scales[dishId] ?? 1,
        })),
      });
      if (result.status === "success") {
        close();
        router.push(`/grocery-lists/${result.listId}`);
      } else {
        showToast({ variant: "error", title: result.message });
      }
    });
  }

  const canConfigure = selectedDishIds.size > 0;
  const canGenerateFromRecipes =
    selectedDishIds.size > 0 &&
    [...selectedDishIds].every((id) => selectedVersionByDishId[id]);
  const canGenerateFromMealPlan =
    selectedMealPlanId != null && selectedEntryIds.size > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New grocery list</DialogTitle>
          <DialogDescription>
            {basis === "RECIPES_PARTS" && step === "configure"
              ? "Choose a Version and amount for each selected item."
              : "Generate a shopping list from a Meal Plan, or from one or more Recipes/Parts."}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="-mx-1 -mb-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1"
        >
          {!(basis === "RECIPES_PARTS" && step === "configure") && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="grocery-list-title">Title</Label>
                <Input
                  id="grocery-list-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>

              <Field>
                <FieldLabel htmlFor="grocery-list-planned-date">
                  Date
                </FieldLabel>
                <DatePickerField
                  id="grocery-list-planned-date"
                  value={plannedDate}
                  onChange={setPlannedDate}
                  ariaLabel="Grocery list date"
                />
              </Field>

              <Field>
                <FieldLabel>Basis of list</FieldLabel>
                <BasisToggle value={basis} onChange={setBasis} />
              </Field>
            </>
          )}

          {basis === "MEAL_PLAN" ? (
            <MealPlanBasisFields
              candidates={mealPlanCandidates}
              search={mealPlanSearch}
              onSearchChange={setMealPlanSearch}
              selectedId={selectedMealPlanId}
              onSelect={setSelectedMealPlanId}
              entries={mealPlanEntries}
              entriesError={mealPlanEntriesError}
              selectedEntryIds={selectedEntryIds}
              onToggleEntry={toggleEntry}
            />
          ) : step === "select" ? (
            <RecipePartPicker
              items={pickerItems}
              itemsError={null}
              search={search}
              onSearchChange={setSearch}
              showKindTabs
              selected={selectedDishIds}
              onToggle={toggle}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {[...selectedDishIds].map((dishId) => {
                const candidate = candidatesById.get(dishId);
                if (!candidate) return null;
                const versions = versionsByDishId[dishId];
                const selectedVersion = versions?.find(
                  (v) => v.id === selectedVersionByDishId[dishId],
                );
                return (
                  <div key={dishId} className="flex flex-col gap-2">
                    <SelectableDishRow
                      item={candidateToSelectionItem(candidate)}
                      selectionControl="remove"
                      onRemove={() => toggle(dishId)}
                    />
                    {versionLoadErrors[dishId] ? (
                      <p className="text-destructive-text pl-2 text-sm">
                        {versionLoadErrors[dishId]}
                      </p>
                    ) : versions ? (
                      <RichVersionPickerField
                        id={`grocery-source-version-${dishId}`}
                        versions={versions}
                        value={selectedVersionByDishId[dishId]}
                        onChangeAction={(versionId) =>
                          setSelectedVersionByDishId((prev) => ({
                            ...prev,
                            [dishId]: versionId,
                          }))
                        }
                        className="pl-2"
                      />
                    ) : (
                      <p className="text-muted-foreground pl-2 text-sm">
                        Loading versions…
                      </p>
                    )}
                    <DishYieldScalingField
                      id={candidate.dishId}
                      kindLabel={candidate.kind === "PART" ? "Part" : "Recipe"}
                      yieldQuantity={
                        selectedVersion?.yieldQuantity ??
                        candidate.yieldQuantity
                      }
                      yieldUnit={
                        selectedVersion?.yieldUnit ?? candidate.yieldUnit
                      }
                      onScaleChange={(value) =>
                        setScales((prev) => ({ ...prev, [dishId]: value }))
                      }
                      className="pl-2"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          {basis === "MEAL_PLAN" ? (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerateFromMealPlan}
                loading={isPending}
              >
                Generate
              </Button>
            </>
          ) : step === "select" ? (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep("configure")}
                disabled={!canConfigure}
              >
                Next
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("select")}
                disabled={isPending}
              >
                Back
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerateFromRecipes}
                loading={isPending}
              >
                Generate
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
