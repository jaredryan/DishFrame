"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
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
import { RecipePartPicker } from "@/components/domain/dish/recipe-part-picker";
import { RichVersionPickerField } from "@/components/domain/dish/version-picker-field";
import { useStepScrollReset } from "@/components/ui/use-step-scroll-reset";
import { useToast } from "@/components/ui/toast";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import {
  generateGroceryList,
  listGrocerySourceVersionOptions,
} from "@/lib/grocery/list-actions";
import { toIsoDateOnly } from "@/lib/date";
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
type Step = "select" | "configure";

export function GrocerySourcePickerPanel({
  candidates,
}: {
  candidates: GrocerySourceCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useGrocerySourcePickerState();
  const [step, setStep] = React.useState<Step>("select");
  const [title, setTitle] = React.useState("Grocery list");
  const [plannedDate, setPlannedDate] = React.useState(() =>
    toIsoDateOnly(new Date()),
  );
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
  const [isPending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState("");
  const scrollRef = useStepScrollReset(step);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDishIds, versionsByDishId, versionLoadErrors]);

  function toggle(dishId: string) {
    setSelectedDishIds((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  }

  function close() {
    setOpen(false);
    setStep("select");
    setTitle("Grocery list");
    setPlannedDate(toIsoDateOnly(new Date()));
    setSelectedDishIds(new Set());
    setScales({});
    setVersionsByDishId({});
    setVersionLoadErrors({});
    setSelectedVersionByDishId({});
    setSearch("");
  }

  function handleGenerate() {
    startTransition(async () => {
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
  const canGenerate =
    selectedDishIds.size > 0 &&
    [...selectedDishIds].every((id) => selectedVersionByDishId[id]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New grocery list</DialogTitle>
          <DialogDescription>
            {step === "configure"
              ? "Choose a Version and amount for each selected item."
              : "Select one or more Recipes or Parts to generate a shopping list from."}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1"
        >
          {step === "select" ? (
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

              <RecipePartPicker
                items={pickerItems}
                itemsError={null}
                search={search}
                onSearchChange={setSearch}
                showKindTabs
                selected={selectedDishIds}
                onToggle={toggle}
              />
            </>
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
          {step === "select" ? (
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
                disabled={!canGenerate}
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
