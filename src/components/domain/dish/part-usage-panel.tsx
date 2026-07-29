"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { propagatePartUpdate } from "@/lib/dishes/actions";
import type {
  PropagationOutcome,
  PropagationSelection,
} from "@/lib/dishes/service";
import type { PartUsage } from "@/lib/dishes/queries";

type ContainerGroup = {
  containerDishId: string;
  containerKind: PartUsage["containerKind"];
  containerTitle: string;
  containerMajorVersion: number;
  containerMinorVersion: number;
  occurrences: PartUsage[];
};

function groupByContainer(usages: PartUsage[]): ContainerGroup[] {
  const map = new Map<string, ContainerGroup>();
  for (const usage of usages) {
    const existing = map.get(usage.containerDishId);
    if (existing) {
      existing.occurrences.push(usage);
    } else {
      map.set(usage.containerDishId, {
        containerDishId: usage.containerDishId,
        containerKind: usage.containerKind,
        containerTitle: usage.containerTitle,
        containerMajorVersion: usage.containerMajorVersion,
        containerMinorVersion: usage.containerMinorVersion,
        occurrences: [usage],
      });
    }
  }
  return [...map.values()];
}

function selectionsFromUsages(usages: PartUsage[]): PropagationSelection[] {
  const byContainer = new Map<string, string[]>();
  for (const usage of usages) {
    const lineageIds = byContainer.get(usage.containerDishId) ?? [];
    lineageIds.push(usage.lineageId);
    byContainer.set(usage.containerDishId, lineageIds);
  }
  return [...byContainer.entries()].map(([containerDishId, lineageIds]) => ({
    containerDishId,
    lineageIds,
  }));
}

function outcomeLabel(outcome: PropagationOutcome): string {
  if (outcome.status === "updated") return "Updated";
  return outcome.reason;
}

/**
 * PRODUCT_SPEC.md §71 "Recipes using this Part" — current usages only.
 * Slice 6 post-gate, §72.4/§72.5: also the "Update everywhere" / "Choose
 * Recipes and Parts to update" propagation entry points, each occurrence
 * targeted by its stable `lineageId` so the same Part appearing twice in one
 * item can be updated independently.
 */
export function PartUsagePanel({
  usages,
  currentVersionId,
  partDishId,
}: {
  usages: PartUsage[];
  currentVersionId: string | null;
  partDishId: string;
}) {
  const [isPending, startTransition] = React.useTransition();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [selectedLineageIds, setSelectedLineageIds] = React.useState<
    Set<string>
  >(new Set());
  const [outcomesByLineageId, setOutcomesByLineageId] = React.useState<
    Map<string, PropagationOutcome>
  >(new Map());
  const [error, setError] = React.useState<string | null>(null);

  const outOfDateUsages = currentVersionId
    ? usages.filter((usage) => usage.targetDishVersionId !== currentVersionId)
    : [];

  function runPropagation(selections: PropagationSelection[]) {
    if (!currentVersionId || selections.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await propagatePartUpdate({
        partDishId,
        newTargetVersionId: currentVersionId,
        selections,
      });
      if (result.status === "success") {
        setOutcomesByLineageId((prev) => {
          const next = new Map(prev);
          for (const outcome of result.outcomes) {
            const group = selections.find(
              (selection) =>
                selection.containerDishId === outcome.containerDishId,
            );
            for (const lineageId of group?.lineageIds ?? []) {
              next.set(lineageId, outcome);
            }
          }
          return next;
        });
        setPickerOpen(false);
        setSelectedLineageIds(new Set());
      } else {
        setError(result.message);
      }
    });
  }

  function toggleSelection(lineageId: string) {
    setSelectedLineageIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineageId)) next.delete(lineageId);
      else next.add(lineageId);
      return next;
    });
  }

  if (usages.length === 0) {
    return (
      <div className="border-border bg-card flex flex-col gap-2 rounded-xl border p-4">
        <h2 className="text-foreground text-sm font-semibold">
          Recipes using this Part
        </h2>
        <p className="text-muted-foreground text-sm">Nothing here yet.</p>
      </div>
    );
  }

  const groups = groupByContainer(usages);

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-foreground text-sm font-semibold">
          Recipes using this Part
        </h2>
        {outOfDateUsages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() =>
                runPropagation(selectionsFromUsages(outOfDateUsages))
              }
            >
              <RefreshCw /> {isPending ? "Updating…" : "Update everywhere"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setSelectedLineageIds(
                  new Set(outOfDateUsages.map((usage) => usage.lineageId)),
                );
                setPickerOpen(true);
              }}
            >
              Choose Recipes and Parts to update
            </Button>
          </div>
        )}
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <ul className="flex flex-col gap-2">
        {groups.map((group) => (
          <li
            key={group.containerDishId}
            className="border-border rounded-lg border px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <Link
                href={`${dishBasePath(group.containerKind)}/${group.containerDishId}`}
                className="text-primary truncate font-medium hover:underline"
              >
                {group.containerTitle}
              </Link>
              <p className="text-muted-foreground text-xs">
                V{group.containerMajorVersion}.{group.containerMinorVersion}
              </p>
            </div>
            <ul className="mt-1 flex flex-col gap-1">
              {group.occurrences.map((usage) => {
                const outOfDate =
                  !!currentVersionId &&
                  usage.targetDishVersionId !== currentVersionId;
                const outcome = outcomesByLineageId.get(usage.lineageId);
                return (
                  <li
                    key={usage.id}
                    className="text-muted-foreground flex items-center justify-between gap-2 text-xs"
                  >
                    <span>
                      {usage.sectionName
                        ? `In ${usage.sectionName}`
                        : "Top-level"}
                    </span>
                    {outcome ? (
                      <span
                        className={
                          outcome.status === "failed"
                            ? "text-destructive"
                            : "text-foreground"
                        }
                      >
                        {outcomeLabel(outcome)}
                      </span>
                    ) : (
                      outOfDate && (
                        <span
                          className="flex shrink-0 items-center gap-1"
                          title="This usage references an earlier Version of this Part than the current one."
                        >
                          <AlertCircle
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          Newer Version available
                        </span>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>

      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          setPickerOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose Recipes and Parts to update</DialogTitle>
            <DialogDescription>
              Only the checked usages will be updated to this Part&apos;s
              current Version.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.containerDishId} className="flex flex-col gap-1">
                <p className="text-sm font-medium">{group.containerTitle}</p>
                {group.occurrences.map((usage) => {
                  const outOfDate =
                    !!currentVersionId &&
                    usage.targetDishVersionId !== currentVersionId;
                  return (
                    <label
                      key={usage.id}
                      className="flex items-center gap-2 pl-2 text-sm"
                    >
                      <Checkbox
                        checked={selectedLineageIds.has(usage.lineageId)}
                        disabled={!outOfDate}
                        onCheckedChange={() => toggleSelection(usage.lineageId)}
                      />
                      <span className="text-muted-foreground">
                        {usage.sectionName
                          ? `In ${usage.sectionName}`
                          : "Top-level"}
                        {!outOfDate ? " (already current)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                runPropagation(
                  selectionsFromUsages(
                    usages.filter((usage) =>
                      selectedLineageIds.has(usage.lineageId),
                    ),
                  ),
                )
              }
              disabled={isPending || selectedLineageIds.size === 0}
            >
              {isPending ? "Updating…" : "Update selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
