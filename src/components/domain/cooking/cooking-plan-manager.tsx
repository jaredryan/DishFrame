"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  ListChecks,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  addSessionUnits,
  removeSessionUnit,
  restoreSessionUnit,
  reorderSessionUnits,
  deleteCookingSession,
} from "@/lib/cooking/actions";

export type PlanUnit = {
  id: string;
  label: string;
  sourceDishTitle: string;
  sourceDishVersionLabel: string;
  removedAt: string | null;
  removedAfterProgress: boolean;
};

export type AddableUnit = {
  unitKey: string;
  label: string;
  // SLICE_9.md refinement pass — set only for a Part reached by linking
  // through another Part, so it can be shown as its own nested, independently
  // selectable unit (PRODUCT_SPEC.md §23.4).
  parentPartLabel: string | null;
};

/**
 * Active-plan editing (PRODUCT_SPEC.md §27), tucked behind a Sheet trigger
 * rather than the primary cooking surface — the Slice 7 shell's add/remove/
 * restore/reorder controls, unchanged in behavior, relocated so management
 * doesn't compete with the focused cooking view (Slice 8's "clear
 * separation between navigation, completion, removal, and collapse
 * meanings," §28.5).
 */
export function CookingPlanManager({
  sessionId,
  dishTitle,
  activeUnits,
  removedUnits,
  addableUnits,
  onUnitRemoved,
}: {
  sessionId: string;
  dishTitle: string;
  activeUnits: PlanUnit[];
  removedUnits: PlanUnit[];
  addableUnits: AddableUnit[];
  onUnitRemoved?: (unitId: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [finalUnitGuard, setFinalUnitGuard] = React.useState(false);

  function runEdit(
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.status === "final-unit-guard") {
        setFinalUnitGuard(true);
      } else if (result.status === "error") {
        setError(result.message ?? "Something went wrong.");
      } else {
        router.refresh();
      }
    });
  }

  function handleMove(unitId: string, direction: -1 | 1) {
    const ids = activeUnits.map((u) => u.id);
    const index = ids.indexOf(unitId);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    runEdit(() => reorderSessionUnits({ sessionId, orderedUnitIds: ids }));
  }

  function handleRemove(unitId: string) {
    onUnitRemoved?.(unitId);
    runEdit(() => removeSessionUnit({ sessionId, unitId }));
  }

  function handleRestore(unitId: string) {
    runEdit(() => restoreSessionUnit({ sessionId, unitId }));
  }

  function handleAdd(unitKey: string) {
    runEdit(() => addSessionUnits({ sessionId, unitKeys: [unitKey] }));
  }

  function handleDeleteSession() {
    startTransition(async () => {
      await deleteCookingSession({ sessionId });
      router.push("/cook");
    });
  }

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            <ListChecks className="size-4" aria-hidden="true" />
            Manage plan
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <SheetHeader>
            <SheetTitle>Manage this session&apos;s plan</SheetTitle>
            <SheetDescription>
              Add, remove, restore, or reorder what you&apos;re cooking today.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            {error && (
              <p role="alert" className="text-destructive-text text-sm">
                {error}
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {activeUnits.map((unit, index) => (
                <li
                  key={unit.id}
                  className="border-border flex items-center justify-between gap-2 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">
                      {unit.label}
                    </p>
                    {unit.sourceDishTitle !== dishTitle && (
                      <p className="text-muted-foreground text-xs">
                        From {unit.sourceDishTitle} —{" "}
                        {unit.sourceDishVersionLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <TooltipIconButton
                      label={`Move ${unit.label} up`}
                      icon={ChevronUp}
                      onClick={() => handleMove(unit.id, -1)}
                      disabled={isPending || index === 0}
                    />
                    <TooltipIconButton
                      label={`Move ${unit.label} down`}
                      icon={ChevronDown}
                      onClick={() => handleMove(unit.id, 1)}
                      disabled={isPending || index === activeUnits.length - 1}
                    />
                    <TooltipIconButton
                      label={`Remove ${unit.label}`}
                      icon={Trash2}
                      onClick={() => handleRemove(unit.id)}
                      disabled={isPending}
                      className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                    />
                  </div>
                </li>
              ))}
            </ul>

            {addableUnits.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Add to this session
                </h3>
                <ul className="flex flex-col gap-2">
                  {addableUnits.map((unit) => (
                    <li
                      key={unit.unitKey}
                      className="border-border flex items-center justify-between gap-2 rounded-lg border border-dashed p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-sm">
                          {unit.label}
                        </p>
                        {unit.parentPartLabel && (
                          <p className="text-muted-foreground text-xs">
                            Nested in {unit.parentPartLabel}
                          </p>
                        )}
                      </div>
                      <TooltipIconButton
                        label={`Add ${unit.label}`}
                        icon={Plus}
                        onClick={() => handleAdd(unit.unitKey)}
                        disabled={isPending}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {removedUnits.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Removed from this session
                </h3>
                <ul className="flex flex-col gap-2">
                  {removedUnits.map((unit) => (
                    <li
                      key={unit.id}
                      className="border-border flex items-center justify-between gap-2 rounded-lg border border-dashed p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-muted-foreground truncate text-sm">
                          {unit.label}
                        </p>
                        {unit.removedAfterProgress && (
                          <Badge variant="outline" className="mt-1">
                            Removed after progress
                          </Badge>
                        )}
                      </div>
                      <TooltipIconButton
                        label={`Restore ${unit.label}`}
                        icon={RotateCcw}
                        onClick={() => handleRestore(unit.id)}
                        disabled={isPending}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">Done</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={finalUnitGuard}
        onOpenChange={(nextOpen) => !nextOpen && setFinalUnitGuard(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This is the last active unit</DialogTitle>
            <DialogDescription>
              Removing it would leave this Cooking Session empty. Keep editing,
              or delete the whole session instead. Deleting removes any progress
              recorded in this session.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalUnitGuard(false)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSession}
              disabled={isPending}
            >
              Delete session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
