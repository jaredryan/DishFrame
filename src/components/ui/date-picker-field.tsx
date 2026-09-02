import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { parseDateOnly, parseTypedDateInput, toIsoDateOnly } from "@/lib/date";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function displayText(value: string): string {
  return parseDateOnly(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * A directly-typeable text field paired with a calendar Popover (Meal Plan
 * QA redesign §1) — DishFrame has no `<input type="date">` styling control
 * over the native picker icon/cursor, so typing and calendar selection are
 * both handled here rather than deferring to the native widget. Value/
 * onChange are plain ISO `yyyy-mm-dd` strings, matching every other date
 * field in the app. Fine-pointer sizing stays compact; `Input`/`Button`
 * already apply their own `pointer-coarse:h-11`/`size-11` touch targets.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  ariaLabel,
  className,
  min,
  max,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  /** Inclusive ISO `yyyy-mm-dd` bounds — a day outside this range renders
   * disabled rather than merely unstyled, so it can't be clicked. */
  min?: string;
  max?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateOnly(value);
  const [viewMonth, setViewMonth] = React.useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const minDate = min ? parseDateOnly(min) : null;
  const maxDate = max ? parseDateOnly(max) : null;

  // A local text buffer, distinct from `value`, so a mid-edit keystroke
  // (e.g. "9/1/202" before the final digit) never gets reformatted out from
  // under the user — only re-synced from an external `value` change, the
  // same convention `QuantityInput` (number-field.tsx) already established.
  const [text, setText] = React.useState(() => displayText(value));
  const skipNextSync = React.useRef(false);

  React.useEffect(() => {
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    setText(displayText(value));
  }, [value]);

  function commitTypedText() {
    const parsed = parseTypedDateInput(text);
    if (parsed) {
      skipNextSync.current = true;
      setText(displayText(parsed));
      if (parsed !== value) onChange(parsed);
    } else {
      // Unrecognizable text — revert to the last valid value rather than
      // silently keeping invalid text in the field.
      setText(displayText(value));
    }
  }

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
    <div className={cn("relative -m-0.5 flex items-center p-0.5", className)}>
      <Input
        id={id}
        aria-label={ariaLabel}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commitTypedText}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitTypedText();
          }
        }}
        className="pr-9"
      />
      <Popover open={open} onOpenChange={openChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${ariaLabel ?? "Choose date"} — open calendar`}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 -translate-y-1/2"
          >
            <CalendarDays className="size-4" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 max-w-none p-3 text-sm" align="end">
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
            {cells.map((date, i) => {
              if (!date) return <span key={i} aria-hidden="true" />;
              const outOfRange =
                (minDate && date < minDate) || (maxDate && date > maxDate);
              return (
                <Button
                  key={i}
                  type="button"
                  variant={isSameDay(date, selected) ? "default" : "ghost"}
                  size="icon-sm"
                  disabled={!!outOfRange}
                  className="w-full tabular-nums"
                  onClick={() => {
                    onChange(toIsoDateOnly(date));
                    setOpen(false);
                  }}
                >
                  {date.getDate()}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
