import {
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Timer as TimerIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCountdown } from "@/lib/cooking/timer-math";
import type { CookingModeTimer } from "@/components/domain/cooking/cooking-mode-types";

/**
 * Compact single-row timer control (desktop redesign item 6): identity and
 * the countdown/"Time's up" value share one primary row so the card stays
 * short enough to stack many-per-rail; controls live on a second, purely
 * icon-button row. `sectionLabel` is only passed by the desktop timer rail,
 * where a timer's owning Section isn't otherwise implied by context.
 */
export function TimerRow({
  timer,
  remainingSeconds,
  isExpired,
  isActive,
  sectionLabel,
  onStart,
  onPause,
  onAdjust,
  onReset,
  onDismiss,
}: {
  timer: CookingModeTimer;
  remainingSeconds: number;
  isExpired: boolean;
  isActive: boolean;
  sectionLabel?: string;
  onStart: () => void;
  onPause: () => void;
  onAdjust: (deltaSeconds: number) => void;
  onReset: () => void;
  onDismiss: () => void;
}) {
  return (
    <li
      className={`flex flex-col gap-1.5 rounded-lg border p-2 ${
        isExpired
          ? "border-brand-orange bg-brand-orange/10"
          : timer.state === "RUNNING"
            ? "border-brand-orange/40"
            : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <TimerIcon
          className={`size-4 shrink-0 ${isExpired ? "text-brand-orange-text" : "text-muted-foreground"}`}
          aria-hidden="true"
        />
        <p className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {sectionLabel && (
            <span className="text-muted-foreground font-normal">
              {sectionLabel}
              {" · "}
            </span>
          )}
          {timer.name}
        </p>
        <p
          className={`shrink-0 text-lg font-semibold tabular-nums ${isExpired ? "text-brand-orange-text" : "text-foreground"}`}
          role={isExpired ? "alert" : undefined}
          aria-live={isExpired ? "assertive" : undefined}
        >
          {isExpired ? "Time's up" : formatCountdown(remainingSeconds)}
        </p>
      </div>
      {isActive && (
        <div className="flex items-center gap-1">
          {timer.state === "RUNNING" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onPause}
              aria-label="Pause timer"
            >
              <Pause className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onStart}
              aria-label={isExpired ? "Restart timer" : "Start timer"}
            >
              <Play className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onAdjust(-60)}
            aria-label="Subtract one minute"
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onAdjust(60)}
            aria-label="Add one minute"
          >
            <Plus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onReset}
            aria-label="Reset timer"
          >
            <RotateCcw className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDismiss}
            aria-label={isExpired ? "Dismiss timer" : "Complete timer"}
            className="text-destructive-text hover:text-destructive-text ml-auto"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
