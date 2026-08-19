"use client";

import { useRef } from "react";
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
 * direction instead of doing nothing (handled via handleReselect, since
 * Radix's controlled Select never fires onValueChange for a re-picked value
 * equal to the current one). The active property's direction shows as an
 * up/down arrow next to its label, in both the closed trigger and the open
 * list (Radix portals a selected `SelectItem`'s children into the trigger,
 * so one set of item markup drives both) — the checkmark indicator is
 * hidden since the arrow already conveys which option is active.
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
    // Radix's Select is controlled, so it never calls onValueChange when the
    // clicked item's value equals the current value — re-picking the active
    // property is handled separately below, via handleReselect.
    const option = options.find((o) => o.value === next);
    onChangeAction({
      property: next,
      direction: option?.defaultDirection ?? "desc",
    });
  }

  // Mirrors Radix SelectItem's own pointerup(mouse)/click(touch) split so
  // this fires exactly once per interaction instead of twice.
  const pointerTypeRef = useRef<string>("touch");

  function handleReselect(optionValue: P) {
    if (optionValue !== property) return;
    onChangeAction({
      property,
      direction: direction === "asc" ? "desc" : "asc",
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
              <SelectItem
                key={option.value}
                value={option.value}
                hideIndicator
                onPointerDown={(event) => {
                  pointerTypeRef.current = event.pointerType;
                }}
                onPointerUp={() => {
                  if (pointerTypeRef.current === "mouse") {
                    handleReselect(option.value);
                  }
                }}
                onClick={() => {
                  if (pointerTypeRef.current !== "mouse") {
                    handleReselect(option.value);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    handleReselect(option.value);
                  }
                }}
              >
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
