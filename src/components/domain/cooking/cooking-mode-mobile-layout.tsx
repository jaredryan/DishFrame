import * as React from "react";
import { ChevronDown, ChevronUp, Timer as TimerIcon } from "lucide-react";
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

/** Narrow/mobile range (below `md:`, <768px): full-width content, an expandable "On this recipe" navigator, and a persistent bottom timer tray. */
export function MobileCookingLayout(props: CookingLayoutProps) {
  const {
    dishTitle,
    statusLabel,
    selectedDestination,
    onSelectDestination,
    unitViewModels,
    aggregateProgress,
    completedUnitsCount,
    totalUnitsCount,
    railTimers,
    isActive,
    liveTimers,
    timerActions,
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

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-border bg-background/95 sticky top-0 z-20 border-b backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-foreground truncate text-sm font-semibold">
              {dishTitle}
            </p>
            <p className="text-muted-foreground text-xs">{statusLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            className="border-border text-foreground flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
          >
            On this recipe
            {navOpen ? (
              <ChevronUp className="size-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {totalUnitsCount > 0 && (
          <div className="flex items-center gap-2 px-4 pb-3">
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
              {completedUnitsCount}/{totalUnitsCount} done
            </span>
          </div>
        )}

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
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Timers"
            className={`border-border bg-background fixed inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 border-t px-4 py-3 text-left ${
              hasExpiredTimer ? "bg-brand-orange/10" : ""
            }`}
          >
            <span className="flex items-center justify-between gap-2">
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
                {railTimers.map(({ timer }) => {
                  const live = liveTimers.get(timer.id);
                  const expired = live?.isExpired ?? false;
                  return (
                    <span
                      key={timer.id}
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                        expired
                          ? "border-brand-orange bg-brand-orange/10 text-brand-orange-text animate-pulse"
                          : timer.state === "RUNNING"
                            ? "border-brand-orange/50 text-brand-orange-text"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {expired
                        ? "Time's up"
                        : formatCountdown(
                            live?.remainingSeconds ?? timer.durationSeconds,
                          )}
                    </span>
                  );
                })}
              </span>
            )}
          </button>
        </SheetTrigger>
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
