"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { ScaleControl } from "@/components/domain/cooking/scale-control";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { generateGroceryList } from "@/lib/grocery/list-actions";
import type { GrocerySourceCandidate } from "@/lib/grocery/queries";

/**
 * Source-selection screen (Build Plan Slice 12) — pick one or more owned
 * Recipes/Parts and set each one's desired amount (§60.1/§60.2), reusing the
 * same natural target-output `ScaleControl` Cooking Setup already
 * established (`cooking/scale-control.tsx`). Per-ingredient optional-
 * removal/substitute-selection is handled after generation, in the
 * generated-list view — this screen only selects whole Recipes/Parts,
 * matching Build Plan's own component description.
 */
export function GrocerySourcePicker({
  candidates,
}: {
  candidates: GrocerySourceCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("Grocery list");
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
        sources: selectedDishIds.map((dishId) => ({
          dishId,
          scaleFactor: scales[dishId] ?? 1,
        })),
      });
      if (result.status === "success") {
        router.push(`/grocery-lists/${result.listId}`);
      } else {
        setError(result.message);
      }
    });
  }

  if (!open) {
    if (candidates.length === 0) {
      return (
        <DisabledActionHint explanation="Create a Recipe or Part first — a grocery list is generated from what you've saved.">
          <Button disabled>New grocery list</Button>
        </DisabledActionHint>
      );
    }
    return <Button onClick={() => setOpen(true)}>New grocery list</Button>;
  }

  return (
    <ContentCard className="gap-4">
      <div className="flex items-center justify-between">
        <h2 className={CONTENT_CARD_TITLE_CLASS}>New grocery list</h2>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="grocery-list-title">Title</Label>
        <Input
          id="grocery-list-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

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

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={handleGenerate} disabled={isPending}>
          {isPending ? "Generating…" : "Generate list"}
        </Button>
      </div>
    </ContentCard>
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
                <ScaleControl
                  outputQuantity={candidate.yieldQuantity}
                  outputUnit={candidate.yieldUnit}
                  targetLabel="Make"
                  multiplierLabel="Scale"
                  onMultiplierChange={(value) =>
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
