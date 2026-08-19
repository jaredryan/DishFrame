import { Check, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";
import type { CookingModeChecklistItem } from "@/components/domain/cooking/cooking-mode-types";

/**
 * Shared Ingredient/Instruction row (desktop redesign item 11): spacing
 * comes entirely from the parent list's `gap-3` (12px), not per-row
 * padding or a forced `min-h`, so a row's height always follows its own
 * content — a wrapping multiline item doesn't stretch its one-line
 * neighbors.
 */
function ChecklistRow({
  item,
  checked,
  disabled,
  onToggle,
  index,
}: {
  item: CookingModeChecklistItem;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  index?: number;
}) {
  // Instructions (index != null) top-align so a wrapping multiline step
  // starts beside the checkbox rather than centering the checkbox
  // halfway down the text; ingredients stay centered since they're
  // reliably single-line.
  const isInstruction = index != null;
  return (
    <label
      className={`hover:bg-muted/40 -mx-1 flex cursor-pointer rounded-md px-1 ${isInstruction ? "items-start" : "items-center"}`}
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => onToggle(next === true)}
        className={`mr-3 size-5 shrink-0 ${isInstruction ? "mt-0.5" : ""}`}
      />
      {index != null && (
        <span className="text-muted-foreground mr-1 w-5 shrink-0 text-sm tabular-nums">
          {index + 1}.
        </span>
      )}
      <span
        className={`flex-1 text-base ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {item.kind === "INGREDIENT" &&
          [item.displayQuantity, item.displayUnit].filter(Boolean).join(" ") +
            " "}
        {item.displayText}
      </span>
      {item.conflict && (
        <Badge
          variant="outline"
          className={
            item.conflict.type === "needs-more"
              ? "border-brand-orange/50 text-brand-orange-text ml-2 shrink-0"
              : "text-muted-foreground ml-2 shrink-0"
          }
        >
          {item.conflict.type === "needs-more"
            ? `+${item.conflict.amount} more needed`
            : `${item.conflict.amount} extra`}
        </Badge>
      )}
    </label>
  );
}

type ChecklistGroupProps = {
  items: CookingModeChecklistItem[];
  isChecked: (item: CookingModeChecklistItem) => boolean;
  onToggle: (itemId: string, checked: boolean) => void;
  onMarkAllPrepared: () => void;
  onResetAll: () => void;
  isActive: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/**
 * Independently collapsible (item 9): collapse state is only ever changed
 * by an explicit click on the header's own chevron or "Mark all completed"
 * — never as a side effect of checking the last individual item, so a
 * normal checkbox click never triggers a surprise layout change. Shared by
 * Ingredients and Instructions so both get identical collapse/mark-all/
 * reset behavior; `ordered` only changes the list semantics (numbered
 * steps vs. an unordered ingredient list).
 */
function ChecklistGroup({
  title,
  ordered,
  items,
  isChecked,
  onToggle,
  onMarkAllPrepared,
  onResetAll,
  isActive,
  collapsed,
  onToggleCollapsed,
}: ChecklistGroupProps & { title: string; ordered: boolean }) {
  if (items.length === 0) return null;
  const checkedCount = items.filter(isChecked).length;
  const allChecked = checkedCount === items.length;
  const ListTag = ordered ? "ol" : "ul";

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-medium tabular-nums">
          {title} — {checkedCount}/{items.length}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <TooltipIconButton
            label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
            icon={collapsed ? ChevronDown : ChevronUp}
            onClick={onToggleCollapsed}
          />
          {isActive && (
            <TooltipIconButton
              label={allChecked ? "Reset list" : "Mark all completed"}
              icon={allChecked ? RotateCcw : Check}
              onClick={allChecked ? onResetAll : onMarkAllPrepared}
            />
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="border-border bg-card rounded-xl border p-4">
          <ListTag className="flex flex-col gap-3">
            {items.map((item, index) => (
              <li key={item.id}>
                <ChecklistRow
                  item={item}
                  checked={isChecked(item)}
                  disabled={!isActive}
                  onToggle={(checked) => onToggle(item.id, checked)}
                  index={ordered ? index : undefined}
                />
              </li>
            ))}
          </ListTag>
        </div>
      )}
    </section>
  );
}

export function IngredientsSection(props: ChecklistGroupProps) {
  return <ChecklistGroup title="Ingredients" ordered={false} {...props} />;
}

export function InstructionsSection(props: ChecklistGroupProps) {
  return <ChecklistGroup title="Instructions" ordered={true} {...props} />;
}
