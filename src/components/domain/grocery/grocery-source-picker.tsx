"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldLabel } from "@/components/ui/field";
import { DatePickerField } from "@/components/ui/date-picker-field";
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
import { VersionPickerField } from "@/components/domain/dish/version-picker-field";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import {
  generateGroceryList,
  listGrocerySourceVersionOptions,
} from "@/lib/grocery/list-actions";
import { toIsoDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import type {
  GrocerySourceCandidate,
  DishVersionYieldOption,
} from "@/lib/grocery/queries";

export type PickerTab = "ALL" | "RECIPE" | "PART";

export const PICKER_TABS: { value: PickerTab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "RECIPE", label: "Recipes" },
  { value: "PART", label: "Parts" },
];

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

type OpenState = [boolean, React.Dispatch<React.SetStateAction<boolean>>];

const GrocerySourcePickerContext = React.createContext<OpenState | null>(null);

/**
 * Shares open/closed state between `GrocerySourcePickerTrigger` (rendered in
 * the page header, top-right) and `GrocerySourcePickerPanel` (rendered
 * below, in the page body) so the two can live in different parts of the
 * page layout.
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

/**
 * Source-selection modal (Build Plan Slice 12) — pick one or more owned
 * Recipes/Parts and set each one's desired amount (§60.1/§60.2), reusing the
 * same natural target-output `ScaleControl` Cooking Setup already
 * established (`cooking/scale-control.tsx`). Per-ingredient optional-
 * removal/substitute-selection is handled after generation, in the
 * generated-list view — this screen only selects whole Recipes/Parts,
 * matching Build Plan's own component description.
 */
export function GrocerySourcePickerPanel({
  candidates,
}: {
  candidates: GrocerySourceCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useGrocerySourcePickerState();
  const [title, setTitle] = React.useState("Grocery list");
  const [plannedDate, setPlannedDate] = React.useState(() =>
    toIsoDateOnly(new Date()),
  );
  const [selectedDishIds, setSelectedDishIds] = React.useState<string[]>([]);
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
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<PickerTab>("ALL");

  const candidatesById = React.useMemo(
    () => new Map(candidates.map((c) => [c.dishId, c])),
    [candidates],
  );

  // Each selected meal gets its own explicit Version choice — fetched on
  // demand (with its own authored yield, for `DishYieldScalingField`) the
  // first time it's selected, defaulting to the version this candidate is
  // currently showing.
  React.useEffect(() => {
    const toFetch = selectedDishIds.filter(
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDishIds, versionsByDishId, versionLoadErrors]);
  const tabCandidates = candidates.filter(
    (c) => tab === "ALL" || c.kind === tab,
  );
  const filteredCandidates = tabCandidates.filter((c) =>
    c.title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function toggle(dishId: string) {
    setSelectedDishIds((prev) =>
      prev.includes(dishId)
        ? prev.filter((id) => id !== dishId)
        : [...prev, dishId],
    );
  }

  function handleGenerate() {
    setError(null);
    if (selectedDishIds.length === 0) {
      setError("Select at least one Recipe or Part.");
      return;
    }
    startTransition(async () => {
      const result = await generateGroceryList({
        title,
        plannedDate: new Date(plannedDate),
        sources: selectedDishIds.map((dishId) => ({
          dishId,
          dishVersionId: selectedVersionByDishId[dishId],
          scaleFactor: scales[dishId] ?? 1,
        })),
      });
      if (result.status === "success") {
        setOpen(false);
        router.push(`/grocery-lists/${result.listId}`);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New grocery list</DialogTitle>
          <DialogDescription>
            Select one or more Recipes or Parts to generate a shopping list
            from.
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
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
            <FieldLabel htmlFor="grocery-list-planned-date">Date</FieldLabel>
            <DatePickerField
              id="grocery-list-planned-date"
              value={plannedDate}
              onChange={setPlannedDate}
              ariaLabel="Grocery list date"
            />
          </Field>

          <div className="flex min-h-0 flex-col gap-2">
            <Label>Recipes &amp; Parts</Label>
            <div className="bg-popover sticky top-0 z-10 flex flex-col gap-2 pb-2">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search"
                  className="pl-8"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div role="tablist" className="border-border flex gap-1 border-b">
                {PICKER_TABS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.value}
                    onClick={() => setTab(t.value)}
                    className={cn(
                      "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm font-medium outline-none",
                      tab === t.value
                        ? "border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCandidates.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                {candidates.length === 0
                  ? "You don't have any recipes or parts saved yet."
                  : "Nothing matches that search."}
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredCandidates.map((candidate) => (
                  <SelectableDishRow
                    key={candidate.dishId}
                    item={candidateToSelectionItem(candidate)}
                    selectionControl="checkbox"
                    selected={selectedDishIds.includes(candidate.dishId)}
                    onSelect={() => toggle(candidate.dishId)}
                  />
                ))}
              </div>
            )}
          </div>

          {selectedDishIds.length > 0 && (
            <div className="flex flex-col gap-3">
              <Label>Selected</Label>
              {selectedDishIds.map((dishId) => {
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
                      <VersionPickerField
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
                        selectedVersion?.yieldQuantity ?? candidate.yieldQuantity
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

          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isPending}>
            {isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
