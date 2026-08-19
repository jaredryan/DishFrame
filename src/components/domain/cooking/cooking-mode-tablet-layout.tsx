import * as React from "react";
import { ChevronDown, ChevronUp, Timer as TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/cooking/timer-math";
import {
  NavList,
  TimerList,
  RecipePanel,
  SectionPanel,
  type CookingLayoutProps,
} from "@/components/domain/cooking/cooking-mode-desktop-layout";

/** Portrait-tablet range (`md:` up to `lg:`, ~768–1023px): a left rail (Section nav + docked timers) plus main content. */
export function TabletCookingLayout(props: CookingLayoutProps) {
  const {
    dishTitle,
    selectedDestination,
    onSelectDestination,
    unitViewModels,
    railTimers,
    isActive,
    liveTimers,
    timerActions,
  } = props;
  const [timersExpanded, setTimersExpanded] = React.useState(false);

  const selectedUnit = selectedDestination
    ? (unitViewModels.find((vm) => vm.unit.id === selectedDestination)?.unit ??
      null)
    : null;

  const hasExpiredTimer = railTimers.some(
    ({ timer }) => liveTimers.get(timer.id)?.isExpired,
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <div className="border-border bg-card relative flex h-full w-64 shrink-0 flex-col border-r">
        <nav
          aria-label="Cooking navigation"
          className="flex flex-1 flex-col gap-1 overflow-y-auto p-3"
        >
          <NavList
            dishTitle={dishTitle}
            selectedDestination={selectedDestination}
            onSelectDestination={onSelectDestination}
            unitViewModels={unitViewModels}
          />
        </nav>

        {timersExpanded && (
          <div className="border-border bg-card absolute bottom-full left-0 z-20 flex max-h-[60vh] w-full flex-col gap-2 overflow-y-auto border-t p-3 shadow-lg">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Timers
              </h2>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTimersExpanded(false)}
                aria-label="Collapse timers"
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <TimerList
              timers={railTimers}
              isActive={isActive}
              liveTimers={liveTimers}
              timerActions={timerActions}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setTimersExpanded((v) => !v)}
          aria-expanded={timersExpanded}
          className={`border-border flex shrink-0 flex-col gap-1.5 border-t p-3 text-left ${
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
            {timersExpanded ? (
              <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronUp className="size-4 shrink-0" aria-hidden="true" />
            )}
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
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
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
    </div>
  );
}
