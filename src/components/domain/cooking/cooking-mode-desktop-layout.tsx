import * as React from "react";
import Link from "next/link";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleStop,
  SlidersHorizontal,
  Timer as TimerIcon,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/cooking/timer-math";
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
import { StartTimerDialog } from "@/components/domain/cooking/start-timer-dialog";
import { TimerRow } from "@/components/domain/cooking/timer-row";
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
  versionImageAssetId: string | null;
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
  onTimerCreated: () => void;
  onSetUnitCompletion: (unitId: string, completed: boolean) => void;
  isPending: boolean;
  railTimers: RailTimer[];
  timerActions: TimerActions;
  liveTimers: Map<string, LiveTimerState>;
};

/** ARCHITECTURE_PROPOSAL.md §C.8 — the three-zone desktop workspace (`lg:` and up); `TabletCookingLayout`/`MobileCookingLayout` reuse this file's `NavList`/`TimerList`/`RecipePanel`/`ConnectedSectionPanel` exports for narrower ranges. */
export function DesktopCookingLayout({
  sessionId,
  isActive,
  dishId,
  dishTitle,
  dishKind,
  versionLabel,
  versionImageAssetId,
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
  onTimerCreated,
  onSetUnitCompletion,
  isPending,
  railTimers,
  timerActions,
  liveTimers,
}: CookingLayoutProps) {
  const [timerModalOpen, setTimerModalOpen] = React.useState(false);
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
              versionImageAssetId={versionImageAssetId}
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
            <ConnectedSectionPanel
              unit={selectedUnit}
              isActive={isActive}
              isChecked={isChecked}
              onToggleItem={onToggleItem}
              onMarkAllPrepared={onMarkAllPrepared}
              onResetAll={onResetAll}
              collapsedIngredientUnits={collapsedIngredientUnits}
              onToggleIngredientsCollapsed={onToggleIngredientsCollapsed}
              onMarkAllInstructions={onMarkAllInstructions}
              onResetInstructions={onResetInstructions}
              collapsedInstructionUnits={collapsedInstructionUnits}
              onToggleInstructionsCollapsed={onToggleInstructionsCollapsed}
              onOpenUnitScale={onOpenUnitScale}
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
        onStartTimer={() => setTimerModalOpen(true)}
      />

      {isActive && (
        <StartTimerDialog
          open={timerModalOpen}
          onOpenChangeAction={setTimerModalOpen}
          sessionId={sessionId}
          unitViewModels={unitViewModels}
          selectedDestination={selectedDestination}
          onCreatedAction={onTimerCreated}
        />
      )}
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
    <div className="border-border bg-card flex h-full w-52 shrink-0 flex-col border-r xl:w-60">
      <div className="shrink-0 p-3 pb-0">
        <NavHeader
          dishTitle={dishTitle}
          selectedDestination={selectedDestination}
          onSelectDestination={onSelectDestination}
        />
      </div>
      <nav
        aria-label="Cooking navigation"
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3"
      >
        <NavSectionList
          selectedDestination={selectedDestination}
          onSelectDestination={onSelectDestination}
          unitViewModels={unitViewModels}
        />
      </nav>
    </div>
  );
}

/** The sticky Recipe identity button — pinned at the top of the nav rail, above the scrollable Section list. */
export function NavHeader({
  dishTitle,
  selectedDestination,
  onSelectDestination,
}: {
  dishTitle: string;
  selectedDestination: string | null;
  onSelectDestination: (destination: string | null) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSelectDestination(null)}
        aria-current={selectedDestination === null}
        className={`cursor-pointer truncate rounded-lg px-3 py-2 text-left text-sm font-semibold ${
          selectedDestination === null
            ? "bg-primary/5 text-primary"
            : "text-foreground hover:bg-muted"
        }`}
      >
        {dishTitle}
      </button>
      <div className="border-border my-1 border-t" />
    </>
  );
}

