"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type FilterPopoverOption = { value: string; label: string };

/**
 * One "<Label> ▾" trigger opening a checkbox list — the additive
 * multi-select filter pattern shared by the Recipes/Parts library filter bar
 * (Stage/Tags/Cuisine/Flavor profiles) and the Add/Edit Meal modal's
 * matching filters, so both present the exact same control rather than two
 * independent implementations of the same idea.
 */
export function FilterPopover({
  label,
  options,
  selected,
  onToggleAction,
  onClearAction,
  emptyMessage,
  triggerClassName = "gap-1.5",
  specialOption,
}: {
  label: string;
  options: FilterPopoverOption[];
  selected: ReadonlySet<string> | readonly string[];
  onToggleAction: (value: string) => void;
  onClearAction?: () => void;
  emptyMessage?: string;
  triggerClassName?: string;
  /** An extra option rendered above the option list, set off by a divider —
   * e.g. the Add/Edit Meal modal's "Favorites" filter living inside the Tags
   * dropdown instead of its own standalone control. */
  specialOption?: {
    label: string;
    checked: boolean;
    onToggle: () => void;
  };
}) {
  const selectedSet = selected instanceof Set ? selected : new Set(selected);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={triggerClassName}
        >
          {label}
          <ChevronDown
            className="text-muted-foreground size-3.5"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 max-w-none" align="start">
        {specialOption && (
          <>
            <Label className="flex cursor-pointer items-center gap-2 pb-1.5 text-sm font-normal">
              <Checkbox
                checked={specialOption.checked}
                onCheckedChange={specialOption.onToggle}
              />
              {specialOption.label}
            </Label>
            <Separator className="mb-1.5" />
          </>
        )}
        {options.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            {emptyMessage ?? "Nothing to choose from yet."}
          </p>
        ) : (
          <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {options.map((option) => (
              <Label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 text-sm font-normal"
              >
                <Checkbox
                  checked={selectedSet.has(option.value)}
                  onCheckedChange={() => onToggleAction(option.value)}
                />
                {option.label}
              </Label>
            ))}
            {onClearAction && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 w-fit"
                onClick={onClearAction}
              >
                Clear
              </Button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
