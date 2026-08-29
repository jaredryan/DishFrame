import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import {
  SelectableDishRow,
  type DishSelectionItem,
} from "@/components/domain/dish/selectable-dish-row";
import { cn } from "@/lib/utils";

export type PickerKindTab = "ALL" | "RECIPE" | "PART";

const KIND_TABS: { value: PickerKindTab; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "RECIPE", label: "Recipes" },
  { value: "PART", label: "Parts" },
];

/**
 * The one rich Recipe/Part search-and-select picker underlying every
 * generalized picker in the app — Send, Publish, the grocery-list source
 * picker (new list and "Add meal" alike), the `/cook` "What will you cook?"
 * picker, and Attach-a-Part. Configurable per caller: `showKindTabs` for a
 * mixed candidate list that needs an All/Recipes/Parts filter (omit it when
 * the caller already passes a single-kind list, e.g. Attach-a-Part's
 * Parts-only candidates); `selectionMode` for single (radio) vs. multiple
 * (checkbox) choice. Row rendering is always `SelectableDishRow`, so every
 * picker exposes the same metadata (Version, tags, Stage, Cuisine, Rating)
 * rather than each caller showing an arbitrary subset.
 *
 * Deliberately does *not* render Version selection — see each caller for
 * whether Version choice applies at all, and when it does, it's a separate
 * step after this picker's selection is confirmed (never inline the moment
 * a row is selected).
 */
export function RecipePartPicker({
  items,
  itemsError,
  onRetry,
  search,
  onSearchChange,
  searchPlaceholder = "Search your Recipes and Parts…",
  autoFocusSearch = false,
  showKindTabs = false,
  selectionMode = "multiple",
  selected,
  onToggle,
  onSelectAll,
  selectAllLabel = "Select all",
  maxItems,
  itemStatusLabels,
  emptyMessage = "You don't have any Recipes or Parts saved yet.",
  loadingLabel = "Loading…",
  className,
}: {
  items: DishSelectionItem[] | null;
  itemsError: string | null;
  /** Shown as a Retry action alongside `itemsError`, when the caller re-fetches on demand. */
  onRetry?: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Only pass when this picker is the dialog's sole/first field — a picker
   * sharing a dialog with fields above it (email, title) should leave this
   * false so the dialog's default open-focus lands there instead. */
  autoFocusSearch?: boolean;
  showKindTabs?: boolean;
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
  emptyMessage?: string;
  loadingLabel?: string;
  className?: string;
}) {
  const [tab, setTab] = React.useState<PickerKindTab>("ALL");
  const isSingle = selectionMode === "single";

  const tabItems = React.useMemo(() => {
    if (!items) return [];
    if (!showKindTabs || tab === "ALL") return items;
    return items.filter((item) => item.kind === tab);
  }, [items, showKindTabs, tab]);

  const filteredItems = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tabItems;
    return tabItems.filter((item) => item.title.toLowerCase().includes(query));
  }, [tabItems, search]);

  return (
    <div
      className={cn(
        // Owns its own scroll container (bug fix, frontend interaction
        // audit): every caller used to wrap this in its own ad hoc
        // `overflow-y-auto` div, some forgetting the horizontal-only inset
        // that kept the sticky search header's focus ring from being
        // clipped — and none reserved any *vertical* room, so the ring's
        // top edge (the header sits flush at `top-0`) was clipped by this
        // element's own scrolling ancestor regardless. Centralizing the
        // scroll boundary and a matching inset (`-m-1`/`p-1`, canceling out
        // visually) here means every caller gets full-edge focus-ring
        // clearance for free, with no per-caller padding to remember.
        "-m-1 flex min-h-0 flex-col gap-2 overflow-y-auto p-1",
        className,
      )}
    >
      <div className="bg-popover sticky top-0 z-10 flex flex-col gap-2 pb-2">
        {!isSingle && onSelectAll && items && items.length > 0 && (
          <div className="flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSelectAll}
            >
              {selectAllLabel}
            </Button>
          </div>
        )}
        <SearchInput
          autoFocus={autoFocusSearch}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {showKindTabs && (
          <div role="tablist" className="border-border flex gap-1 border-b">
            {KIND_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-sm font-medium outline-none",
                  tab === t.value
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {itemsError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p role="alert" className="text-destructive-text text-sm">
            {itemsError}
          </p>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw /> Retry
            </Button>
          )}
        </div>
      ) : !items ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {loadingLabel}
        </p>
      ) : filteredItems.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {items.length === 0 ? emptyMessage : "Nothing matches that search."}
        </p>
      ) : (
        <ul
          role={isSingle ? "radiogroup" : undefined}
          className="flex flex-col gap-1"
        >
          {filteredItems.map((item) => {
            const isChecked = selected.has(item.id);
            const statusLabel = itemStatusLabels?.[item.id];
            return (
              <li key={item.id}>
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
