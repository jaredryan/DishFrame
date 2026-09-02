import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type CuisineOption = { id: string; displayName: string };

/**
 * Canonical Cuisine multi-select UI (PRODUCT_SPEC.md §46, owner decision
 * 2026-09-02) — zero, one, or several of the owner's own Cuisines, same
 * checkbox-list shape as Tag/Flavor-profile selection. Shared by the
 * Recipe/Part create/edit form (`DishEditor`) and the post-save
 * `DishTagFlavorEditor` popover, so there's exactly one Cuisine-picker
 * implementation rather than two drifting in parallel.
 */
export function CuisineSelector({
  options,
  selectedIds,
  onToggle,
  emptyMessage = "No Cuisines yet — add one from Settings.",
}: {
  options: CuisineOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-foreground text-sm font-medium">Cuisine</p>
      {options.length === 0 ? (
        <p className="text-muted-foreground text-xs">{emptyMessage}</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {options.map((cuisine) => (
            <Label
              key={cuisine.id}
              className="flex cursor-pointer items-center gap-2 text-sm font-normal"
            >
              <Checkbox
                checked={selectedIds.includes(cuisine.id)}
                onCheckedChange={() => onToggle(cuisine.id)}
                aria-label={cuisine.displayName}
              />
              {cuisine.displayName}
            </Label>
          ))}
        </div>
      )}
    </div>
  );
}
