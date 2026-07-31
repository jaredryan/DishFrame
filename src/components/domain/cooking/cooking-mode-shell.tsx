"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Timer as TimerIcon,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ScaleControl,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";
import {
  CookingPlanManager,
  type PlanUnit,
  type AddableUnit,
} from "@/components/domain/cooking/cooking-plan-manager";
import {
  useLiveTimers,
  type LiveTimer,
} from "@/components/domain/cooking/use-live-timers";
import { formatCountdown } from "@/lib/cooking/timer-math";
import { playTimerDing } from "@/lib/cooking/timer-sound";
import {
  toggleChecklistItem,
  setUnitCompletion,
  updateSessionScale,
  updateUnitScale,
  createTimer,
  startTimer,
  pauseTimer,
  resetTimer,
  adjustTimer,
  dismissTimer,
  endCookingSession,
} from "@/lib/cooking/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

export type CookingModeChecklistItem = {
  id: string;
  kind: "INGREDIENT" | "INSTRUCTION";
  displayText: string;
  displayQuantity: string | null;
  displayUnit: string | null;
  checkedAt: string | null;
  conflict: { type: "needs-more" | "exceeds"; amount: number } | null;
};

export type CookingModeTimer = {
  id: string;
  name: string;
  durationSeconds: number;
  targetEndAt: string | null;
  remainingSeconds: number | null;
  state: "RUNNING" | "PAUSED" | "EXPIRED" | "DISMISSED";
};

export type CookingModeUnit = {
  id: string;
  label: string;
  sourceDishTitle: string;
  sourceDishVersionLabel: string;
  removedAt: string | null;
  removedAfterProgress: boolean;
  completedAt: string | null;
  scaleFactor: number;
  outputQuantity: number | null;
  outputUnit: string | null;
  checklistItems: CookingModeChecklistItem[];
  timers: CookingModeTimer[];
};

function useElapsedSeconds(startedAt: string, isActive: boolean): number {
  const [elapsed, setElapsed] = React.useState(() =>
    Math.max(
      0,
      Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
    ),
  );
  React.useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setElapsed(
        Math.max(
          0,
          Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
        ),
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);
  return elapsed;
}

