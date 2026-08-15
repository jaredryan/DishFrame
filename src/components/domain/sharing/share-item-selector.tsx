import * as React from "react";
import { UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StageBadge } from "@/components/domain/dish/stage-badge";
import type { ShareableItemSummary } from "@/lib/sharing/collections";

/**
 * The searchable Recipe/Part row list shared by every generalized
 * (multi-item) sharing flow launched from `/share` — the Send dialog and
 * the bulk Publish dialog both render the same familiar rows/search
 * behavior rather than each reimplementing it.
 */
export function ShareItemSelector({
  items,
  itemsError,
  search,
  onSearchChange,
  selected,
  onToggle,
  onSelectAll,
  maxItems,
}: {
  items: ShareableItemSummary[] | null;
  itemsError: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  maxItems: number;
}) {
  const filteredItems = React.useMemo(() => {
    if (!items) return [];
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Items</Label>
        {items && items.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onSelectAll}>
            Select all
          </Button>
        )}
      </div>
      <Input
        placeholder="Search your items…"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
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
        <ul className="border-border max-h-64 overflow-y-auto rounded-md border">
          {filteredItems.length === 0 && (
            <li className="text-muted-foreground p-3 text-sm">
              No items match &ldquo;{search}&rdquo;.
            </li>
          )}
          {filteredItems.map((item) => (
            <li
              key={item.id}
              className="border-border flex items-center gap-3 border-b p-2 last:border-b-0"
            >
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={() => onToggle(item.id)}
                aria-label={`Select ${item.title}`}
              />
              <div className="bg-muted flex size-9 shrink-0 items-center justify-center overflow-hidden rounded">
                {item.imageAssetId ? (
                  // eslint-disable-next-line @next/next/no-img-element -- private, authenticated route
                  <img
                    src={`/api/images/${item.imageAssetId}`}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <UtensilsCrossed
                    className="text-muted-foreground/40 size-4"
                    aria-hidden="true"
                  />
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">
                {item.title}
              </span>
              <Badge variant="outline">
                {item.kind === "PART" ? "Part" : "Recipe"}
              </Badge>
              <StageBadge stage={item.stage} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-sm">
        {selected.size} selected (max {maxItems})
      </p>
    </div>
  );
}
