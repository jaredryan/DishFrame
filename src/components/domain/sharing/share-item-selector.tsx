import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectableDishRow } from "@/components/domain/dish/selectable-dish-row";
import type { ShareableItemSummary } from "@/lib/sharing/collections";

/**
 * The searchable, rich Recipe/Part row list shared by every generalized item
 * picker — the multi-item Send dialog and bulk Publish dialog (checkbox
 * rows, `selectionMode: "multiple"`, the default) as well as single-select
 * callers (`selectionMode: "single"`) all render the same familiar search/
 * row behavior rather than each reimplementing it. Row rendering itself is
 * `SelectableDishRow` (design pass: the one rich selection-row treatment
 * shared with the Add/Edit Meal and `/cook` pickers).
 */
export function ShareItemSelector({
  items,
  itemsError,
  search,
  onSearchChange,
  selectionMode = "multiple",
  selected,
  onToggle,
  onSelectAll,
  selectAllLabel = "Select all",
  maxItems,
  itemStatusLabels,
}: {
  items: ShareableItemSummary[] | null;
  itemsError: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  selectionMode?: "single" | "multiple";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  /** Overrides the "Select all" button text, e.g. "Select all (15 eligible)". */
  selectAllLabel?: string;
  maxItems?: number;
  /** Item id -> status chip text (e.g. "Already shared", "Pending"); present
   * entries also disable that row's selection control. */
  itemStatusLabels?: Record<string, string>;
}) {
  const isSingle = selectionMode === "single";
  const filteredItems = React.useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <div className="space-y-2">
      <div className="bg-popover sticky top-0 z-10 flex flex-col gap-2 pb-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Items</Label>
          {!isSingle && items && items.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
            >
              {selectAllLabel}
            </Button>
          )}
        </div>
        <Input
          placeholder="Search your items…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      {itemsError && (
        <p role="alert" className="text-destructive-text text-sm">
          {itemsError}
        </p>
      )}
      {!items && !itemsError && (
        <p className="text-muted-foreground text-sm">Loading…</p>
      )}
      {items && items.length === 0 && (
        <p className="text-muted-foreground text-sm">
          You don&apos;t have any shareable items yet.
        </p>
      )}
      {items && items.length > 0 && (
        <ul
          role={isSingle ? "radiogroup" : undefined}
          className="border-border rounded-md border"
        >
          {filteredItems.length === 0 && (
            <li className="text-muted-foreground p-3 text-sm">
              No items match &ldquo;{search}&rdquo;.
            </li>
          )}
          {filteredItems.map((item) => {
            const isChecked = selected.has(item.id);
            const statusLabel = itemStatusLabels?.[item.id];
            return (
              <li
                key={item.id}
                className="border-border border-b last:border-b-0"
              >
                <SelectableDishRow
                  item={item}
                  selectionControl={isSingle ? "radio" : "checkbox"}
                  selected={isChecked}
                  onSelect={() => onToggle(item.id)}
                  disabled={Boolean(statusLabel)}
                  statusLabel={statusLabel}
                />
              </li>
            );
          })}
        </ul>
      )}
      {!isSingle && maxItems != null && (
        <p className="text-muted-foreground text-sm">
          {selected.size} selected (max {maxItems})
        </p>
      )}
    </div>
  );
}
