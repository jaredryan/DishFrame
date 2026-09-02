import { DatePickerField } from "@/components/ui/date-picker-field";
import { cn } from "@/lib/utils";

/**
 * A coherent Start/End date-range control (Meal Plan QA redesign §1) built
 * on the shared `DatePickerField` rather than two unrelated date widgets:
 * each side bounds the other (Start can't move past the current End, End
 * can't move before the current Start), so the range stays valid as the
 * user types or picks either date, on top of whatever end-of-form
 * validation the caller already runs. Both sides stay directly typeable and
 * calendar-selectable, and inherit `DatePickerField`'s own fine-pointer-
 * compact/coarse-pointer-44px sizing — nothing extra to wire here.
 */
export function DateRangePickerField({
  startId,
  endId,
  startValue,
  endValue,
  onStartChangeAction,
  onEndChangeAction,
  startAriaLabel = "Start date",
  endAriaLabel = "End date",
  className,
}: {
  startId?: string;
  endId?: string;
  startValue: string;
  endValue: string;
  onStartChangeAction: (value: string) => void;
  onEndChangeAction: (value: string) => void;
  startAriaLabel?: string;
  endAriaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DatePickerField
        id={startId}
        value={startValue}
        onChange={onStartChangeAction}
        ariaLabel={startAriaLabel}
        max={endValue}
        className="min-w-0 flex-1"
      />
      <span
        className="text-muted-foreground shrink-0 text-sm"
        aria-hidden="true"
      >
        –
      </span>
      <DatePickerField
        id={endId}
        value={endValue}
        onChange={onEndChangeAction}
        ariaLabel={endAriaLabel}
        min={startValue}
        className="min-w-0 flex-1"
      />
    </div>
  );
}
