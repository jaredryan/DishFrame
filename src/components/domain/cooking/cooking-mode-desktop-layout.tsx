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

/** Shared props for all three responsive Cooking Mode layouts (desktop/tablet/mobile). */
export type CookingLayoutProps = {
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
};

/** ARCHITECTURE_PROPOSAL.md §C.8 — the three-zone desktop workspace (`lg:` and up); `TabletCookingLayout`/`MobileCookingLayout` reuse this file's `NavList`/`TimerList`/`RecipePanel`/`SectionPanel` exports for narrower ranges. */
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
}: CookingLayoutProps) {
  const selectedUnit = selectedDestination
    ? (unitViewModels.find((vm) => vm.unit.id === selectedDestination)?.unit ??
      null)
    : null;

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <NavRail
        dishTitle={dishTitle}
        selectedDestination={selectedDestination}
        onSelectDestination={onSelectDestination}
        unitViewModels={unitViewModels}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8 xl:px-8">
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
      className="border-border bg-card flex h-full w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r p-3 xl:w-60"
    >
      <NavList
        dishTitle={dishTitle}
        selectedDestination={selectedDestination}
        onSelectDestination={onSelectDestination}
        unitViewModels={unitViewModels}
      />
    </nav>
  );
}

/** The Recipe destination button + Section list, without a `<nav>` wrapper — each layout supplies its own. */
export function NavList({
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
    <>
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
    </>
  );
}

export function RecipePanel({
  sessionId,
  isActive,
  dishId,
  dishTitle,
  dishKind,
  versionLabel,
  statusLabel,
  hasReview,
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
          {totalUnitsCount > 0 &&
            ` · ${completedUnitsCount}/${totalUnitsCount} done`}
        </p>
      </div>

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
            End cooking
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

export function SectionPanel({
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="font-heading text-foreground min-w-0 text-2xl font-semibold text-balance">
          {unit.label}
        </h1>
        {isActive && (
          <div className="flex items-center justify-between gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            <Button
              size="sm"
              onClick={onRequestAddTimer}
              disabled={addTimerActive}
            >
              <TimerIcon className="size-4" aria-hidden="true" />
              Start timer
            </Button>
            <Button variant="outline" size="sm" onClick={onOpenUnitScale}>
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Scale
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
      className="border-border bg-card flex h-full w-60 shrink-0 flex-col gap-2 overflow-y-auto border-l p-3 xl:w-72"
    >
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Timers
      </h2>
      <TimerList
        timers={timers}
        isActive={isActive}
        liveTimers={liveTimers}
        timerActions={timerActions}
      />
    </aside>
  );
}

/** The bare list of `TimerRow`s (with an empty-state message), without aside/heading chrome — reused across all three layouts. */
export function TimerList({
  timers,
  isActive,
  liveTimers,
  timerActions,
  emptyMessage = "No active timers. Start one from a Section.",
}: {
  timers: RailTimer[];
  isActive: boolean;
  liveTimers: Map<string, LiveTimerState>;
  timerActions: TimerActions;
  emptyMessage?: string;
}) {
  if (timers.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }
  return (
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
            onAdjust={(delta) => timerActions.adjust(timer, delta, remaining)}
            onReset={() => timerActions.reset(timer)}
            onDismiss={() => timerActions.dismiss(timer)}
          />
        );
      })}
    </ul>
  );
}
