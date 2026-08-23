"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SortDirectionValue = "asc" | "desc";

export type SortSelectOption<P extends string> = {
  value: P;
  label: string;
  /** The direction this property starts at when picked from a different
   * property — e.g. Alphabetical starts A→Z, Rating starts highest-first. */
  defaultDirection: SortDirectionValue;
};

/**
 * One dropdown-style sort control, shared by the Recipes/Parts library and
 * the Add/Edit Meal modal: picking a property sets it at that property's own
 * default direction; picking the *already-active* property again reverses
 * direction instead of doing nothing. Built on the same Button-trigger/
 * Popover-menu system as `FilterPopover` (mobile-responsiveness correction
 * pass) rather than a native `Select`, so every filter/sort control in these
 * bars reads as one consistent family. Options render as plain rows (no
 * checkboxes — this is single-select) with the active property's direction
 * shown as an up/down arrow, both in the closed trigger and next to the
 * active row in the open menu.
 */
export function SortSelect<P extends string>({
  id,
  label = "Sort",
  property,
  direction,
  options,
  onChangeAction,
  triggerClassName,
}: {
  id?: string;
  label?: string | null;
  property: P;
  direction: SortDirectionValue;
  options: SortSelectOption<P>[];
  onChangeAction: (next: {
    property: P;
    direction: SortDirectionValue;
  }) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const activeOption = options.find((o) => o.value === property);
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;

  function pick(option: SortSelectOption<P>) {
    if (option.value === property) {
      onChangeAction({
        property,
        direction: direction === "asc" ? "desc" : "asc",
      });
    } else {
      onChangeAction({
        property: option.value,
        direction: option.defaultDirection,
      });
    }
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-2">
      {label && (
        <Label
          htmlFor={id}
          className="text-muted-foreground text-xs font-normal"
        >
          {label}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            className={cn("gap-1.5", triggerClassName)}
          >
            {activeOption?.label ?? "Sort"}
            {activeOption && <Arrow className="size-3.5" aria-hidden="true" />}
            <ChevronDown
              className="text-muted-foreground size-3.5"
              aria-hidden="true"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 max-w-none" align="start">
          <div className="flex flex-col gap-1">
            {options.map((option) => {
              const isActive = option.value === property;
              const OptionArrow = direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pick(option)}
                  className={cn(
                    "hover:bg-muted flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    isActive && "bg-muted font-medium",
                  )}
                >
                  {option.label}
                  {isActive && (
                    <OptionArrow className="size-3.5" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