/** The scrollable Section/Part list, without the Recipe header — pair with `NavHeader` in a sticky-top/scrollable-middle rail. */
export function NavSectionList({
  selectedDestination,
  onSelectDestination,
  unitViewModels,
}: {
  selectedDestination: string | null;
  onSelectDestination: (destination: string | null) => void;
  unitViewModels: UnitViewModel[];
}) {
  return (
    <ul className="flex flex-col gap-1">
      {unitViewModels.map(({ unit, instructionProgress }) => {
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
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The Recipe destination button + Section list, without a `<nav>` wrapper — used where header and list scroll together (e.g. the mobile drawer). Desktop/tablet rails use `NavHeader`/`NavSectionList` separately so only the middle region scrolls. */
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
      <NavHeader
        dishTitle={dishTitle}
        selectedDestination={selectedDestination}
        onSelectDestination={onSelectDestination}
      />
      <NavSectionList
        selectedDestination={selectedDestination}
        onSelectDestination={onSelectDestination}
        unitViewModels={unitViewModels}
      />
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
  versionImageAssetId,
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
  versionImageAssetId: string | null;
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

      {versionImageAssetId && (
        <div className="border-border bg-muted relative aspect-video max-h-72 w-full overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element -- private, authenticated route, not a static/optimizable asset */}
          <img
            src={`/api/images/${versionImageAssetId}`}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
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
  onSetUnitCompletion,
  isPending,
}: {
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
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenUnitScale}
            className="shrink-0"
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Scale
          </Button>
        )}
      </div>

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

/**
 * Adapts `CookingLayoutProps`' unit-taking callbacks (which apply to
 * whichever unit is selected across the whole layout) to `SectionPanel`'s
 * no-arg callbacks bound to one specific `unit` — shared by all three
 * responsive layouts so this wiring exists in one place.
 */
export function ConnectedSectionPanel({
  unit,
  isActive,
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
  onSetUnitCompletion,
  isPending,
}: {
  unit: CookingModeUnit;
} & Pick<
  CookingLayoutProps,
  | "isActive"
  | "isChecked"
  | "onToggleItem"
  | "onMarkAllPrepared"
  | "onResetAll"
  | "collapsedIngredientUnits"
  | "onToggleIngredientsCollapsed"
  | "onMarkAllInstructions"
  | "onResetInstructions"
  | "collapsedInstructionUnits"
  | "onToggleInstructionsCollapsed"
  | "onOpenUnitScale"
  | "onSetUnitCompletion"
  | "isPending"
>) {
  return (
    <SectionPanel
      unit={unit}
      isActive={isActive}
      isChecked={isChecked}
      onToggleItem={onToggleItem}
      onMarkAllPrepared={() => onMarkAllPrepared(unit)}
      onResetAll={() => onResetAll(unit)}
      collapsed={collapsedIngredientUnits.has(unit.id)}
      onToggleIngredientsCollapsed={() => onToggleIngredientsCollapsed(unit.id)}
      onMarkAllInstructions={() => onMarkAllInstructions(unit)}
      onResetInstructions={() => onResetInstructions(unit)}
      instructionsCollapsed={collapsedInstructionUnits.has(unit.id)}
      onToggleInstructionsCollapsed={() =>
        onToggleInstructionsCollapsed(unit.id)
      }
      onOpenUnitScale={() => onOpenUnitScale(unit)}
      onSetUnitCompletion={onSetUnitCompletion}
      isPending={isPending}
    />
  );
}

function TimerRail({
  timers,
  isActive,
  liveTimers,
  timerActions,
  onStartTimer,
}: {
  timers: RailTimer[];
  isActive: boolean;
  liveTimers: Map<string, LiveTimerState>;
  timerActions: TimerActions;
  onStartTimer: () => void;
}) {
  return (
    <aside
      aria-label="Active timers"
      className="border-border bg-card flex h-full w-60 shrink-0 flex-col border-l xl:w-72"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 p-3 pb-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Timers
        </h2>
        {isActive && (
          <Button size="sm" onClick={onStartTimer}>
            <TimerIcon className="size-4" aria-hidden="true" />
            Start timer
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <TimerList
          timers={timers}
          isActive={isActive}
          liveTimers={liveTimers}
          timerActions={timerActions}
        />
      </div>
    </aside>
  );
}

/**
 * The Timers header/trigger row, collapsed chip summary, and expandable
 * (grid-rows-animated, capped ~70vh, internally scrollable) timer list —
 * shared by the tablet (docked in the left rail) and mobile (fixed to the
 * viewport bottom) layouts. Each caller supplies its own outer container
 * for placement; this owns the shared functionality and styling.
 */
export function TimersTray({
  railTimers,
  isActive,
  liveTimers,
  timerActions,
  expanded,
  onToggleExpanded,
  onStartTimer,
}: {
  railTimers: RailTimer[];
  isActive: boolean;
  liveTimers: Map<string, LiveTimerState>;
  timerActions: TimerActions;
  expanded: boolean;
  onToggleExpanded: () => void;
  onStartTimer: () => void;
}) {
  const hasExpiredTimer = railTimers.some(
    ({ timer }) => liveTimers.get(timer.id)?.isExpired,
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 items-center gap-1.5 text-left"
        >
          <TimerIcon
            className={`size-4 shrink-0 ${hasExpiredTimer ? "text-brand-orange-text" : "text-muted-foreground"}`}
            aria-hidden="true"
          />
          <span className="text-foreground text-sm font-medium">Timers</span>
          {expanded ? (
            <ChevronDown
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <ChevronUp
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          )}
        </button>

        {isActive && (
          <Button type="button" size="sm" onClick={onStartTimer}>
            <TimerIcon className="size-4" aria-hidden="true" />
            Start timer
          </Button>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="block w-full px-4 pt-1.5 pb-3 text-left"
      >
        {railTimers.length === 0 ? (
          <span className="text-muted-foreground text-xs">
            No active timers
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {railTimers.map(({ timer, sectionLabel }) => {
              const live = liveTimers.get(timer.id);
              const expired = live?.isExpired ?? false;
              return (
                <span
                  key={timer.id}
                  className={`flex max-w-40 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                    expired
                      ? "border-brand-orange bg-brand-orange/10 text-brand-orange-text animate-pulse"
                      : timer.state === "RUNNING"
                        ? "border-brand-orange/50 text-brand-orange-text"
                        : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="truncate">
                    {sectionLabel} · {timer.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {expired
                      ? "Time's up"
                      : formatCountdown(
                          live?.remainingSeconds ?? timer.durationSeconds,
                        )}
                  </span>
                </span>
              );
            })}
          </span>
        )}
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-border max-h-[70vh] overflow-y-auto border-t px-4 py-3">
            <TimerList
              timers={railTimers}
              isActive={isActive}
              liveTimers={liveTimers}
              timerActions={timerActions}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** The bare list of `TimerRow`s (with an empty-state message), without aside/heading chrome — reused across all three layouts. */
export function TimerList({
  timers,
  isActive,
  liveTimers,
  timerActions,
  emptyMessage = "No active timers. Use Start timer above.",
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
