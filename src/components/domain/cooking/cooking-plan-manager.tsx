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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePendingAction } from "@/components/ui/use-pending-action";
import { useToast } from "@/components/ui/toast";
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
  const { pendingAction, isPending, run } = usePendingAction<
    | `move-${string}-${-1 | 1}`
    | `remove-${string}`
    | `restore-${string}`
    | `add-${string}`
    | "delete-session"
  >();
  const [finalUnitGuard, setFinalUnitGuard] = React.useState(false);
  const { showToast } = useToast();

  function runEdit(
    actionKey: Exclude<typeof pendingAction, null>,
    action: () => Promise<{ status: string; message?: string }>,
  ) {
    run(actionKey, async () => {
      const result = await action();
      if (result.status === "final-unit-guard") {
        setFinalUnitGuard(true);
      } else if (result.status === "error") {
        showToast({
          variant: "error",
          title: result.message ?? "Something went wrong.",
        });
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
    runEdit(`move-${unitId}-${direction}`, () =>
      reorderSessionUnits({ sessionId, orderedUnitIds: ids }),
    );
  }

  function handleRemove(unitId: string) {
    onUnitRemoved?.(unitId);
    runEdit(`remove-${unitId}`, () => removeSessionUnit({ sessionId, unitId }));
  }

  function handleRestore(unitId: string) {
    runEdit(`restore-${unitId}`, () =>
      restoreSessionUnit({ sessionId, unitId }),
    );
  }

  function handleAdd(unitKey: string) {
    runEdit(`add-${unitKey}`, () =>
      addSessionUnits({ sessionId, unitKeys: [unitKey] }),
    );
  }

  function handleDeleteSession() {
    run("delete-session", async () => {
      const result = await deleteCookingSession({ sessionId });
      if (result.status === "error") {
        showToast({
          variant: "error",
          title: result.message ?? "Something went wrong.",
        });
        return;
      }
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
                      loading={pendingAction === `move-${unit.id}-${-1}`}
                    />
                    <TooltipIconButton
                      label={`Move ${unit.label} down`}
                      icon={ChevronDown}
                      onClick={() => handleMove(unit.id, 1)}
                      disabled={isPending || index === activeUnits.length - 1}
                      loading={pendingAction === `move-${unit.id}-${1}`}
                    />
                    <TooltipIconButton
                      label={`Remove ${unit.label}`}
                      icon={Trash2}
                      onClick={() => handleRemove(unit.id)}
                      disabled={isPending}
                      loading={pendingAction === `remove-${unit.id}`}
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
                        loading={pendingAction === `add-${unit.unitKey}`}
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
                        loading={pendingAction === `restore-${unit.id}`}
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

      <ConfirmDialog
        open={finalUnitGuard}
        onOpenChangeAction={(nextOpen) => !nextOpen && setFinalUnitGuard(false)}
        title="This is the last active unit"
        description="Removing it would leave this Cooking Session empty. Keep editing, or delete the whole session instead. Deleting removes any progress recorded in this session."
        cancelLabel="Keep editing"
        confirmLabel="Delete session"
        destructive
        loading={pendingAction === "delete-session"}
        onConfirmAction={handleDeleteSession}
      />
    </>
  );
}