function formatMultiplier(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function unitProgress(unit: CookingModeUnit): {
  checked: number;
  total: number;
} {
  const total = unit.checklistItems.length;
  const checked = unit.checklistItems.filter((i) => i.checkedAt != null).length;
  return { checked, total };
}

function nextFocusUnitId(
  units: CookingModeUnit[],
  currentId: string | null,
): string | null {
  const active = units.filter((u) => !u.removedAt);
  const incomplete = active.filter((u) => u.completedAt == null);
  const next = incomplete.find((u) => u.id !== currentId) ?? incomplete[0];
  return next?.id ?? active[0]?.id ?? currentId;
}

/**
 * ARCHITECTURE_PROPOSAL.md §C.8 / PRODUCT_SPEC.md §28 — the dedicated
 * Cooking Mode surface: one focused unit at a time, fast switching, visible
 * progress, and persistent timers, with plan management and lifecycle
 * actions present but deliberately not dominant (§28.5's distinct-meanings
 * requirement).
 */
export function CookingModeShell({
  sessionId,
  state,
  isActive,
  startedAt,
  endedAt,
  dishId,
  dishTitle,
  dishKind,
  versionLabel,
  units,
  addableUnits,
  sessionScaleFactor,
  sourceOutputQuantity,
  sourceOutputUnit,
  timerSoundEnabled,
  initialFocusedUnitId,
}: {
  sessionId: string;
  state: "IN_PROGRESS" | "COMPLETED" | "ENDED_EARLY";
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
  dishId: string;
  dishTitle: string;
  dishKind: DishKindValue | null;
  versionLabel: string;
  units: CookingModeUnit[];
  addableUnits: AddableUnit[];
  sessionScaleFactor: number;
  sourceOutputQuantity: number | null;
  sourceOutputUnit: string | null;
  timerSoundEnabled: boolean;
  initialFocusedUnitId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [checkOverrides, setCheckOverrides] = React.useState<
    Record<string, boolean>
  >({});
  const [confirmingEnd, setConfirmingEnd] = React.useState<
    "COMPLETED" | "ENDED_EARLY" | null
  >(null);
  const [sessionScaleOpen, setSessionScaleOpen] = React.useState(false);
  const [pendingSessionScale, setPendingSessionScale] = React.useState<
    number | null
  >(sessionScaleFactor);
  const [scalingUnitId, setScalingUnitId] = React.useState<string | null>(null);
  const [pendingUnitScale, setPendingUnitScale] = React.useState<number | null>(
    null,
  );
  const [addTimerUnitId, setAddTimerUnitId] = React.useState<string | null>(
    null,
  );

  const activeUnits = React.useMemo(
    () => units.filter((u) => !u.removedAt),
    [units],
  );
  const removedUnits = React.useMemo(
    () => units.filter((u) => u.removedAt),
    [units],
  );

  const [focusedUnitId, setFocusedUnitId] = React.useState<string | null>(
    () =>
      (initialFocusedUnitId &&
      activeUnits.some((u) => u.id === initialFocusedUnitId)
        ? initialFocusedUnitId
        : null) ??
      activeUnits.find((u) => u.completedAt == null)?.id ??
      activeUnits[0]?.id ??
      null,
  );
  const focusedUnit =
    activeUnits.find((u) => u.id === focusedUnitId) ?? activeUnits[0] ?? null;

  const allTimers: LiveTimer[] = React.useMemo(
    () =>
      activeUnits.flatMap((unit) =>
        unit.timers
          .filter((t) => t.state !== "DISMISSED")
          .map((t) => ({ ...t, id: t.id, name: t.name })),
      ),
    [activeUnits],
  );
  const liveTimers = useLiveTimers(allTimers, (timer) => {
    if (timerSoundEnabled) playTimerDing();
    void timer;
  });
  const hasRunningTimer = allTimers.some((t) => t.state === "RUNNING");

  React.useEffect(() => {
    if (!isActive || !hasRunningTimer) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isActive, hasRunningTimer]);

  const elapsedSeconds = useElapsedSeconds(startedAt, isActive);

  const totalUnits = activeUnits.length;
  const completedUnits = activeUnits.filter(
    (u) => u.completedAt != null,
  ).length;
  const totalItems = activeUnits.reduce(
    (sum, u) => sum + u.checklistItems.length,
    0,
  );
  const checkedItems = activeUnits.reduce(
    (sum, u) =>
      sum + u.checklistItems.filter((i) => i.checkedAt != null).length,
    0,
  );

  function effectiveChecked(item: CookingModeChecklistItem): boolean {
    return checkOverrides[item.id] ?? item.checkedAt != null;
  }

  function handleToggleItem(itemId: string, checked: boolean) {
    setCheckOverrides((prev) => ({ ...prev, [itemId]: checked }));
    startTransition(async () => {
      const result = await toggleChecklistItem({ sessionId, itemId, checked });
      if (result.status === "error") {
        setError(result.message);
        setCheckOverrides((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
      } else {
        setCheckOverrides((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        router.refresh();
      }
    });
  }

  function handleSetUnitCompletion(unitId: string, completed: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setUnitCompletion({ sessionId, unitId, completed });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (completed) {
        focusUnit(nextFocusUnitId(units, unitId));
      }
      router.refresh();
    });
  }

  function handleSaveSessionScale() {
    setError(null);
    startTransition(async () => {
      const result = await updateSessionScale({
        sessionId,
        scaleFactor: pendingSessionScale,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setSessionScaleOpen(false);
      router.refresh();
    });
  }

  function handleSaveUnitScale() {
    if (!scalingUnitId) return;
    setError(null);
    startTransition(async () => {
      const result = await updateUnitScale({
        sessionId,
        unitId: scalingUnitId,
        scaleFactor: pendingUnitScale,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setScalingUnitId(null);
      router.refresh();
    });
  }

  function handleEnd(outcome: "COMPLETED" | "ENDED_EARLY") {
    setError(null);
    startTransition(async () => {
      const result = await endCookingSession({ sessionId, outcome });
      setConfirmingEnd(null);
      if (result.status === "error") {
        setError(result.message);
      } else {
        router.refresh();
      }
    });
  }

  /** Persists focus in the URL (?unit=) via history.replaceState, not
   * router navigation, so switching units stays instant (§29.4's "survive
   * refresh" extended to which unit is on screen, not just timer state). */
  function focusUnit(unitId: string | null) {
    setFocusedUnitId(unitId);
    const url = new URL(window.location.href);
    if (unitId) {
      url.searchParams.set("unit", unitId);
    } else {
      url.searchParams.delete("unit");
    }
    window.history.replaceState(null, "", url);
  }

  function jumpToUnit(unitId: string) {
    focusUnit(unitId);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <div className="border-border bg-background/95 sticky top-0 z-10 flex flex-col gap-2 border-b px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/cook"
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Exit
          </Link>
          <div className="min-w-0 flex-1 text-center">
            <p className="font-heading text-foreground truncate text-sm font-semibold">
              {dishTitle}
            </p>
            <p className="text-muted-foreground text-xs">
              {versionLabel}
              {isActive && ` · ${formatElapsed(elapsedSeconds)}`}
              {!isActive &&
                ` · ${state === "COMPLETED" ? "Completed" : "Ended early"}${endedAt ? ` ${new Date(endedAt).toLocaleString()}` : ""}`}
            </p>
          </div>
          {isActive ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmingEnd("ENDED_EARLY")}
              disabled={isPending}
            >
              End
            </Button>
          ) : (
            <Link
              href={dishKind ? `${dishBasePath(dishKind)}/${dishId}` : "/cook"}
              className="text-primary shrink-0 text-sm hover:underline"
            >
              View source
            </Link>
          )}
        </div>

        {totalUnits > 0 && (
          <div className="flex items-center gap-2">
            <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
              <div
                className="bg-brand-green h-full rounded-full transition-[width]"
                style={{
                  width: `${totalItems > 0 ? (checkedItems / totalItems) * 100 : (completedUnits / totalUnits) * 100}%`,
                }}
              />
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {completedUnits}/{totalUnits} done
            </span>
          </div>
        )}

        {isActive && (
          <div className="flex flex-wrap items-center gap-2">
            <CookingPlanManager
              sessionId={sessionId}
              dishTitle={dishTitle}
              activeUnits={activeUnits as PlanUnit[]}
              removedUnits={removedUnits as PlanUnit[]}
              addableUnits={addableUnits}
              onUnitRemoved={(unitId) => {
                if (unitId === focusedUnitId) {
                  focusUnit(nextFocusUnitId(units, unitId));
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingSessionScale(sessionScaleFactor);
                setSessionScaleOpen(true);
              }}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Scale session
            </Button>
          </div>
        )}
      </div>

      {allTimers.length > 0 && (
        <div className="border-border flex gap-2 overflow-x-auto border-b px-4 py-2">
          {allTimers.map((timer) => {
            const live = liveTimers.get(timer.id);
            const owningUnit = activeUnits.find((u) =>
              u.timers.some((t) => t.id === timer.id),
            );
            const expired = live?.isExpired ?? false;
            return (
              <button
                key={timer.id}
                type="button"
                onClick={() => owningUnit && jumpToUnit(owningUnit.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tabular-nums ${
                  expired
                    ? "border-brand-orange bg-brand-orange/10 text-brand-orange animate-pulse"
                    : timer.state === "RUNNING"
                      ? "border-brand-orange/50 text-brand-orange"
                      : "border-border text-muted-foreground"
                }`}
              >
                <TimerIcon className="size-3.5" aria-hidden="true" />
                {timer.name}
                {" · "}
                {expired
                  ? "Time's up"
                  : formatCountdown(live?.remainingSeconds ?? 0)}
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="text-destructive px-4 pt-2 text-sm">{error}</p>}

      {activeUnits.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {activeUnits.map((unit) => {
            const progress = unitProgress(unit);
            const unitHasRunningTimer = unit.timers.some(
              (t) => t.state === "RUNNING",
            );
            const isFocused = unit.id === focusedUnit?.id;
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => jumpToUnit(unit.id)}
                aria-current={isFocused}
                className={`min-w-28 shrink-0 rounded-lg border p-2 text-left transition-colors ${
                  isFocused
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div
                  className={`mb-1.5 h-1 rounded-full ${
                    unit.completedAt
                      ? "bg-brand-green"
                      : unitHasRunningTimer
                        ? "bg-brand-orange"
                        : "bg-border"
                  }`}
                />
                <p className="text-foreground truncate text-xs font-medium">
                  {unit.label}
                </p>
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  {unit.completedAt ? (
                    <span className="text-brand-green inline-flex items-center gap-0.5">
                      <Check className="size-3" aria-hidden="true" /> Done
                    </span>
                  ) : progress.total > 0 ? (
                    `${progress.checked}/${progress.total}`
                  ) : (
                    "—"
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {focusedUnit ? (
        <div className="flex flex-1 flex-col gap-6 px-4 pb-24">
          <div className="flex items-start justify-between gap-2 pt-1">
            <div className="min-w-0">
              <h1 className="font-heading text-foreground text-2xl font-semibold text-balance">
                {focusedUnit.label}
              </h1>
              {focusedUnit.sourceDishTitle !== dishTitle && (
                <p className="text-muted-foreground text-sm">
                  From {focusedUnit.sourceDishTitle} —{" "}
                  {focusedUnit.sourceDishVersionLabel}
                </p>
              )}
            </div>
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPendingUnitScale(focusedUnit.scaleFactor);
                  setScalingUnitId(focusedUnit.id);
                }}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Scale
              </Button>
            )}
          </div>

          {focusedUnit.checklistItems.filter((i) => i.kind === "INGREDIENT")
            .length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Ingredients
              </h2>
              <ul className="flex flex-col gap-1">
                {focusedUnit.checklistItems
                  .filter((i) => i.kind === "INGREDIENT")
                  .map((item) => {
                    const checked = effectiveChecked(item);
                    return (
                      <li key={item.id}>
                        <label className="hover:bg-muted/40 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2">
                          <Checkbox
                            checked={checked}
                            disabled={!isActive}
                            onCheckedChange={(next) =>
                              handleToggleItem(item.id, next === true)
                            }
                            className="mt-0.5 size-5"
                          />
                          <span
                            className={`flex-1 text-base ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
                          >
                            {[item.displayQuantity, item.displayUnit]
                              .filter(Boolean)
                              .join(" ")}{" "}
                            {item.displayText}
                          </span>
                          {item.conflict && (
                            <Badge
                              variant="outline"
                              className={
                                item.conflict.type === "needs-more"
                                  ? "border-brand-orange/50 text-brand-orange shrink-0"
                                  : "text-muted-foreground shrink-0"
                              }
                            >
                              {item.conflict.type === "needs-more"
                                ? `+${item.conflict.amount} more needed`
                                : `${item.conflict.amount} extra`}
                            </Badge>
                          )}
                        </label>
                      </li>
                    );
                  })}
              </ul>
            </section>
          )}

          {focusedUnit.checklistItems.filter((i) => i.kind === "INSTRUCTION")
            .length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Instructions
              </h2>
              <ol className="flex flex-col gap-1">
                {focusedUnit.checklistItems
                  .filter((i) => i.kind === "INSTRUCTION")
                  .map((item, index) => {
                    const checked = effectiveChecked(item);
                    return (
                      <li key={item.id}>
                        <label className="hover:bg-muted/40 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-2 py-2">
                          <Checkbox
                            checked={checked}
                            disabled={!isActive}
                            onCheckedChange={(next) =>
                              handleToggleItem(item.id, next === true)
                            }
                            className="mt-0.5 size-5"
                          />
                          <span className="text-muted-foreground w-5 shrink-0 text-sm tabular-nums">
                            {index + 1}.
                          </span>
                          <span
                            className={`flex-1 text-base ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
                          >
                            {item.displayText}
                          </span>
                        </label>
                      </li>
                    );
                  })}
              </ol>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Timers
            </h2>
            {focusedUnit.timers.filter((t) => t.state !== "DISMISSED")
              .length === 0 &&
              !isActive && (
                <p className="text-muted-foreground text-sm">No timers.</p>
              )}
            <ul className="flex flex-col gap-2">
              {focusedUnit.timers
                .filter((t) => t.state !== "DISMISSED")
                .map((timer) => (
                  <TimerRow
                    key={timer.id}
                    sessionId={sessionId}
                    timer={timer}
                    live={liveTimers.get(timer.id)}
                    isActive={isActive}
                    onChanged={() => router.refresh()}
                  />
                ))}
            </ul>
            {isActive &&
              (addTimerUnitId === focusedUnit.id ? (
                <AddTimerForm
                  sessionId={sessionId}
                  unitId={focusedUnit.id}
                  onDone={() => {
                    setAddTimerUnitId(null);
                    router.refresh();
                  }}
                  onCancel={() => setAddTimerUnitId(null)}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setAddTimerUnitId(focusedUnit.id)}
                >
                  <TimerIcon className="size-4" aria-hidden="true" />
                  {focusedUnit.timers.filter((t) => t.state !== "DISMISSED")
                    .length === 0
                    ? "Start a timer"
                    : "Add another timer"}
                </Button>
              ))}
          </section>

          {isActive && (
            <div className="mt-auto pt-4">
              {focusedUnit.completedAt ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleSetUnitCompletion(focusedUnit.id, false)}
                  disabled={isPending}
                >
                  <Undo2 className="size-4" aria-hidden="true" />
                  Reopen this unit
                </Button>
              ) : (
                <Button
                  className="bg-brand-green hover:bg-brand-green/90 w-full text-white"
                  onClick={() => handleSetUnitCompletion(focusedUnit.id, true)}
                  disabled={isPending}
                >
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Mark {focusedUnit.label} complete
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center px-4 py-16 text-center text-sm">
          No active units in this session.
        </div>
      )}

      <Dialog
        open={sessionScaleOpen}
        onOpenChange={(open) => !open && setSessionScaleOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale the whole session</DialogTitle>
            <DialogDescription>
              Current: {sessionScaleFactor}×. Updates remaining quantities for
              every unit — anything already checked off is flagged, not silently
              changed.
            </DialogDescription>
          </DialogHeader>
          <ScaleControl
            outputQuantity={sourceOutputQuantity}
            outputUnit={sourceOutputUnit}
            targetLabel="Cook for"
            multiplierLabel="Scale"
            currentMultiplier={sessionScaleFactor}
            onMultiplierChange={setPendingSessionScale}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSessionScaleOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveSessionScale} disabled={isPending}>
              Save scale change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={scalingUnitId != null}
        onOpenChange={(open) => !open && setScalingUnitId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scale {focusedUnit?.label}</DialogTitle>
            <DialogDescription>
              A relative adjustment on top of the whole session&apos;s scale —
              updates this unit&apos;s remaining quantities only.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline">{`Session ×${formatMultiplier(sessionScaleFactor)}`}</Badge>
            <span className="text-muted-foreground">×</span>
            <Badge variant="outline">{`This unit ×${formatMultiplier(pendingUnitScale ?? 1)}`}</Badge>
            <span className="text-muted-foreground">=</span>
            <Badge>{`Effective ×${formatMultiplier(sessionScaleFactor * (pendingUnitScale ?? 1))}`}</Badge>
          </div>
          <ScaleControl
            outputQuantity={computeOutputBasis(
              focusedUnit?.outputQuantity ?? null,
              sessionScaleFactor,
            )}
            outputUnit={focusedUnit?.outputUnit ?? null}
            targetLabel="Make"
            multiplierLabel="Scale this unit"
            currentMultiplier={focusedUnit?.scaleFactor ?? null}
            onMultiplierChange={setPendingUnitScale}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScalingUnitId(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveUnitScale} disabled={isPending}>
              Save scale change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmingEnd != null}
        onOpenChange={(open) => !open && setConfirmingEnd(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmingEnd === "COMPLETED"
                ? "Finish this Cooking Session?"
                : "End this Cooking Session early?"}
            </DialogTitle>
            <DialogDescription>
              {hasRunningTimer &&
                "A timer is still running — ending the session stops it and preserves its state. "}
              {confirmingEnd === "COMPLETED"
                ? "Marks this session as completed. This preserves everything recorded so far."
                : "Marks this session as ended early. Partial progress is preserved and can still be reviewed."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-wrap">
            <Button variant="outline" onClick={() => setConfirmingEnd(null)}>
              Keep cooking
            </Button>
            {confirmingEnd === "ENDED_EARLY" && (
              <Button
                variant="outline"
                onClick={() => setConfirmingEnd("COMPLETED")}
              >
                Finish instead
              </Button>
            )}
            <Button
              onClick={() => confirmingEnd && handleEnd(confirmingEnd)}
              disabled={isPending}
            >
              {confirmingEnd === "COMPLETED" ? "Finish session" : "End early"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimerRow({
  sessionId,
  timer,
  live,
  isActive,
  onChanged,
}: {
  sessionId: string;
  timer: CookingModeTimer;
  live: { remainingSeconds: number; isExpired: boolean } | undefined;
  isActive: boolean;
  onChanged: () => void;
}) {
  const [isPending, startTransition] = React.useTransition();

  function run(action: () => Promise<{ status: string }>) {
    startTransition(async () => {
      await action();
      onChanged();
    });
  }

  const expired = live?.isExpired ?? false;
  const remaining = live?.remainingSeconds ?? timer.durationSeconds;

  return (
    <li
      className={`flex items-center gap-2 rounded-lg border p-2.5 ${
        expired
          ? "border-brand-orange bg-brand-orange/10"
          : timer.state === "RUNNING"
            ? "border-brand-orange/40"
            : "border-border"
      }`}
    >
      <TimerIcon
        className={`size-4 shrink-0 ${expired ? "text-brand-orange" : "text-muted-foreground"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">
          {timer.name}
        </p>
        <p
          className={`text-lg font-semibold tabular-nums ${expired ? "text-brand-orange" : "text-foreground"}`}
          role={expired ? "alert" : undefined}
          aria-live={expired ? "assertive" : undefined}
        >
          {expired ? "Time's up" : formatCountdown(remaining)}
        </p>
      </div>
      {isActive && (
        <div className="flex shrink-0 items-center gap-1">
          {timer.state === "RUNNING" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={() =>
                run(() => pauseTimer({ sessionId, timerId: timer.id }))
              }
              aria-label="Pause timer"
            >
              <Pause className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={isPending}
              onClick={() =>
                run(() => startTimer({ sessionId, timerId: timer.id }))
              }
              aria-label={expired ? "Restart timer" : "Start timer"}
            >
              <Play className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            onClick={() =>
              run(() =>
                adjustTimer({
                  sessionId,
                  timerId: timer.id,
                  deltaSeconds: -60,
                }),
              )
            }
            aria-label="Subtract one minute"
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            onClick={() =>
              run(() =>
                adjustTimer({ sessionId, timerId: timer.id, deltaSeconds: 60 }),
              )
            }
            aria-label="Add one minute"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            onClick={() =>
              run(() => resetTimer({ sessionId, timerId: timer.id }))
            }
            aria-label="Reset timer"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            onClick={() =>
              run(() => dismissTimer({ sessionId, timerId: timer.id }))
            }
            aria-label={expired ? "Dismiss timer" : "Complete timer"}
            className="text-destructive hover:text-destructive"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}

function AddTimerForm({
  sessionId,
  unitId,
  onDone,
  onCancel,
}: {
  sessionId: string;
  unitId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState("Timer");
  const [minutes, setMinutes] = React.useState("10");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleCreate() {
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
      onDone();
    });
  }

  return (
    <div className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-timer-name" className="text-xs font-normal">
            Name
          </Label>
          <Input
            id="new-timer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-32"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-timer-minutes" className="text-xs font-normal">
            Minutes
          </Label>
          <Input
            id="new-timer-minutes"
            inputMode="decimal"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-20"
          />
        </div>
        <Button onClick={handleCreate} disabled={isPending} size="sm">
          Start timer
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}
