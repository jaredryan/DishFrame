"use client";

import * as React from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DragHandle } from "@/components/ui/drag-handle";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { formatDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";
import { CLICKABLE_ROW_CLASS } from "@/components/ui/clickable-row";

/**
 * Shared Schedule "day card" rendering (Meal Plan QA redesign §4/§5/§10) —
 * Create, Edit, and Meal Plan Details all group the same underlying
 * scheduled-meal data by calendar date and render it the same way; only the
 * available row/card-level actions differ (`mode`), so this one component
 * carries the shared visual/interaction shape instead of three divergent
 * implementations.
 */

export function formatServings(servings: number): string {
  return `${servings} serving${servings === 1 ? "" : "s"}`;
}

/** Groups `items` by their own `dateIso`, sorted earliest date → latest,
 * preserving each date's existing item order (already the user-defined —
 * or, for a fresh read, sortOrder-derived — order). */
export function groupScheduleByDate<T extends { dateIso: string }>(
  items: T[],
): { dateIso: string; items: T[] }[] {
  const byDate = new Map<string, T[]>();
  for (const item of items) {
    const list = byDate.get(item.dateIso);
    if (list) list.push(item);
    else byDate.set(item.dateIso, [item]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, dateItems]) => ({ dateIso, items: dateItems }));
}

export type ScheduleDisplayItem = {
  id: string;
  label: string;
  mealTitle: string;
  servings: number;
};

const DAY_CARD_HEADER_ACTION_CLASS =
  "text-primary hover:bg-primary/10 h-auto gap-1 rounded-md bg-transparent px-1.5 py-1 text-xs font-medium pointer-coarse:min-h-11 pointer-coarse:px-2.5";

