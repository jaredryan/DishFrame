"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import {
  PartAttachPicker,
  type AttachablePartOption,
} from "@/components/domain/dish/part-attach-picker";
import {
  getCurrentPartUsages,
  resolvePartUsageOccurrence,
  deleteDish,
} from "@/lib/dishes/actions";
import type { PartUsage } from "@/lib/dishes/queries";

/**
 * PRODUCT_SPEC.md §74.2: Phase 1 of the two-phase Part deletion flow.
 * Shown when `deleteDish` fails with `PART_HAS_LIVE_USAGES` — resolves one
 * current usage occurrence at a time (detach/replace/remove), re-fetching
 * the live list after each so the user can leave and come back. Once no
 * usages remain, retries the delete itself (Phase 2).
 */
export function PartUsageResolutionDialog({
  open,
  onOpenChange,
  partDishId,
  attachableParts,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partDishId: string;
  attachableParts: AttachablePartOption[];
  onDeleted: () => void;
}) {
  const [usages, setUsages] = React.useState<PartUsage[] | null>(null);
  const [resolvingLineageId, setResolvingLineageId] = React.useState<
    string | null
  >(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function refresh() {
    const result = await getCurrentPartUsages(partDishId);
    if (result.status === "success") setUsages(result.usages);
    else setError(result.message);
  }

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getCurrentPartUsages(partDishId).then((result) => {
      if (cancelled) return;
      if (result.status === "success") setUsages(result.usages);
      else setError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [open, partDishId]);

  async function resolve(
    usage: PartUsage,
    resolution: "DETACH" | "REPLACE" | "REMOVE",
    replacement?: { targetDishId: string; targetDishVersionId: string },
  ) {
    setError(null);
    setResolvingLineageId(usage.lineageId);
    const result = await resolvePartUsageOccurrence({
      partDishId,
      containerDishId: usage.containerDishId,
      lineageId: usage.lineageId,
      resolution,
      replacement,
    });
    setResolvingLineageId(null);
    if (result.status === "success") {
      await refresh();
    } else {
      setError(result.message);
    }
  }

  async function handleDeleteNow() {
    setError(null);
    setIsDeleting(true);
    const result = await deleteDish("PART", partDishId);
    setIsDeleting(false);
    if (result.status === "success") {
      onDeleted();
    } else {
      setError(result.message);
      if (result.code === "PART_HAS_LIVE_USAGES") await refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve current usages before deleting</DialogTitle>
          <DialogDescription>
            This Part is still linked from the items below. Detach it (keep the
            content, drop the live link), replace it with another Part, or
            remove it from each — then delete. You can leave and come back
            later; nothing here is deleted until every usage is resolved.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-destructive text-sm">{error}</p>}

        {usages === null ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            Loading…
          </p>
        ) : usages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-muted-foreground text-sm">
              All usages resolved.
            </p>
            <Button
              variant="destructive"
              onClick={handleDeleteNow}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        ) : (
          <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
            {usages.map((usage) => {
              const isResolving = resolvingLineageId === usage.lineageId;
              return (
                <li
                  key={usage.id}
                  className="border-border flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <Link
                      href={`${dishBasePath(usage.containerKind)}/${usage.containerDishId}`}
                      className="text-primary font-medium hover:underline"
                      target="_blank"
                    >
                      {usage.containerTitle}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {usage.sectionName
                        ? `In ${usage.sectionName} · `
                        : "Top-level · "}
                      V{usage.containerMajorVersion}.
                      {usage.containerMinorVersion}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isResolving}
                      onClick={() => resolve(usage, "DETACH")}
                    >
                      Detach
                    </Button>
                    <PartAttachPicker
                      containerDishId={usage.containerDishId}
                      containerKind={usage.containerKind}
                      attachableParts={attachableParts}
                      triggerLabel="Replace with…"
                      onAttach={(replacement) =>
                        resolve(usage, "REPLACE", replacement)
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isResolving}
                      onClick={() => resolve(usage, "REMOVE")}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
