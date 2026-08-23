"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createTimer } from "@/lib/cooking/actions";
import type { UnitViewModel } from "@/components/domain/cooking/cooking-mode-types";

/**
 * The one Start-timer modal shared by every responsive Timers area
 * (desktop rail, tablet left utility rail, mobile bottom drawer) — Name +
 * Minutes only, never a Section selector. If a Section is currently open
 * its name only prepopulates Name as a convenience; Start timer is never
 * disabled for lack of a selection, and always attaches the timer to
 * whichever Section is current (or the session's first Section otherwise)
 * purely as internal bookkeeping — never surfaced as a choice here.
 */
export function StartTimerDialog({
  open,
  onOpenChangeAction,
  sessionId,
  unitViewModels,
  selectedDestination,
  onCreatedAction,
}: {
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  sessionId: string;
  unitViewModels: UnitViewModel[];
  selectedDestination: string | null;
  onCreatedAction: () => void;
}) {
  const selectedUnit = selectedDestination
    ? (unitViewModels.find((vm) => vm.unit.id === selectedDestination)?.unit ??
      null)
    : null;
  const unitId = selectedUnit?.id ?? unitViewModels[0]?.unit.id ?? null;
  const defaultName = selectedUnit ? selectedUnit.label : "Timer";

  const [name, setName] = React.useState(defaultName);
  const [minutes, setMinutes] = React.useState("10");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [prevOpen, setPrevOpen] = React.useState(open);
  const nameId = React.useId();
  const minutesId = React.useId();

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(defaultName);
      setMinutes("10");
      setError(null);
    }
  }

  function handleCreate() {
    if (!unitId) {
      setError("No Section available to attach this timer to.");
      return;
    }
    const parsedMinutes = Number(minutes);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      setError("Enter a duration greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await createTimer({
        sessionId,
        unitId,
        name: name.trim() || "Timer",
        durationSeconds: Math.round(parsedMinutes * 60),
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      onOpenChangeAction(false);
      onCreatedAction();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onOpenChangeAction(false)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a timer</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-32 flex-1 flex-col gap-1">
            <Label htmlFor={nameId} className="text-xs font-normal">
              Name
            </Label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex w-20 shrink-0 flex-col gap-1">
            <Label htmlFor={minutesId} className="text-xs font-normal">
              Minutes
            </Label>
            <Input
              id={minutesId}
              inputMode="decimal"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="text-destructive-text text-xs">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChangeAction(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isPending}>
            Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
