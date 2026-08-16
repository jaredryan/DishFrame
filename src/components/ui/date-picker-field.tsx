import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseDateOnly, toIsoDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * A self-contained calendar date field (icon-trigger Popover + month grid) —
 * DishFrame has no `<input type="date">` styling control over the native
 * picker icon/cursor, so Meal Plans' Details section (Slice 22) uses this
 * instead. Value/onChange are plain ISO `yyyy-mm-dd` strings, matching every
 * other Meal Plan date field in the app.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateOnly(value);
  const [viewMonth, setViewMonth] = React.useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  function openChange(next: boolean) {
    if (next) {
      setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    }
    setOpen(next);
  }

  const firstWeekday = viewMonth.getDay();
  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
  ).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
    ),
  ];

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn(
            // Matches Input/Textarea/Select's own background treatment
            // (`bg-transparent` + `dark:bg-input/30`, `border-input`) rather
            // than the outline Button variant's opaque `bg-background` and
            // hover fill, so this field reads as an ordinary text input
            // rather than a button sitting beside one.
            "border-input dark:bg-input/30 dark:hover:bg-input/30 w-full justify-start gap-2 bg-transparent font-normal hover:bg-transparent",
            className,
          )}
        >
          <CalendarDays className="size-4" aria-hidden="true" />
          {selected.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 max-w-none p-3 text-sm" align="start">
        <div className="mb-2 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() =>
              setViewMonth(
                (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
              )
            }
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="text-foreground font-medium">
            {viewMonth.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Next month"
            onClick={() =>
              setViewMonth(
                (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
              )
            }
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_LABELS.map((label, i) => (
            <span
              key={i}
              className="text-muted-foreground py-1 text-xs"
              aria-hidden="true"
            >
              {label}
            </span>
          ))}
          {cells.map((date, i) =>
            date ? (
              <Button
                key={i}
                type="button"
                variant={isSameDay(date, selected) ? "default" : "ghost"}
                size="icon-sm"
                className="w-full tabular-nums"
                onClick={() => {
                  onChange(toIsoDateOnly(date));
                  setOpen(false);
                }}
              >
                {date.getDate()}
              </Button>
            ) : (
              <span key={i} aria-hidden="true" />
            ),
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
