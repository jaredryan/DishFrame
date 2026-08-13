"use client";

import Link from "next/link";
import {
  Check,
  CircleCheck,
  CircleStop,
  SlidersHorizontal,
  Timer as TimerIcon,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import { CoachMark } from "@/components/onboarding/coach-mark";
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
import { formatCountdown } from "@/lib/cooking/timer-math";
import type {
  CookingModeChecklistItem,
  CookingModeUnit,
  RailTimer,
  UnitViewModel,
} from "@/components/domain/cooking/cooking-mode-types";
import type { useTimerActions } from "@/components/domain/cooking/use-timer-actions";
import type { LiveTimerState } from "@/components/domain/cooking/use-live-timers";
import type { DishKindValue } from "@/lib/dishes/schema";

type TimerActions = ReturnType<typeof useTimerActions>;

/**
 * ARCHITECTURE_PROPOSAL.md §C.8 / desktop Cooking Mode redesign — the
 * three-zone desktop workspace: a sticky left Section nav, a focused center
 * destination (the Recipe/session panel or one Section), and a sticky right
 * rail holding every active timer regardless of which Section is selected.
 * Desktop only (`lg:` and up); mobile/tablet keep the prior single-column
 * layout untouched in `CookingModeShell`.
 */
export function DesktopCookingLayout({
  sessionId,
  isActive,
  dishId,
  dishTitle,
  dishKind,
  versionLabel,
  statusLabel,
  hasReview,
  planActiveUnits,
  planRemovedUnits,
  addableUnits,
  onUnitRemoved,
  selectedDestination,
  onSelectDestination,
  unitViewModels,
  aggregateProgress,
  completedUnitsCount,
  totalUnitsCount,
  cookingNotes,
  onRequestEnd,
  onOpenSessionScale,
  isChecked,
  onToggleItem,
  onMarkAllPrepared,
  onResetAll,
  collapsedIngredientUnits,
  onToggleIngredientsCollapsed,
  onMarkAllInstructions,
  onResetInstructions,
  collapsedInstructionUnits,
  onToggleInstructionsCollapsed,
  onOpenUnitScale,
  addTimerUnitId,
  onRequestAddTimer,
  onCancelAddTimer,
  onTimerCreated,
  onSetUnitCompletion,
  isPending,
  railTimers,
  timerActions,
  liveTimers,
}: {
  sessionId: string;
  isActive: boolean;
  dishId: string;
  dishTitle: string;
  dishKind: DishKindValue | null;
  versionLabel: string;
  statusLabel: string;
  hasReview: boolean;
  planActiveUnits: PlanUnit[];
  planRemovedUnits: PlanUnit[];
  addableUnits: AddableUnit[];
  onUnitRemoved: (unitId: string) => void;
  selectedDestination: string | null;
  onSelectDestination: (destination: string | null) => void;
  unitViewModels: UnitViewModel[];
  aggregateProgress: { checked: number; total: number };
  completedUnitsCount: number;
  totalUnitsCount: number;
  cookingNotes: string | null;
  onRequestEnd: () => void;
  onOpenSessionScale: () => void;
  isChecked: (item: CookingModeChecklistItem) => boolean;
  onToggleItem: (itemId: string, checked: boolean) => void;
  onMarkAllPrepared: (unit: CookingModeUnit) => void;
  onResetAll: (unit: CookingModeUnit) => void;
  collapsedIngredientUnits: Set<string>;
  onToggleIngredientsCollapsed: (unitId: string) => void;
  onMarkAllInstructions: (unit: CookingModeUnit) => void;
  onResetInstructions: (unit: CookingModeUnit) => void;
  collapsedInstructionUnits: Set<string>;
  onToggleInstructionsCollapsed: (unitId: string) => void;
  onOpenUnitScale: (unit: CookingModeUnit) => void;
  addTimerUnitId: string | null;
  onRequestAddTimer: (unitId: string) => void;
  onCancelAddTimer: () => void;
  onTimerCreated: () => void;
  onSetUnitCompletion: (unitId: string, completed: boolean) => void;
  isPending: boolean;
  railTimers: RailTimer[];
  timerActions: TimerActions;
  liveTimers: Map<string, LiveTimerState>;
}) {
  const selectedUnit = selectedDestination
    ? (unitViewModels.find((vm) => vm.unit.id === selectedDestination)?.unit ??
      null)
    : null;

  return (
    <div className="hidden lg:flex lg:h-dvh lg:w-full lg:overflow-hidden">
      <NavRail
        dishTitle={dishTitle}
        selectedDestination={selectedDestination}
        onSelectDestination={onSelectDestination}
        unitViewModels={unitViewModels}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-8 py-8">
          {selectedDestination === null ? (
            <RecipePanel
              sessionId={sessionId}
              isActive={isActive}
              dishId={dishId}
              dishTitle={dishTitle}
              dishKind={dishKind}
              versionLabel={versionLabel}
              statusLabel={statusLabel}
              hasReview={hasReview}
              aggregateProgress={aggregateProgress}
              completedUnitsCount={completedUnitsCount}
              totalUnitsCount={totalUnitsCount}
              cookingNotes={cookingNotes}
              onRequestEnd={onRequestEnd}
              onOpenSessionScale={onOpenSessionScale}
              planActiveUnits={planActiveUnits}
              planRemovedUnits={planRemovedUnits}
              addableUnits={addableUnits}
              onUnitRemoved={onUnitRemoved}
              unitViewModels={unitViewModels}
              onSelectDestination={onSelectDestination}
            />
          ) : selectedUnit ? (
            <SectionPanel
              sessionId={sessionId}
              unit={selectedUnit}
              isActive={isActive}
              isChecked={isChecked}
              onToggleItem={onToggleItem}
              onMarkAllPrepared={() => onMarkAllPrepared(selectedUnit)}
              onResetAll={() => onResetAll(selectedUnit)}
              collapsed={collapsedIngredientUnits.has(selectedUnit.id)}
              onToggleIngredientsCollapsed={() =>
                onToggleIngredientsCollapsed(selectedUnit.id)
              }
              onMarkAllInstructions={() => onMarkAllInstructions(selectedUnit)}
              onResetInstructions={() => onResetInstructions(selectedUnit)}
              instructionsCollapsed={collapsedInstructionUnits.has(
                selectedUnit.id,
              )}
              onToggleInstructionsCollapsed={() =>
                onToggleInstructionsCollapsed(selectedUnit.id)
              }
              onOpenUnitScale={() => onOpenUnitScale(selectedUnit)}
              addTimerActive={addTimerUnitId === selectedUnit.id}
              onRequestAddTimer={() => onRequestAddTimer(selectedUnit.id)}
              onCancelAddTimer={onCancelAddTimer}
              onTimerCreated={onTimerCreated}
              onSetUnitCompletion={onSetUnitCompletion}
              isPending={isPending}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No active units in this session.
            </p>
          )}
        </div>
      </main>

      <TimerRail
        timers={railTimers}
        isActive={isActive}
        liveTimers={liveTimers}
        timerActions={timerActions}
      />
    </div>
  );
}

function NavRail({
  dishTitle,
  selectedDestination,
  onSelectDestination,
  unitViewModels,
}: {
  dishTitle: string;
  selectedDestination: string | null;
  onSelectDestination: (destination: string | null) => void;
  unitViewModels: UnitViewModel[];
}) {
  return (
    <nav
      aria-label="Cooking navigation"
      className="border-border bg-card flex h-full w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3"
    >
      <button
        type="button"
        onClick={() => onSelectDestination(null)}
        aria-current={selectedDestination === null}
        className={`cursor-pointer truncate rounded-lg px-3 py-2 text-left text-sm font-semibold ${
          selectedDestination === null
            ? "bg-primary/10 text-primary"
            : "text-foreground hover:bg-muted"
        }`}
      >
        {dishTitle}
      </button>
      <div className="border-border my-1 border-t" />
      <ul className="flex flex-col gap-1">
        {unitViewModels.map(({ unit, instructionProgress, timerChips }) => {
          const isSelected = unit.id === selectedDestination;
          return (
            <li key={unit.id}>
              <button
                type="button"
                onClick={() => onSelectDestination(unit.id)}
                aria-current={isSelected}
                className={`flex w-full cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted border-transparent"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-foreground truncate text-sm font-medium">
                    {unit.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {unit.completedAt ? (
                      <Check
                        className="text-brand-green-text size-3.5"
                        aria-hidden="true"
                      />
                    ) : instructionProgress.total > 0 ? (
                      `${instructionProgress.checked}/${instructionProgress.total}`
                    ) : (
                      "—"
                    )}
                  </span>
                </span>
                {timerChips.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {timerChips.map((chip) => (
                      <span
                        key={chip.id}
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                          chip.isExpired
                            ? "border-brand-orange bg-brand-orange/10 text-brand-orange-text animate-pulse"
                            : chip.state === "RUNNING"
                              ? "border-brand-orange/50 text-brand-orange-text"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        {chip.isExpired
                          ? "Time's up"
                          : formatCountdown(chip.remainingSeconds)}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function RecipePanel({
  sessionId,
  isActive,
  dishId,
  dishTitle,
  dishKind,
  versionLabel,
  statusLabel,
  hasReview,
  aggregateProgress,
  completedUnitsCount,
  totalUnitsCount,
  cookingNotes,
  onRequestEnd,
  onOpenSessionScale,
  planActiveUnits,
  planRemovedUnits,
  addableUnits,
  onUnitRemoved,
  unitViewModels,
  onSelectDestination,
}: {
  sessionId: string;
  isActive: boolean;
  dishId: string;
  dishTitle: string;
  dishKind: DishKindValue | null;
  versionLabel: string;
  statusLabel: string;
  hasReview: boolean;
  aggregateProgress: { checked: number; total: number };
  completedUnitsCount: number;
  totalUnitsCount: number;
  cookingNotes: string | null;
  onRequestEnd: () => void;
  onOpenSessionScale: () => void;
  planActiveUnits: PlanUnit[];
  planRemovedUnits: PlanUnit[];
  addableUnits: AddableUnit[];
  onUnitRemoved: (unitId: string) => void;
  unitViewModels: UnitViewModel[];
  onSelectDestination: (destination: string | null) => void;
}) {
  return (
    <>
      {!isActive && (
        <div className="flex items-start justify-end gap-2">
          <div className="flex shrink-0 items-center gap-3">
            <Link
              href={`/cook/${sessionId}/review`}
              className="text-primary text-sm hover:underline"
            >
              {hasReview ? "Edit Review" : "Add Review"}
            </Link>
            <Link
              href={dishKind ? `${dishBasePath(dishKind)}/${dishId}` : "/cook"}
              className="text-primary text-sm hover:underline"
            >
              View source
            </Link>
          </div>
        </div>
      )}

      <div>
        <h1 className="font-heading text-foreground text-2xl font-semibold text-balance">
          {dishTitle}
        </h1>
        <p className="text-muted-foreground text-sm">
          {versionLabel}
          {statusLabel}
        </p>
      </div>

      {totalUnitsCount > 0 && (
        <div className="flex items-center gap-2">
          <div className="bg-muted-foreground h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-brand-green h-full rounded-full transition-[width]"
              style={{
                width: `${
                  aggregateProgress.total > 0
                    ? (aggregateProgress.checked / aggregateProgress.total) *
                      100
                    : (completedUnitsCount / totalUnitsCount) * 100
                }%`,
              }}
            />
          </div>
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {completedUnitsCount}/{totalUnitsCount} Sections done
          </span>
        </div>
      )}

      {isActive && (
        <CoachMark guideKey="cooking-session" title="Cooking Sessions">
          This is a Cooking Session — check items off as you go, run timers, and
          adjust scale live. When you finish, you can leave a Session Review so
          DishFrame remembers what worked.
        </CoachMark>
      )}

      {isActive && (
        <div className="flex flex-wrap items-center gap-2">
          <CookingPlanManager
            sessionId={sessionId}
            dishTitle={dishTitle}
            activeUnits={planActiveUnits}
            removedUnits={planRemovedUnits}
            addableUnits={addableUnits}
            onUnitRemoved={onUnitRemoved}
          />
          <Button variant="outline" size="sm" onClick={onOpenSessionScale}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Scale session
          </Button>
          <Button size="sm" onClick={onRequestEnd}>
            <CircleStop className="size-4" aria-hidden="true" />
            End Cooking
          </Button>
        </div>
      )}

      <CookingNotesField sessionId={sessionId} initialNotes={cookingNotes} />

      {unitViewModels.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg font-medium">Sections</h2>
          <ul className="flex flex-col gap-2">
            {unitViewModels.map(({ unit, instructionProgress }) => (
              <li key={unit.id}>
                <button
                  type="button"
                  onClick={() => onSelectDestination(unit.id)}
                  className="border-border bg-card hover:bg-muted flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
                >
                  <span className="text-foreground truncate text-sm font-medium">
                    {unit.label}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {unit.completedAt ? (
                      <Check
                        className="text-brand-green-text size-3.5"
                        aria-hidden="true"
                      />
                    ) : instructionProgress.total > 0 ? (
                      `${instructionProgress.checked}/${instructionProgress.total}`
                    ) : (
                      "—"
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function SectionPanel({
  sessionId,
  unit,
  isActive,
  isChecked,
  onToggleItem,
  onMarkAllPrepared,
  onResetAll,
  collapsed,
  onToggleIngredientsCollapsed,
  onMarkAllInstructions,
  onResetInstructions,
  instructionsCollapsed,
  onToggleInstructionsCollapsed,
  onOpenUnitScale,
  addTimerActive,
  onRequestAddTimer,
  onCancelAddTimer,
  onTimerCreated,
  onSetUnitCompletion,
  isPending,
}: {
  sessionId: string;
  unit: CookingModeUnit;
  isActive: boolean;
  isChecked: (item: CookingModeChecklistItem) => boolean;
  onToggleItem: (itemId: string, checked: boolean) => void;
  onMarkAllPrepared: () => void;
  onResetAll: () => void;
  collapsed: boolean;
  onToggleIngredientsCollapsed: () => void;
  onMarkAllInstructions: () => void;
  onResetInstructions: () => void;
  instructionsCollapsed: boolean;
  onToggleInstructionsCollapsed: () => void;
  onOpenUnitScale: () => void;
  addTimerActive: boolean;
  onRequestAddTimer: () => void;
  onCancelAddTimer: () => void;
  onTimerCreated: () => void;
  onSetUnitCompletion: (unitId: string, completed: boolean) => void;
  isPending: boolean;
}) {
  const ingredientItems = unit.checklistItems.filter(
    (i) => i.kind === "INGREDIENT",
  );
  const instructionItems = unit.checklistItems.filter(
    (i) => i.kind === "INSTRUCTION",
  );

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
          {unit.label}
        </h1>
        {isActive && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onOpenUnitScale}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Scale
            </Button>
            <Button
              size="sm"
              onClick={onRequestAddTimer}
              disabled={addTimerActive}
            >
              <TimerIcon className="size-4" aria-hidden="true" />
              Start timer
            </Button>
          </div>
        )}
      </div>

      {isActive && addTimerActive && (
        <AddTimerForm
          sessionId={sessionId}
          unitId={unit.id}
          onDone={onTimerCreated}
          onCancel={onCancelAddTimer}
        />
      )}

      <IngredientsSection
        items={ingredientItems}
        isChecked={isChecked}
        onToggle={onToggleItem}
        onMarkAllPrepared={onMarkAllPrepared}
        onResetAll={onResetAll}
        isActive={isActive}
        collapsed={collapsed}
        onToggleCollapsed={onToggleIngredientsCollapsed}
      />
      <InstructionsSection
        items={instructionItems}
        isChecked={isChecked}
        onToggle={onToggleItem}
        onMarkAllPrepared={onMarkAllInstructions}
        onResetAll={onResetInstructions}
        isActive={isActive}
        collapsed={instructionsCollapsed}
        onToggleCollapsed={onToggleInstructionsCollapsed}
      />

      {isActive && (
        <div className="pt-2">
          {unit.completedAt ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onSetUnitCompletion(unit.id, false)}
              disabled={isPending}
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Reopen this Section
            </Button>
          ) : (
            <Button
              className="bg-success hover:bg-success/90 text-success-foreground w-full"
              onClick={() => onSetUnitCompletion(unit.id, true)}
              disabled={isPending}
            >
              <CircleCheck className="size-4" aria-hidden="true" />
              Mark {unit.label} complete
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function TimerRail({
  timers,
  isActive,
  liveTimers,
  timerActions,
}: {
  timers: RailTimer[];
  isActive: boolean;
  liveTimers: Map<string, LiveTimerState>;
  timerActions: TimerActions;
}) {
  return (
    <aside
      aria-label="Active timers"
      className="border-border bg-card flex h-full w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l p-3"
    >
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Timers
      </h2>
      {timers.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No active timers. Start one from a Section.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {timers.map(({ timer, sectionLabel }) => {
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
                onAdjust={(delta) =>
                  timerActions.adjust(timer, delta, remaining)
                }
                onReset={() => timerActions.reset(timer)}
                onDismiss={() => timerActions.dismiss(timer)}
              />
            );
          })}
        </ul>
      )}
    </aside>
  );
}
