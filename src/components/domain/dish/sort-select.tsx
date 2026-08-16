"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
 * direction instead of doing nothing. The active property's direction shows
 * as an up/down arrow next to its label, in both the closed trigger and the
 * open list (Radix portals a selected `SelectItem`'s children into the
 * trigger, so one set of item markup drives both).
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
  function handleValueChange(value: string) {
    const next = value as P;
    if (next === property) {
      onChangeAction({
        property,
        direction: direction === "asc" ? "desc" : "asc",
      });
      return;
    }
    const option = options.find((o) => o.value === next);
    onChangeAction({
      property: next,
      direction: option?.defaultDirection ?? "desc",
    });
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
      <Select value={property} onValueChange={handleValueChange}>
        <SelectTrigger id={id} size="sm" className={triggerClassName}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => {
            const isActive = option.value === property;
            const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
            return (
              <SelectItem key={option.value} value={option.value}>
                <span className="flex items-center gap-1.5">
                  {option.label}
                  {isActive && (
                    <Arrow className="size-3.5" aria-hidden="true" />
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
