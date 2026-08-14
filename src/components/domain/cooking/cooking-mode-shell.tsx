"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleCheck,
  CircleStop,
  SlidersHorizontal,
  Timer as TimerIcon,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { CoachMark } from "@/components/onboarding/coach-mark";
import {
  ScaleControl,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";
import {
  CookingPlanManager,
  type PlanUnit,
  type AddableUnit,
} from "@/components/domain/cooking/cooking-plan-manager";
import { CookingNotesField } from "@/components/domain/cooking/cooking-notes-field";
import {
  IngredientsSection,
  InstructionsSection,
} from "@/components/domain/cooking/checklist-sections";
import { AddTimerForm } from "@/components/domain/cooking/add-timer-form";
import { TimerRow } from "@/components/domain/cooking/timer-row";
import { DesktopCookingLayout } from "@/components/domain/cooking/cooking-mode-desktop-layout";
import {
  useLiveTimers,
  type LiveTimer,
} from "@/components/domain/cooking/use-live-timers";
import { useChecklistState } from "@/components/domain/cooking/use-checklist-state";
import { useTimerActions } from "@/components/domain/cooking/use-timer-actions";
import { formatCountdown } from "@/lib/cooking/timer-math";
import { playTimerDing } from "@/lib/cooking/timer-sound";
import {
  setUnitCompletion,
  updateSessionScale,
  updateUnitScale,
  endCookingSession,
} from "@/lib/cooking/actions";
import type { DishKindValue } from "@/lib/dishes/schema";
import type {
  CookingModeChecklistItem,
  CookingModeTimer,
  CookingModeUnit,
  RailTimer,
  UnitViewModel,
} from "@/components/domain/cooking/cooking-mode-types";

export type {
  CookingModeChecklistItem,
  CookingModeTimer,
  CookingModeUnit,
} from "@/components/domain/cooking/cooking-mode-types";

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

function instructionItemsOf(unit: CookingModeUnit): CookingModeChecklistItem[] {
  return unit.checklistItems.filter((i) => i.kind === "INSTRUCTION");
}

function ingredientItemsOf(unit: CookingModeUnit): CookingModeChecklistItem[] {
  return unit.checklistItems.filter((i) => i.kind === "INGREDIENT");
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
 * Cooking Mode surface. Mobile/tablet keep the original single-column,
 * sticky-header layout below `lg:`; desktop (`lg:` and up) renders the
 * redesigned three-zone workspace (`DesktopCookingLayout`) — a persistent
 * Section nav, a focused center destination, and a sticky timer rail —
 * instead of the horizontal Section strip and sticky global header. Both
 * layouts share the same state/handlers below, including the
 * device-independent fixes: Instructions-only progress, instant
 * checkbox/timer feedback, collapsible Ingredients, and dropped Part/
 * Section cooking-time provenance.
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
  cookingNotes,
  hasReview,
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
  cookingNotes: string | null;
  hasReview: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [confirmingEnd, setConfirmingEnd] = React.useState(false);
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
  const [collapsedIngredientUnits, setCollapsedIngredientUnits] =
    React.useState<Set<string>>(new Set());
  const [collapsedInstructionUnits, setCollapsedInstructionUnits] =
    React.useState<Set<string>>(new Set());

  const checklistState = useChecklistState(sessionId, units, setError);
  const timerActions = useTimerActions(sessionId, setError);

  const activeUnits = React.useMemo(
    () => units.filter((u) => !u.removedAt),
    [units],
  );
  const removedUnits = React.useMemo(
    () => units.filter((u) => u.removedAt),
    [units],
  );

  /** `null` means the desktop-only "Recipe" destination; mobile never
   * navigates there (no such nav item exists in its markup), so mobile
   * always derives its own fallback below rather than trusting `null`
   * literally — see `mobileFocusedUnit`. Desktop now opens on the Recipe
   * overview by default (refinement pass item 1), so the only way to land
   * directly on a Section is an explicit `?unit=` from `initialFocusedUnitId`. */
  const [selectedDestination, setSelectedDestination] = React.useState<
    string | null
  >(() =>
    initialFocusedUnitId &&
    activeUnits.some((u) => u.id === initialFocusedUnitId)
      ? initialFocusedUnitId
      : null,
  );
  const mobileFocusedUnit =
    activeUnits.find((u) => u.id === selectedDestination) ??
    activeUnits.find((u) => u.completedAt == null) ??
    activeUnits[0] ??
    null;

  function unitEffectiveTimers(unit: CookingModeUnit): CookingModeTimer[] {
    return unit.timers
      .map((t) => timerActions.effective(t))
      .filter((t) => t.state !== "DISMISSED");
  }

  const timerEntries = React.useMemo(
    () =>
      activeUnits.flatMap((unit) =>
        unitEffectiveTimers(unit).map((timer) => ({ timer, unit })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeUnits, timerActions],
  );
  const allTimers: LiveTimer[] = timerEntries.map((e) => e.timer);
  const liveTimers = useLiveTimers(allTimers, (timer) => {
    if (timerSoundEnabled) playTimerDing();
    void timer;
  });
  const hasRunningTimer = allTimers.some((t) => t.state === "RUNNING");

  // Refinement pass item 1: an explicit End-cooking outcome (Leave & resume
  // later / End early / Finish session) already asked the user what they
  // want — set right before those programmatic navigations so the browser's
  // own leave warning doesn't also fire. Departures DishFrame can't
  // replace with its own modal (refresh, closing the tab, browser back/
  // forward, a typed URL) still hit the listener below untouched.
  const skipLeaveWarningRef = React.useRef(false);

  React.useEffect(() => {
    if (!isActive || !hasRunningTimer) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (skipLeaveWarningRef.current) return;
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
  // Item 8: main cooking progress is Instructions-only — checking off
  // Ingredients (their own, separate prep count) never advances it.
  const totalInstructions = activeUnits.reduce(
    (sum, u) => sum + instructionItemsOf(u).length,
    0,
  );
  const checkedInstructions = activeUnits.reduce(
    (sum, u) =>
      sum + instructionItemsOf(u).filter(checklistState.isChecked).length,
    0,
  );

  function handleSetUnitCompletion(unitId: string, completed: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setUnitCompletion({ sessionId, unitId, completed });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      if (completed) {
        selectDestination(nextFocusUnitId(units, unitId));
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
      // Any checklist toggle still debouncing must land before the session
      // leaves IN_PROGRESS — the server rejects checklist writes against an
      // inactive session, so ending first would silently drop a check made
      // just before "End cooking".
      await checklistState.flush();
      const result = await endCookingSession({ sessionId, outcome });
      setConfirmingEnd(false);
      if (result.status === "error") {
        setError(result.message);
      } else {
        // PRODUCT_SPEC.md §33.1/§42 "Ending": both outcomes offer an
        // optional Review — the Review page's own "Not now" is what
        // actually satisfies "creates no empty Review," not this redirect.
        skipLeaveWarningRef.current = true;
        router.push(`/cook/${sessionId}/review`);
      }
    });
  }

  /** "Leave & resume later" — the prior dedicated Exit action's semantics:
   * leave Cooking Mode without ending the still-active session. */
  function handleLeaveAndResume() {
    setConfirmingEnd(false);
    skipLeaveWarningRef.current = true;
    router.push("/cook");
  }

  /** Persists the selected destination in the URL (?unit=) via
   * history.replaceState, not router navigation, so switching stays
   * instant (§29.4's "survive refresh" extended to which destination is on
   * screen, not just timer state). */
  function selectDestination(unitId: string | null) {
    setSelectedDestination(unitId);
    const url = new URL(window.location.href);
    if (unitId) {
      url.searchParams.set("unit", unitId);
    } else {
      url.searchParams.delete("unit");
    }
    window.history.replaceState(null, "", url);
  }

  function markAllChecked(
    items: CookingModeChecklistItem[],
    setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>,
    unitId: string,
  ) {
    const uncheckedIds = items
      .filter((item) => !checklistState.isChecked(item))
      .map((item) => item.id);
    if (uncheckedIds.length > 0) checklistState.toggleAll(uncheckedIds, true);
    setCollapsed((prev) => new Set(prev).add(unitId));
  }

  function resetChecked(items: CookingModeChecklistItem[]) {
    const checkedIds = items
      .filter((item) => checklistState.isChecked(item))
      .map((item) => item.id);
    if (checkedIds.length > 0) checklistState.toggleAll(checkedIds, false);
  }

  function toggleCollapsed(
    setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>,
    unitId: string,
  ) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function handleMarkAllPrepared(unit: CookingModeUnit) {
    markAllChecked(
      ingredientItemsOf(unit),
      setCollapsedIngredientUnits,
      unit.id,
    );
  }

  function handleResetIngredients(unit: CookingModeUnit) {
    resetChecked(ingredientItemsOf(unit));
  }

  function toggleIngredientsCollapsed(unitId: string) {
    toggleCollapsed(setCollapsedIngredientUnits, unitId);
  }

  function handleMarkAllInstructions(unit: CookingModeUnit) {
    markAllChecked(
      instructionItemsOf(unit),
      setCollapsedInstructionUnits,
      unit.id,
    );
  }

  function handleResetInstructions(unit: CookingModeUnit) {
    resetChecked(instructionItemsOf(unit));
  }

  function toggleInstructionsCollapsed(unitId: string) {
    toggleCollapsed(setCollapsedInstructionUnits, unitId);
  }

  function renderTimerRow(timer: CookingModeTimer, sectionLabel?: string) {
    const live = liveTimers.get(timer.id);
    const remaining = live?.remainingSeconds ?? timer.durationSeconds;
    const expired = live?.isExpired ?? false;
    return (
      <TimerRow
        key={timer.id}
        timer={timer}
        remainingSeconds={remaining}
        isExpired={expired}
        isActive={isActive}
        sectionLabel={sectionLabel}
        onStart={() => timerActions.start(timer, remaining)}
        onPause={() => timerActions.pause(timer, remaining)}
        onAdjust={(delta) => timerActions.adjust(timer, delta, remaining)}
        onReset={() => timerActions.reset(timer)}
        onDismiss={() => timerActions.dismiss(timer)}
      />
    );
  }

  const statusLabel = isActive
    ? ` · ${formatElapsed(elapsedSeconds)}`
    : ` · ${state === "COMPLETED" ? "Completed" : "Ended early"}${endedAt ? ` ${new Date(endedAt).toLocaleString()}` : ""}`;

  const unitViewModels: UnitViewModel[] = activeUnits.map((unit) => {
    const instructions = instructionItemsOf(unit);
    return {
      unit,
      instructionProgress: {
        checked: instructions.filter(checklistState.isChecked).length,
        total: instructions.length,
      },
      timerChips: unitEffectiveTimers(unit).map((timer) => {
        const live = liveTimers.get(timer.id);
        return {
          id: timer.id,
          name: timer.name,
          remainingSeconds: live?.remainingSeconds ?? timer.durationSeconds,
          isExpired: live?.isExpired ?? false,
          state: timer.state,
        };
      }),
    };
  });
  const railTimers: RailTimer[] = timerEntries.map(({ timer, unit }) => ({
    timer,
    sectionLabel: unit.label,
  }));

  return (
    <div className="min-h-dvh">
      {/* Mobile/tablet: unchanged single-column layout below `lg:` */}
      <div className="mx-auto flex max-w-2xl flex-col lg:hidden">
        <div className="border-border bg-background/95 sticky top-0 z-10 flex flex-col gap-2 border-b px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-foreground truncate text-sm font-semibold">
                {dishTitle}
              </p>
              <p className="text-muted-foreground text-xs">
                {versionLabel}
                {statusLabel}
              </p>
            </div>
            {!isActive && (
              <div className="flex shrink-0 items-center gap-3">
                <Link
                  href={`/cook/${sessionId}/review`}
                  className="text-primary text-sm hover:underline"
                >
                  {hasReview ? "Edit Review" : "Add Review"}
                </Link>
                <Link
                  href={
                    dishKind ? `${dishBasePath(dishKind)}/${dishId}` : "/cook"
                  }
                  className="text-primary text-sm hover:underline"
                >
                  View source
                </Link>
              </div>
            )}
          </div>

          {totalUnits > 0 && (
            <div className="flex items-center gap-2">
              <div className="bg-muted-foreground h-1.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-brand-green h-full rounded-full transition-[width]"
                  style={{
                    width: `${totalInstructions > 0 ? (checkedInstructions / totalInstructions) * 100 : (completedUnits / totalUnits) * 100}%`,
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
                  if (unitId === selectedDestination) {
                    selectDestination(nextFocusUnitId(units, unitId));
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
              <Button
                size="sm"
                onClick={() => setConfirmingEnd(true)}
                disabled={isPending}
              >
                <CircleStop className="size-4" aria-hidden="true" />
                End cooking
              </Button>
            </div>
          )}
        </div>

        {isActive && (
          <div className="px-4 pt-3">
            <CoachMark guideKey="cooking-session" title="Cooking Sessions">
              This is a Cooking Session — check items off as you go, run timers,
              and adjust scale live. When you finish, you can leave a Session
              Review so DishFrame remembers what worked.
            </CoachMark>
          </div>
        )}

        {allTimers.length > 0 && (
          <div className="border-border flex gap-2 overflow-x-auto border-b px-4 py-2">
            {timerEntries.map(({ timer, unit }) => {
              const live = liveTimers.get(timer.id);
              const expired = live?.isExpired ?? false;
              return (
                <button
                  key={timer.id}
                  type="button"
                  onClick={() => selectDestination(unit.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tabular-nums ${
                    expired
                      ? "border-brand-orange bg-brand-orange/10 text-brand-orange-text animate-pulse"
                      : timer.state === "RUNNING"
                        ? "border-brand-orange/50 text-brand-orange-text"
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

        {error && (
          <p role="alert" className="text-destructive-text px-4 pt-2 text-sm">
            {error}
          </p>
        )}

        <div className="px-4 pt-3">
          <CookingNotesField
            sessionId={sessionId}
            initialNotes={cookingNotes}
          />
        </div>

        {activeUnits.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 py-3">
            {activeUnits.map((unit) => {
              const progress = {
                checked: instructionItemsOf(unit).filter(
                  checklistState.isChecked,
                ).length,
                total: instructionItemsOf(unit).length,
              };
              const unitHasRunningTimer = unitEffectiveTimers(unit).some(
                (t) => t.state === "RUNNING",
              );
              const isFocused = unit.id === mobileFocusedUnit?.id;
              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => selectDestination(unit.id)}
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
                      <span className="text-brand-green-text inline-flex items-center gap-0.5">
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

        {mobileFocusedUnit ? (
          <div className="flex flex-1 flex-col gap-6 px-4 pb-24">
            <div className="flex items-start justify-between gap-2 pt-1">
              <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
                {mobileFocusedUnit.label}
              </h1>
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPendingUnitScale(mobileFocusedUnit.scaleFactor);
                    setScalingUnitId(mobileFocusedUnit.id);
                  }}
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Scale
                </Button>
              )}
            </div>

            <IngredientsSection
              items={ingredientItemsOf(mobileFocusedUnit)}
              isChecked={checklistState.isChecked}
              onToggle={checklistState.toggle}
              onMarkAllPrepared={() => handleMarkAllPrepared(mobileFocusedUnit)}
              onResetAll={() => handleResetIngredients(mobileFocusedUnit)}
              isActive={isActive}
              collapsed={collapsedIngredientUnits.has(mobileFocusedUnit.id)}
              onToggleCollapsed={() =>
                toggleIngredientsCollapsed(mobileFocusedUnit.id)
              }
            />
            <InstructionsSection
              items={instructionItemsOf(mobileFocusedUnit)}
              isChecked={checklistState.isChecked}
              onToggle={checklistState.toggle}
              onMarkAllPrepared={() =>
                handleMarkAllInstructions(mobileFocusedUnit)
              }
              onResetAll={() => handleResetInstructions(mobileFocusedUnit)}
              isActive={isActive}
              collapsed={collapsedInstructionUnits.has(mobileFocusedUnit.id)}
              onToggleCollapsed={() =>
                toggleInstructionsCollapsed(mobileFocusedUnit.id)
              }
            />

            <section className="flex flex-col gap-2">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Timers
              </h2>
              {unitEffectiveTimers(mobileFocusedUnit).length === 0 &&
                !isActive && (
                  <p className="text-muted-foreground text-sm">No timers.</p>
                )}
              <ul className="flex flex-col gap-2">
                {unitEffectiveTimers(mobileFocusedUnit).map((timer) =>
                  renderTimerRow(timer),
                )}
              </ul>
              {isActive &&
                (addTimerUnitId === mobileFocusedUnit.id ? (
                  <AddTimerForm
                    sessionId={sessionId}
                    unitId={mobileFocusedUnit.id}
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
                    onClick={() => setAddTimerUnitId(mobileFocusedUnit.id)}
                  >
                    <TimerIcon className="size-4" aria-hidden="true" />
                    {unitEffectiveTimers(mobileFocusedUnit).length === 0
                      ? "Start a timer"
                      : "Add another timer"}
                  </Button>
                ))}
            </section>

            {isActive && (
              <div className="mt-auto pt-4">
                {mobileFocusedUnit.completedAt ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      handleSetUnitCompletion(mobileFocusedUnit.id, false)
                    }
                    disabled={isPending}
                  >
                    <Undo2 className="size-4" aria-hidden="true" />
                    Reopen this unit
                  </Button>
                ) : (
                  <Button
                    className="bg-success hover:bg-success/90 text-success-foreground w-full"
                    onClick={() =>
                      handleSetUnitCompletion(mobileFocusedUnit.id, true)
                    }
                    disabled={isPending}
                  >
                    <CircleCheck className="size-4" aria-hidden="true" />
                    Mark {mobileFocusedUnit.label} complete
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
      </div>

      {/* Desktop: redesigned three-zone workspace at `lg:` and up */}
      <DesktopCookingLayout
        sessionId={sessionId}
        isActive={isActive}
        dishId={dishId}
        dishTitle={dishTitle}
        dishKind={dishKind}
        versionLabel={versionLabel}
        statusLabel={statusLabel}
        hasReview={hasReview}
        planActiveUnits={activeUnits as PlanUnit[]}
        planRemovedUnits={removedUnits as PlanUnit[]}
        addableUnits={addableUnits}
        onUnitRemoved={(unitId) => {
          if (unitId === selectedDestination) {
            selectDestination(nextFocusUnitId(units, unitId));
          }
        }}
        selectedDestination={selectedDestination}
        onSelectDestination={selectDestination}
        unitViewModels={unitViewModels}
        aggregateProgress={{
          checked: checkedInstructions,
          total: totalInstructions,
        }}
        completedUnitsCount={completedUnits}
        totalUnitsCount={totalUnits}
        cookingNotes={cookingNotes}
        onRequestEnd={() => setConfirmingEnd(true)}
        onOpenSessionScale={() => {
          setPendingSessionScale(sessionScaleFactor);
          setSessionScaleOpen(true);
        }}
        isChecked={checklistState.isChecked}
        onToggleItem={checklistState.toggle}
        onMarkAllPrepared={handleMarkAllPrepared}
        onResetAll={handleResetIngredients}
        collapsedIngredientUnits={collapsedIngredientUnits}
        onToggleIngredientsCollapsed={toggleIngredientsCollapsed}
        onMarkAllInstructions={handleMarkAllInstructions}
        onResetInstructions={handleResetInstructions}
        collapsedInstructionUnits={collapsedInstructionUnits}
        onToggleInstructionsCollapsed={toggleInstructionsCollapsed}
        onOpenUnitScale={(unit) => {
          setPendingUnitScale(unit.scaleFactor);
          setScalingUnitId(unit.id);
        }}
        addTimerUnitId={addTimerUnitId}
        onRequestAddTimer={setAddTimerUnitId}
        onCancelAddTimer={() => setAddTimerUnitId(null)}
        onTimerCreated={() => {
          setAddTimerUnitId(null);
          router.refresh();
        }}
        onSetUnitCompletion={handleSetUnitCompletion}
        isPending={isPending}
        railTimers={railTimers}
        timerActions={timerActions}
        liveTimers={liveTimers}
      />

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
            <DialogTitle>
              Scale {units.find((u) => u.id === scalingUnitId)?.label ?? "unit"}
            </DialogTitle>
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
              units.find((u) => u.id === scalingUnitId)?.outputQuantity ?? null,
              sessionScaleFactor,
            )}
            outputUnit={
              units.find((u) => u.id === scalingUnitId)?.outputUnit ?? null
            }
            targetLabel="Make"
            multiplierLabel="Scale this unit"
            currentMultiplier={
              units.find((u) => u.id === scalingUnitId)?.scaleFactor ?? null
            }
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
        open={confirmingEnd}
        onOpenChange={(open) => !open && setConfirmingEnd(false)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>End cooking?</DialogTitle>
            <DialogDescription>
              Choose what should happen to this cooking session.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-border flex flex-col divide-y">
            <EndCookingOptionRow description="Stay in Cooking Mode and continue this session.">
              <Button variant="outline" onClick={() => setConfirmingEnd(false)}>
                Keep cooking
              </Button>
            </EndCookingOptionRow>
            <EndCookingOptionRow description="Leave Cooking Mode while keeping this session active so you can resume it later.">
              <Button variant="outline" onClick={handleLeaveAndResume}>
                Leave &amp; resume later
              </Button>
            </EndCookingOptionRow>
            <EndCookingOptionRow description="End this session now and preserve its partial progress for review.">
              <Button
                variant="outline"
                onClick={() => handleEnd("ENDED_EARLY")}
                disabled={isPending}
              >
                End early
              </Button>
            </EndCookingOptionRow>
            <EndCookingOptionRow description="Mark this cooking session complete and preserve everything recorded during it.">
              <Button
                onClick={() => handleEnd("COMPLETED")}
                disabled={isPending}
              >
                Finish session
              </Button>
            </EndCookingOptionRow>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Item 3's explanation-left/action-right row, reusing the Profile page's
 * explanatory-action pattern but sharing the modal as one container
 * (separators between rows) instead of giving each choice its own card. */
function EndCookingOptionRow({
  description,
  children,
}: {
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <p className="text-muted-foreground flex-1 text-sm">{description}</p>
      {children}
    </div>
  );
}
