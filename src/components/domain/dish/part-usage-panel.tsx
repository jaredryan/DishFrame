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

function toSelection(usage: PartUsage): PropagationSelection {
  return { containerDishId: usage.containerDishId, lineageId: usage.lineageId };
}

function outcomeLabel(outcome: PropagationOutcome): string {
  if (outcome.status === "updated") return "Updated";
  return outcome.reason;
}

/**
 * PRODUCT_SPEC.md §71 "Recipes using this Part" — current usages only.
 * Slice 6 correction pass §2: the direct-duplicate invariant guarantees a
 * given Part is directly linked at most once per parent Version, so each
 * `PartUsage` here is exactly one affected parent — one row, one checkbox,
 * selected independently. There is no occurrence-level grouping/selection
 * within a single parent; `lineageId` is carried through only as the stable
 * internal identifier `propagatePartUpdate`/`resolvePartUsageOccurrence`
 * target.
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
  const [selectedContainerIds, setSelectedContainerIds] = React.useState<
    Set<string>
  >(new Set());
  const [outcomesByContainerId, setOutcomesByContainerId] = React.useState<
    Map<string, PropagationOutcome>
  >(new Map());
  const [error, setError] = React.useState<string | null>(null);

  const outOfDateUsages = currentVersionId
    ? usages.filter((usage) => usage.targetDishVersionId !== currentVersionId)
    : [];

  function runPropagation(selectedUsages: PartUsage[]) {
    if (!currentVersionId || selectedUsages.length === 0) return;
    setError(null);
    startTransition(async () => {
      const result = await propagatePartUpdate({
        partDishId,
        newTargetVersionId: currentVersionId,
        selections: selectedUsages.map(toSelection),
      });
      if (result.status === "success") {
        setOutcomesByContainerId((prev) => {
          const next = new Map(prev);
          for (const outcome of result.outcomes) {
            next.set(outcome.containerDishId, outcome);
          }
          return next;
        });
        setPickerOpen(false);
        setSelectedContainerIds(new Set());
      } else {
        setError(result.message);
      }
    });
  }

  function toggleSelection(containerDishId: string) {
    setSelectedContainerIds((prev) => {
      const next = new Set(prev);
      if (next.has(containerDishId)) next.delete(containerDishId);
      else next.add(containerDishId);
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
              onClick={() => runPropagation(outOfDateUsages)}
            >
              <RefreshCw /> {isPending ? "Updating…" : "Update everywhere"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setSelectedContainerIds(
                  new Set(
                    outOfDateUsages.map((usage) => usage.containerDishId),
                  ),
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
        {usages.map((usage) => {
          const outOfDate =
            !!currentVersionId &&
            usage.targetDishVersionId !== currentVersionId;
          const outcome = outcomesByContainerId.get(usage.containerDishId);
          return (
            <li
              key={usage.id}
              className="border-border flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`${dishBasePath(usage.containerKind)}/${usage.containerDishId}`}
                  className="text-primary truncate font-medium hover:underline"
                >
                  {usage.containerTitle}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {usage.sectionName
                    ? `In ${usage.sectionName} · `
                    : "Top-level · "}
                  V{usage.containerMajorVersion}.{usage.containerMinorVersion}
                </p>
              </div>
              {outcome ? (
                <span
                  className={
                    outcome.status === "failed"
                      ? "text-destructive shrink-0 text-xs"
                      : "text-foreground shrink-0 text-xs"
                  }
                >
                  {outcomeLabel(outcome)}
                </span>
              ) : (
                outOfDate && (
                  <span
                    className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
                    title="This usage references an earlier Version of this Part than the current one."
                  >
                    <AlertCircle className="size-3.5" aria-hidden="true" />
                    Newer Version available
                  </span>
                )
              )}
            </li>
          );
        })}
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
              Only the checked items will be updated to this Part&apos;s current
              Version.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {usages.map((usage) => {
              const outOfDate =
                !!currentVersionId &&
                usage.targetDishVersionId !== currentVersionId;
              return (
                <label
                  key={usage.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={selectedContainerIds.has(usage.containerDishId)}
                    disabled={!outOfDate}
                    onCheckedChange={() =>
                      toggleSelection(usage.containerDishId)
                    }
                  />
                  <span>
                    <span className="font-medium">{usage.containerTitle}</span>{" "}
                    <span className="text-muted-foreground">
                      (
                      {usage.sectionName
                        ? `In ${usage.sectionName}`
                        : "Top-level"}
                      {!outOfDate ? ", already current" : ""})
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                runPropagation(
                  usages.filter((usage) =>
                    selectedContainerIds.has(usage.containerDishId),
                  ),
                )
              }
              disabled={isPending || selectedContainerIds.size === 0}
            >
              {isPending ? "Updating…" : "Update selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
