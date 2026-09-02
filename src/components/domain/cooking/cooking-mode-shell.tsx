"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import {
  ScaleControl,
  computeOutputBasis,
} from "@/components/domain/cooking/scale-control";
import {
  type PlanUnit,
  type AddableUnit,
} from "@/components/domain/cooking/cooking-plan-manager";
import {
  DesktopCookingLayout,
  type CookingLayoutProps,
} from "@/components/domain/cooking/cooking-mode-desktop-layout";
import { TabletCookingLayout } from "@/components/domain/cooking/cooking-mode-tablet-layout";
import { MobileCookingLayout } from "@/components/domain/cooking/cooking-mode-mobile-layout";
import { useCookingLayoutMode } from "@/components/domain/cooking/use-cooking-layout-mode";
import {
  useLiveTimers,
  type LiveTimer,
} from "@/components/domain/cooking/use-live-timers";
import { useChecklistState } from "@/components/domain/cooking/use-checklist-state";
import { useTimerActions } from "@/components/domain/cooking/use-timer-actions";
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

/** ARCHITECTURE_PROPOSAL.md §C.8 / PRODUCT_SPEC.md §28 — renders three responsive layouts (mobile/tablet/desktop) from the same state/handlers below. */
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
  versionImageAssetId,
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
  versionImageAssetId: string | null;
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
  const layoutMode = useCookingLayoutMode();
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

  /** `null` = Recipe overview; all three layouts share this destination state, opening here unless `?unit=` sets `initialFocusedUnitId`. */
  const [selectedDestination, setSelectedDestination] = React.useState<
    string | null
  >(() =>
    initialFocusedUnitId &&
    activeUnits.some((u) => u.id === initialFocusedUnitId)
      ? initialFocusedUnitId
      : null,
  );

  const timerEntries = React.useMemo(
    () =>
      activeUnits.flatMap((unit) =>
        unit.timers
          .map((t) => timerActions.effective(t))
          .filter((t) => t.state !== "DISMISSED")
          .map((timer) => ({ timer, unit })),
      ),
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
   * leave Cooking Mode without ending the still-active session. Routes to
   * this Dish's own Cooking history page rather than the generic `/cook`
   * feed — that page intentionally includes Active sessions, so the
   * still-active session surfaces there naturally. Falls back to `/cook`
   * only if the source Dish's kind is somehow unknown. */
  function handleLeaveAndResume() {
    setConfirmingEnd(false);
    skipLeaveWarningRef.current = true;
    router.push(
      dishKind ? `${dishBasePath(dishKind)}/${dishId}/history` : "/cook",
    );
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
    };
  });
  const railTimers: RailTimer[] = timerEntries.map(({ timer, unit }) => ({
    timer,
    sectionLabel: unit.label,
  }));

  /** Fed identically to all three responsive layouts. */
  const layoutProps: CookingLayoutProps = {
    sessionId,
    isActive,
    dishId,
    dishTitle,
    dishKind,
    versionLabel,
    versionImageAssetId,
    statusLabel,
    hasReview,
    planActiveUnits: activeUnits as PlanUnit[],
    planRemovedUnits: removedUnits as PlanUnit[],
    addableUnits,
    onUnitRemoved: (unitId) => {
      if (unitId === selectedDestination) {
        selectDestination(nextFocusUnitId(units, unitId));
      }
    },
    selectedDestination,
    onSelectDestination: selectDestination,
    unitViewModels,
    completedUnitsCount: completedUnits,
    totalUnitsCount: totalUnits,
    cookingNotes,
    onRequestEnd: () => setConfirmingEnd(true),
    onOpenSessionScale: () => {
      setPendingSessionScale(sessionScaleFactor);
      setSessionScaleOpen(true);
    },
    isChecked: checklistState.isChecked,
    onToggleItem: checklistState.toggle,
    onMarkAllPrepared: handleMarkAllPrepared,
    onResetAll: handleResetIngredients,
    collapsedIngredientUnits,
    onToggleIngredientsCollapsed: toggleIngredientsCollapsed,
    onMarkAllInstructions: handleMarkAllInstructions,
    onResetInstructions: handleResetInstructions,
    collapsedInstructionUnits,
    onToggleInstructionsCollapsed: toggleInstructionsCollapsed,
    onOpenUnitScale: (unit) => {
      setPendingUnitScale(unit.scaleFactor);
      setScalingUnitId(unit.id);
    },
    onTimerCreated: () => {
      router.refresh();
    },
    onSetUnitCompletion: handleSetUnitCompletion,
    isPending,
    railTimers,
    timerActions,
    liveTimers,
  };

  return (
    <div className="min-h-dvh">
      {error && (
        <p
          role="alert"
          className="text-destructive-text bg-background border-border border-b px-4 py-2 text-sm"
        >
          {error}
        </p>
      )}

      {/* Exactly one layout mounts at a time — see useCookingLayoutMode. */}
      {layoutMode === "mobile" && <MobileCookingLayout {...layoutProps} />}
      {layoutMode === "tablet" && <TabletCookingLayout {...layoutProps} />}
      {layoutMode === "desktop" && <DesktopCookingLayout {...layoutProps} />}

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
