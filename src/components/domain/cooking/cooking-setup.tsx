"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChefHat, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContentCard,
  CONTENT_CARD_TITLE_CLASS,
} from "@/components/domain/dish/content-card";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { startCookingSession, endCookingSession } from "@/lib/cooking/actions";
import {
  ScaleControl,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";

export type SetupUnit = {
  unitKey: string;
  kind: "SECTION" | "PART";
  label: string;
  estimatedDurationMinutes: number | null;
  ingredientCount: number;
  instructionCount: number;
  outputQuantity: number | null;
  outputUnit: string | null;
  // SLICE_9.md refinement pass — set only for a Part reached by linking
  // through another Part (never a top-level or Section-nested Part), so the
  // list can show it's a nested, independently selectable unit rather than a
  // sibling of the thing that links to it (PRODUCT_SPEC.md §23.4).
  parentPartLabel: string | null;
};

function countsLabel(unit: SetupUnit): string {
  const parts: string[] = [];
  if (unit.ingredientCount > 0) {
    parts.push(
      `${unit.ingredientCount} ingredient${unit.ingredientCount === 1 ? "" : "s"}`,
    );
  }
  if (unit.instructionCount > 0) {
    parts.push(
      `${unit.instructionCount} step${unit.instructionCount === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" · ");
}

/**
 * Cooking Setup (PRODUCT_SPEC.md §21.2): a mandatory, transient planning
 * step. No Cooking Session exists until "Start cooking" is pressed — every
 * control here is local React state; canceling or navigating away leaves
 * no residue by construction (Gate 4), never an explicit cleanup call.
 */
export function CookingSetup({
  dishId,
  dishVersionId,
  dishTitle,
  versionLabel,
  isCurrent,
  units,
  sourceOutputQuantity,
  sourceOutputUnit,
  cancelHref,
}: {
  dishId: string;
  dishVersionId: string;
  dishTitle: string;
  versionLabel: string;
  isCurrent: boolean;
  units: SetupUnit[];
  sourceOutputQuantity: number | null;
  sourceOutputUnit: string | null;
  // Where Cancel returns to: the page this setup was opened from (Home, the
  // Cook sessions list, or — the default — the item's own detail page).
  cancelHref: string;
}) {
  const router = useRouter();

  // §23.3: every eligible unit begins included, in the server-suggested
  // order (§23.5). `includedKeys` is the ordered active plan; anything not
  // in it is available to add back.
  const [includedKeys, setIncludedKeys] = React.useState<string[]>(
    units.map((u) => u.unitKey),
  );
  const [sessionMultiplier, setSessionMultiplier] = React.useState<
    number | null
  >(null);
  const [unitMultipliers, setUnitMultipliers] = React.useState<
    Record<string, number | null>
  >({});
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<{
    existingSessionId: string | null;
  } | null>(null);
  const [resolvingConflict, setResolvingConflict] = React.useState(false);

  const unitByKey = React.useMemo(
    () => new Map(units.map((u) => [u.unitKey, u])),
    [units],
  );
  const excludedKeys = units
    .map((u) => u.unitKey)
    .filter((key) => !includedKeys.includes(key));

  function moveUnit(index: number, direction: -1 | 1) {
    setIncludedKeys((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeUnit(unitKey: string) {
    setIncludedKeys((prev) => prev.filter((key) => key !== unitKey));
  }

  function addUnit(unitKey: string) {
    setIncludedKeys((prev) => [...prev, unitKey]);
  }

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const result = await startCookingSession({
        dishId,
        dishVersionId,
        scaleFactor: sessionMultiplier,
        units: includedKeys.map((unitKey) => ({
          unitKey,
          scaleFactor: unitMultipliers[unitKey] ?? null,
        })),
      });

      if (result.status === "success") {
        router.push(`/cook/${result.sessionId}`);
      } else if (result.status === "conflict") {
        setConflict({ existingSessionId: result.existingSessionId });
      } else {
        setError(result.message);
      }
    });
  }

  function handleEndExisting() {
    if (!conflict?.existingSessionId) return;
    setResolvingConflict(true);
    startTransition(async () => {
      await endCookingSession({
        sessionId: conflict.existingSessionId!,
        outcome: "ENDED_EARLY",
      });
      setResolvingConflict(false);
      setConflict(null);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-foreground text-2xl font-semibold">
          Cooking setup
        </h1>
        <p className="text-muted-foreground text-sm">
          {dishTitle} — {versionLabel}
          {!isCurrent && " (historical version)"}
        </p>
      </div>

      <ContentCard>
        <h2 className={CONTENT_CARD_TITLE_CLASS}>Included, in order</h2>
        {includedKeys.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nothing selected yet — add a Section or Part below.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {includedKeys.map((unitKey, index) => {
            const unit = unitByKey.get(unitKey);
            if (!unit) return null;
            return (
              <li
                key={unitKey}
                className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-foreground text-sm font-medium">
                      {unit.label}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        unit.parentPartLabel
                          ? `Part · nested in ${unit.parentPartLabel}`
                          : unit.kind === "PART"
                            ? "Part"
                            : "Section",
                        unit.estimatedDurationMinutes != null
                          ? `~${unit.estimatedDurationMinutes} min`
                          : null,
                        countsLabel(unit) || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <TooltipIconButton
                      label={`Move ${unit.label} up`}
                      icon={ChevronUp}
                      onClick={() => moveUnit(index, -1)}
                      disabled={index === 0}
                    />
                    <TooltipIconButton
                      label={`Move ${unit.label} down`}
                      icon={ChevronDown}
                      onClick={() => moveUnit(index, 1)}
                      disabled={index === includedKeys.length - 1}
                    />
                    <TooltipIconButton
                      label={`Remove ${unit.label}`}
                      icon={Trash2}
                      onClick={() => removeUnit(unitKey)}
                      className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                    />
                  </div>
                </div>
                <ScaleControl
                  outputQuantity={computeOutputBasis(
                    unit.outputQuantity,
                    sessionMultiplier ?? 1,
                  )}
                  outputUnit={unit.outputUnit}
                  targetLabel={`Make`}
                  multiplierLabel="Scale this unit"
                  onMultiplierChange={(multiplier) =>
                    setUnitMultipliers((prev) => ({
                      ...prev,
                      [unitKey]: multiplier,
                    }))
                  }
                />
              </li>
            );
          })}
        </ul>

        {excludedKeys.length > 0 && (
          <div className="flex flex-col gap-2 pt-2">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Not included
            </h3>
            <ul className="flex flex-col gap-2">
              {excludedKeys.map((unitKey) => {
                const unit = unitByKey.get(unitKey);
                if (!unit) return null;
                return (
                  <li
                    key={unitKey}
                    className="border-border flex items-center justify-between gap-2 rounded-lg border border-dashed p-3"
                  >
                    <p className="text-muted-foreground text-sm">
                      {unit.label}
                    </p>
                    <TooltipIconButton
                      label={`Add ${unit.label} back`}
                      icon={Plus}
                      onClick={() => addUnit(unitKey)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </ContentCard>

      <ContentCard>
        <h2 className={CONTENT_CARD_TITLE_CLASS}>Whole-session scale</h2>
        <ScaleControl
          outputQuantity={sourceOutputQuantity}
          outputUnit={sourceOutputUnit}
          targetLabel="Cook for"
          multiplierLabel="Scale the whole session"
          onMultiplierChange={setSessionMultiplier}
        />
      </ContentCard>

      {error && (
        <p role="alert" className="text-destructive-text text-sm">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleStart}
          disabled={isPending || includedKeys.length === 0}
        >
          <ChefHat className="size-4" aria-hidden="true" />
          {isPending ? "Starting…" : "Start cooking"}
        </Button>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>

      <Dialog
        open={conflict != null}
        onOpenChange={(open) => !open && setConflict(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A session is already in progress</DialogTitle>
            <DialogDescription>
              Only one Cooking Session can be in progress for this item at a
              time. Resume it, end it, or cancel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflict(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndExisting}
              disabled={resolvingConflict || !conflict?.existingSessionId}
            >
              {resolvingConflict ? "Ending…" : "End current session"}
            </Button>
            <Button
              disabled={!conflict?.existingSessionId}
              onClick={() =>
                conflict?.existingSessionId &&
                router.push(`/cook/${conflict.existingSessionId}`)
              }
            >
              Resume current session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
