import * as React from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { StartTimerDialog } from "@/components/domain/cooking/start-timer-dialog";
import {
  NavList,
  TimersTray,
  RecipePanel,
  ConnectedSectionPanel,
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
              className="max-h-[70vh] overflow-y-auto px-3 pb-2"
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
            <ConnectedSectionPanel
              unit={selectedUnit}
              isActive={props.isActive}
              isChecked={props.isChecked}
              onToggleItem={props.onToggleItem}
              onMarkAllPrepared={props.onMarkAllPrepared}
              onResetAll={props.onResetAll}
              collapsedIngredientUnits={props.collapsedIngredientUnits}
              onToggleIngredientsCollapsed={props.onToggleIngredientsCollapsed}
              onMarkAllInstructions={props.onMarkAllInstructions}
              onResetInstructions={props.onResetInstructions}
              collapsedInstructionUnits={props.collapsedInstructionUnits}
              onToggleInstructionsCollapsed={
                props.onToggleInstructionsCollapsed
              }
              onOpenUnitScale={props.onOpenUnitScale}
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
        <TimersTray
          railTimers={railTimers}
          isActive={isActive}
          liveTimers={liveTimers}
          timerActions={timerActions}
          expanded={timersOpen}
          onToggleExpanded={() => setTimersOpen((v) => !v)}
          onStartTimer={() => setTimerModalOpen(true)}
        />
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
