import * as React from "react";
import { ChevronDown, ChevronUp, Plus, Timer as TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatCountdown } from "@/lib/cooking/timer-math";
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
    onRequestAddTimer,
  } = props;
  const [navOpen, setNavOpen] = React.useState(false);

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

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-border bg-background/95 sticky top-0 z-20 border-b backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="font-heading text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
            {currentName}
          </p>
          {totalUnitsCount > 0 && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {completedUnitsCount}/{totalUnitsCount}
            </span>
          )}
        </div>

        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            className="border-border text-foreground flex w-full items-center justify-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
          >
            Recipe contents
            {navOpen ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {navOpen && (
          <nav
            aria-label="Cooking navigation"
            className="border-border max-h-[60vh] overflow-y-auto border-t p-3"
          >
            <NavList
              dishTitle={dishTitle}
              selectedDestination={selectedDestination}
              onSelectDestination={handleSelect}
              unitViewModels={unitViewModels}
            />
          </nav>
        )}
      </div>

      {navOpen && (
        <button
          type="button"
          aria-label="Close recipe navigation"
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-10 bg-black/10"
        />
      )}

      <main className="flex-1 px-4 pt-4 pb-32">
        <div className="flex flex-col gap-6">
          {selectedDestination === null ? (
            <RecipePanel {...props} />
          ) : selectedUnit ? (
            <SectionPanel
              sessionId={props.sessionId}
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
              addTimerActive={props.addTimerUnitId === selectedUnit.id}
              onRequestAddTimer={() => props.onRequestAddTimer(selectedUnit.id)}
              onCancelAddTimer={props.onCancelAddTimer}
              onTimerCreated={props.onTimerCreated}
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

      <Sheet>
        <div
          className={`border-border bg-background fixed inset-x-0 bottom-0 z-20 border-t ${
            hasExpiredTimer ? "bg-brand-orange/10" : ""
          }`}
        >
          <div className="relative flex items-start">
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Timers"
                className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 py-3 pr-28 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5">
                    <TimerIcon
                      className={`size-4 shrink-0 ${hasExpiredTimer ? "text-brand-orange-text" : "text-muted-foreground"}`}
                      aria-hidden="true"
                    />
                    <span className="text-foreground text-sm font-medium">
                      Timers
                    </span>
                  </span>
                  <ChevronUp
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden="true"
                  />
                </span>
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
                                  live?.remainingSeconds ??
                                    timer.durationSeconds,
                                )}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )}
              </button>
            </SheetTrigger>

            <Button
              type="button"
              size="sm"
              className="absolute right-4 bottom-3"
              disabled={!selectedUnit}
              title={
                selectedUnit
                  ? undefined
                  : "Select a Section first to start a timer for it."
              }
              onClick={() => selectedUnit && onRequestAddTimer(selectedUnit.id)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              Start timer
            </Button>
          </div>
        </div>
        <SheetContent side="bottom" className="max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Timers</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
            <TimerList
              timers={railTimers}
              isActive={isActive}
              liveTimers={liveTimers}
              timerActions={timerActions}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
