"use client";

import { MoreVertical, type LucideIcon } from "lucide-react";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import { Button } from "@/components/ui/button";
import { DisabledActionHint } from "@/components/app/disabled-action-hint";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type EntityRowAction = {
  key: string;
  label: string;
  tooltip?: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  /** Why this action is disabled (e.g. "This is the built-in Taster for
   * your own ratings, so it can't be archived or deleted."). When set and
   * `disabled` is true: the visible-icon layout shows it via the existing
   * hover/tap `DisabledActionHint`; the overflow menu shows it as an
   * always-visible muted line under the label instead (a nested hover
   * affordance doesn't work well inside an already-open dropdown, and this
   * reads fine on touch without requiring hover at all). */
  disabledHint?: string;
};

// Secondary actions for a `ClickableRowOverlay` row: visible icons above
// the container-query breakpoint, one overflow menu (same actions/state)
// below it. Caller's row root needs `@container` for `@min-*` to apply.
export function EntityRowActions({
  actions,
  className,
}: {
  actions: EntityRowAction[];
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <div className="hidden items-center gap-1 @min-[22rem]:flex">
        {actions.map((action) => {
          const button = (
            <TooltipIconButton
              key={action.disabledHint ? undefined : action.key}
              label={action.label}
              tooltip={action.tooltip}
              icon={action.icon}
              onClick={action.onClick}
              disabled={action.disabled}
              loading={action.loading}
              className={
                action.destructive
                  ? "text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                  : undefined
              }
            />
          );
          if (action.disabled && action.disabledHint) {
            return (
              <DisabledActionHint
                key={action.key}
                explanation={action.disabledHint}
              >
                {button}
              </DisabledActionHint>
            );
          }
          return button;
        })}
      </div>
      <div className="@min-[22rem]:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
            >
              <MoreVertical aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {actions.map((action) => (
              <DropdownMenuItem
                key={action.key}
                variant={action.destructive ? "destructive" : "default"}
                disabled={action.disabled || action.loading}
                onSelect={action.onClick}
              >
                <action.icon aria-hidden="true" />
                <span className="flex flex-col items-start">
                  {action.label}
                  {action.disabled && action.disabledHint && (
                    <span className="text-muted-foreground text-xs font-normal">
                      {action.disabledHint}
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
