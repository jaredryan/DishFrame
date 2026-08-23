"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScaleControl } from "@/components/domain/cooking/scale-control";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { generateGroceryList } from "@/lib/grocery/list-actions";
import { toIsoDateOnly } from "@/lib/date";
import type { GrocerySourceCandidate } from "@/lib/grocery/queries";

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
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const recipes = candidates.filter((c) => c.kind === "RECIPE");
  const parts = candidates.filter((c) => c.kind === "PART");

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
      <DialogContent className="flex max-h-[85vh] flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New grocery list</DialogTitle>
          <DialogDescription>
            Select one or more Recipes or Parts to generate a shopping list
            from.
          </DialogDescription>
        </DialogHeader>

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

        <SourceGroup
          label="Recipes"
          candidates={recipes}
          selectedDishIds={selectedDishIds}
          onToggle={toggle}
          onScaleChange={(dishId, value) =>
            setScales((prev) => ({ ...prev, [dishId]: value }))
          }
        />
        <SourceGroup
          label="Parts"
          candidates={parts}
          selectedDishIds={selectedDishIds}
          onToggle={toggle}
          onScaleChange={(dishId, value) =>
            setScales((prev) => ({ ...prev, [dishId]: value }))
          }
        />

        {error && (
          <p role="alert" className="text-destructive-text text-sm">
            {error}
          </p>
        )}

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

function SourceGroup({
  label,
  candidates,
  selectedDishIds,
  onToggle,
  onScaleChange,
}: {
  label: string;
  candidates: GrocerySourceCandidate[];
  selectedDishIds: string[];
  onToggle: (dishId: string) => void;
  onScaleChange: (dishId: string, value: number | null) => void;
}) {
  if (candidates.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </h3>
      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => {
          const checked = selectedDishIds.includes(candidate.dishId);
          return (
            <li
              key={candidate.dishId}
              className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3"
            >
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(candidate.dishId)}
                />
                <span className="text-sm">{candidate.title}</span>
              </label>
              {checked && (
                <SourceScalingField
                  candidate={candidate}
                  onScaleChange={(value) =>
                    onScaleChange(candidate.dishId, value)
                  }
                  className="pl-6"
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function parseServings(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatFactor(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A Recipe/Part with an authored yield gets a compact servings input (same
 * width as the Recipe editor's prep/cook-time fields) instead of the generic
 * `ScaleControl` — prefilled with the default yield, with the resulting
 * scale factor computed and shown live. Candidates with no authored yield
 * fall back to `ScaleControl`'s plain-multiplier mode.
 */
function SourceScalingField({
  candidate,
  onScaleChange,
  className,
}: {
  candidate: GrocerySourceCandidate;
  onScaleChange: (value: number | null) => void;
  className?: string;
}) {
  const hasYield =
    candidate.yieldQuantity != null && candidate.yieldQuantity > 0;

  if (!hasYield) {
    return (
      <ScaleControl
        outputQuantity={candidate.yieldQuantity}
        outputUnit={candidate.yieldUnit}
        targetLabel="Make"
        multiplierLabel="Scale"
        onMultiplierChange={onScaleChange}
        className={className}
      />
    );
  }

  return (
    <ServingsScalingField
      candidate={candidate}
      defaultYield={candidate.yieldQuantity!}
      onScaleChange={onScaleChange}
      className={className}
    />
  );
}

function ServingsScalingField({
  candidate,
  defaultYield,
  onScaleChange,
  className,
}: {
  candidate: GrocerySourceCandidate;
  defaultYield: number;
  onScaleChange: (value: number | null) => void;
  className?: string;
}) {
  const [text, setText] = React.useState(() => String(defaultYield));
  const parsed = parseServings(text);
  const factor = parsed != null ? parsed / defaultYield : null;
  const kindLabel = candidate.kind === "PART" ? "Part" : "Recipe";

  React.useEffect(() => {
    onScaleChange(factor);
    // Only re-run when the computed factor actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [factor]);

  return (
    <Field className={className}>
      <FieldLabel htmlFor={`servings-${candidate.dishId}`}>Servings</FieldLabel>
      <Input
        id={`servings-${candidate.dishId}`}
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-13"
      />
      <p className="text-muted-foreground text-sm">
        Makes {parsed ?? defaultYield} servings. {kindLabel} will be scaled by{" "}
        {formatFactor(factor ?? 1)}×.
      </p>
    </Field>
  );
}