function DayCardShell({
  dateIso,
  headerAction,
  children,
}: {
  dateIso: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="border-border bg-card flex flex-col gap-2.5 rounded-xl border p-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-foreground text-sm font-semibold">
          {formatDateOnly(dateIso, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </h3>
        {headerAction}
      </div>
      {children}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Edit mode (Create/Edit) — draggable, Edit/Delete per row, day-level +Add
// meal, row click → Edit.
// ---------------------------------------------------------------------------

function SortableScheduleRow({
  item,
  index,
  total,
  onEdit,
  onDelete,
}: {
  item: ScheduleDisplayItem;
  index: number;
  total: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${item.label}, position ${index + 1} of ${total}`}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        "border-border bg-background/60 flex items-center gap-1.5 rounded-lg border p-2",
        CLICKABLE_ROW_CLASS,
        "cursor-pointer",
        isDragging && "z-10 shadow-md",
      )}
    >
      <DragHandle
        label={`Drag to reorder ${item.label}`}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">
          {item.label}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {item.mealTitle} · {formatServings(item.servings)}
        </p>
      </div>
      <div
        className="flex shrink-0 items-center gap-0.5"
        onClick={(event) => event.stopPropagation()}
      >
        <TooltipIconButton
          label={`Edit ${item.label}`}
          icon={Pencil}
          onClick={onEdit}
        />
        <TooltipIconButton
          label={`Delete ${item.label}`}
          icon={Trash2}
          onClick={onDelete}
          className="text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
        />
      </div>
    </li>
  );
}

export function EditableScheduleDayCard({
  dateIso,
  items,
  onAddMealAction,
  onEditItemAction,
  onDeleteItemAction,
  onReorderAction,
}: {
  dateIso: string;
  items: ScheduleDisplayItem[];
  onAddMealAction: () => void;
  onEditItemAction: (id: string) => void;
  onDeleteItemAction: (id: string) => void;
  onReorderAction: (orderedIds: string[]) => void;
}) {
  const sensors = useReorderSensors();
  const itemLabel = React.useCallback(
    (id: string) => items.find((i) => i.id === id)?.label ?? "meal",
    [items],
  );
  const itemPosition = React.useCallback(
    (id: string) => ({
      index: items.findIndex((i) => i.id === id),
      total: items.length,
    }),
    [items],
  );
  const announcements = React.useMemo(
    () => createReorderAnnouncements(itemLabel, itemPosition),
    [itemLabel, itemPosition],
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderAction(arrayMove(items, oldIndex, newIndex).map((i) => i.id));
  }

  return (
    <DayCardShell
      dateIso={dateIso}
      headerAction={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={DAY_CARD_HEADER_ACTION_CLASS}
          onClick={onAddMealAction}
        >
          <Plus className="size-3.5" aria-hidden="true" /> Add meal
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing scheduled yet.</p>
      ) : (
        <DndContext
          id={`schedule-day-${dateIso}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex flex-col gap-1.5">
              {items.map((item, index) => (
                <SortableScheduleRow
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  onEdit={() => onEditItemAction(item.id)}
                  onDelete={() => onDeleteItemAction(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </DayCardShell>
  );
}

// ---------------------------------------------------------------------------
// View mode (Meal Plan Details) — eaten checkboxes, Mark all eaten,
// fully-eaten collapse, no drag/Edit/Delete.
// ---------------------------------------------------------------------------

export type ScheduleViewItem = ScheduleDisplayItem & { eaten: boolean };

function ViewScheduleRow({
  item,
  disabled,
  onToggleEatenAction,
}: {
  item: ScheduleViewItem;
  disabled?: boolean;
  onToggleEatenAction: (eaten: boolean) => void;
}) {
  const label = item.eaten
    ? "This planned meal was eaten"
    : "This planned meal has not been eaten yet";
  return (
    <li
      className={cn(
        "border-border bg-background/60 flex items-center gap-2.5 rounded-lg border p-2",
        item.eaten && "opacity-60",
      )}
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex shrink-0 cursor-pointer items-center justify-center p-1.5 pointer-coarse:p-3.5">
              <Checkbox
                checked={item.eaten}
                disabled={disabled}
                aria-label={label}
                onCheckedChange={(checked) =>
                  onToggleEatenAction(checked === true)
                }
              />
            </label>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate text-sm font-medium">
          {item.label}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {item.mealTitle} · {formatServings(item.servings)}
        </p>
      </div>
    </li>
  );
}

export function ViewScheduleDayCard({
  dateIso,
  items,
  disabled,
  onToggleEatenAction,
  onMarkAllEatenAction,
}: {
  dateIso: string;
  items: ScheduleViewItem[];
  disabled?: boolean;
  onToggleEatenAction: (id: string, eaten: boolean) => void;
  onMarkAllEatenAction: () => void;
}) {
  const allEaten = items.length > 0 && items.every((i) => i.eaten);
  const [manuallyExpanded, setManuallyExpanded] = React.useState(false);
  // A day that becomes incomplete again (an eaten meal unchecked, or a new
  // meal added elsewhere) always returns to the normal expanded
  // presentation — never stays collapsed waiting for a stale "expanded"
  // flag from the last time it was complete. Adjusted during render (not
  // an effect) per https://react.dev/learn/you-might-not-need-an-effect.
  const [prevAllEaten, setPrevAllEaten] = React.useState(allEaten);
  if (allEaten !== prevAllEaten) {
    setPrevAllEaten(allEaten);
    if (!allEaten) setManuallyExpanded(false);
  }
  const expanded = !allEaten || manuallyExpanded;
  const eatenCount = items.filter((i) => i.eaten).length;

  if (!expanded) {
    return (
      <li className="border-border bg-card rounded-xl border p-3.5">
        <button
          type="button"
          onClick={() => setManuallyExpanded(true)}
          className="flex w-full items-center justify-between gap-2 pointer-coarse:min-h-11"
          aria-expanded={false}
        >
          <span className="text-foreground text-sm font-semibold">
            {formatDateOnly(dateIso, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span className="flex items-center gap-1.5">
            <Badge variant="secondary">
              {eatenCount}/{items.length} eaten
            </Badge>
            <ChevronDown
              className="text-muted-foreground size-4"
              aria-hidden="true"
            />
          </span>
        </button>
      </li>
    );
  }

  const markAllEatenButton = !allEaten && items.length > 0 && (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      className={DAY_CARD_HEADER_ACTION_CLASS}
      onClick={onMarkAllEatenAction}
    >
      Mark all eaten
    </Button>
  );

  return (
    <DayCardShell
      dateIso={dateIso}
      headerAction={
        !markAllEatenButton ? null : disabled ? (
          <DisabledActionHint explanation="This meal plan is closed. Reopen it to make changes.">
            {markAllEatenButton}
          </DisabledActionHint>
        ) : (
          markAllEatenButton
        )
      }
    >
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing scheduled.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <ViewScheduleRow
              key={item.id}
              item={item}
              disabled={disabled}
              onToggleEatenAction={(eaten) =>
                onToggleEatenAction(item.id, eaten)
              }
            />
          ))}
        </ul>
      )}
    </DayCardShell>
  );
}
