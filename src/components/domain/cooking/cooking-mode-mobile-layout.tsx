import * as React from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Plus,
  Timer as TimerIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/cooking/timer-math";
import { StartTimerDialog } from "@/components/domain/cooking/start-timer-dialog";
import {
  NavList,
  TimerList,
  RecipePanel,
  SectionPanel,
  type CookingLayoutProps,
} from "@/components/domain/cooking/cooking-mode-desktop-layout";

/** Narrow/mobile range (below `md:`, <768px): full-width content, an expandable "Recipe contents" navigator, and a persistent bottom timer tray. */
export function MobileCookingLayout(props: CookingLayoutProps) {
  const {
    sessionId,
    dishTitle,
    selectedDestination,
    onSelectDestination,
    unitViewModels,
    completedUnitsCount,
    totalUnitsCount,
    railTimers,
    isActive,
    liveTimers,
    timerActions,
    onTimerCreated,
  } = props;
  const [navOpen, setNavOpen] = React.useState(false);
  const [timersOpen, setTimersOpen] = React.useState(false);
  const [timerModalOpen, setTimerModalOpen] = React.useState(false);

  const selectedUnit = selectedDestination
    ? (unitViewModels.find((vm) => vm.unit.id === selectedDestination)?.unit ??
      null)
    : null;

  function handleSelect(destination: string | null) {
    onSelectDestination(destination);
    setNavOpen(false);
  }

  const hasExpiredTimer = railTimers.some(
    ({ timer }) => liveTimers.get(timer.id)?.isExpired,
  );

  const currentName = selectedUnit ? selectedUnit.label : dishTitle;

  function openTimerModal() {
    setTimerModalOpen(true);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-border bg-background/95 sticky top-0 z-20 border-b backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
          className="flex w-full items-center justify-between gap-2 px-4 pt-3 pb-2 text-left"
        >
          <p className="font-heading text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
            {currentName}
          </p>
          {totalUnitsCount > 0 && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {completedUnitsCount}/{totalUnitsCount}
            </span>
          )}
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-out ${
            navOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <nav
              aria-label="Cooking navigation"
              className="max-h-[55vh] overflow-y-auto px-3 pb-2"
            >
              <NavList
                dishTitle={dishTitle}
                selectedDestination={selectedDestination}
                onSelectDestination={handleSelect}
                unitViewModels={unitViewModels}
              />
            </nav>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setNavOpen((v) => !v)}
          aria-expanded={navOpen}
          className="border-border flex w-full items-center gap-1.5 border-t px-4 py-2.5 text-left"
        >
          <BookOpen
            className="text-muted-foreground size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-foreground text-sm font-medium">
            Recipe contents
          </span>
          {navOpen ? (
            <ChevronUp
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <ChevronDown
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          )}
        </button>
      </div>

      <main className="bg-card flex-1 px-4 pt-4 pb-32">
        <div className="flex flex-col gap-6">
          {selectedDestination === null ? (
            <RecipePanel {...props} />
          ) : selectedUnit ? (
            <SectionPanel
              unit={selectedUnit}
              isActive={props.isActive}
              isChecked={props.isChecked}
              onToggleItem={props.onToggleItem}
              onMarkAllPrepared={() => props.onMarkAllPrepared(selectedUnit)}
              onResetAll={() => props.onResetAll(selectedUnit)}
              collapsed={props.collapsedIngredientUnits.has(selectedUnit.id)}
              onToggleIngredientsCollapsed={() =>
                props.onToggleIngredientsCollapsed(selectedUnit.id)
              }
              onMarkAllInstructions={() =>
                props.onMarkAllInstructions(selectedUnit)
              }
              onResetInstructions={() =>
                props.onResetInstructions(selectedUnit)
              }
              instructionsCollapsed={props.collapsedInstructionUnits.has(
                selectedUnit.id,
              )}
              onToggleInstructionsCollapsed={() =>
                props.onToggleInstructionsCollapsed(selectedUnit.id)
              }
              onOpenUnitScale={() => props.onOpenUnitScale(selectedUnit)}
              onSetUnitCompletion={props.onSetUnitCompletion}
              isPending={props.isPending}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              No active units in this session.
            </p>
          )}
        </div>
      </main>

      <div
        className={`border-border bg-background fixed inset-x-0 bottom-0 z-20 border-t ${
          hasExpiredTimer ? "bg-brand-orange/10" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <button
            type="button"
            onClick={() => setTimersOpen((v) => !v)}
            aria-expanded={timersOpen}
            className="flex min-w-0 items-center gap-1.5 text-left"
          >
            <TimerIcon
              className={`size-4 shrink-0 ${hasExpiredTimer ? "text-brand-orange-text" : "text-muted-foreground"}`}
              aria-hidden="true"
            />
            <span className="text-foreground text-sm font-medium">Timers</span>
            {timersOpen ? (
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
            <Button type="button" size="sm" onClick={openTimerModal}>
              <Plus className="size-3.5" aria-hidden="true" />
              Start timer
            </Button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setTimersOpen((v) => !v)}
          aria-expanded={timersOpen}
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
            timersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          }`}
        >
          <div className="overflow-hidden">
            <div className="border-border max-h-[50vh] overflow-y-auto border-t px-4 py-3">
              <TimerList
                timers={railTimers}
                isActive={isActive}
                liveTimers={liveTimers}
                timerActions={timerActions}
              />
            </div>
          </div>
        </div>
      </div>

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
