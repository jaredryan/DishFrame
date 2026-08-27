import * as React from "react";
import { StartTimerDialog } from "@/components/domain/cooking/start-timer-dialog";
import {
  NavHeader,
  NavSectionList,
  TimersTray,
  RecipePanel,
  ConnectedSectionPanel,
  type CookingLayoutProps,
} from "@/components/domain/cooking/cooking-mode-desktop-layout";

/** Portrait-tablet range (`md:` up to `lg:`, ~768–1023px): a left rail (Section nav + docked timers) plus main content. */
export function TabletCookingLayout(props: CookingLayoutProps) {
  const {
    sessionId,
    dishTitle,
    selectedDestination,
    onSelectDestination,
    unitViewModels,
    railTimers,
    isActive,
    liveTimers,
    timerActions,
    onTimerCreated,
  } = props;
  const [timersExpanded, setTimersExpanded] = React.useState(false);
  const [timerModalOpen, setTimerModalOpen] = React.useState(false);

  const selectedUnit = selectedDestination
    ? (unitViewModels.find((vm) => vm.unit.id === selectedDestination)?.unit ??
      null)
    : null;

  const hasExpiredTimer = railTimers.some(
    ({ timer }) => liveTimers.get(timer.id)?.isExpired,
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <div className="border-border bg-card flex h-full w-64 shrink-0 flex-col border-r">
        <div className="shrink-0 p-3 pb-0">
          <NavHeader
            dishTitle={dishTitle}
            selectedDestination={selectedDestination}
            onSelectDestination={onSelectDestination}
          />
        </div>
        <nav
          aria-label="Cooking navigation"
          className="min-h-0 flex-1 overflow-y-auto p-3"
        >
          <NavSectionList
            selectedDestination={selectedDestination}
            onSelectDestination={onSelectDestination}
            unitViewModels={unitViewModels}
          />
        </nav>

        <div
          className={`border-border shrink-0 border-t ${
            hasExpiredTimer ? "bg-brand-orange/10" : ""
          }`}
        >
          <TimersTray
            railTimers={railTimers}
            isActive={isActive}
            liveTimers={liveTimers}
            timerActions={timerActions}
            expanded={timersExpanded}
            onToggleExpanded={() => setTimersExpanded((v) => !v)}
            onStartTimer={() => setTimerModalOpen(true)}
          />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-8">
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
