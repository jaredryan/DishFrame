import { Button } from "@/components/ui/button";

// Up/down reorder controls — keyboard- and mobile-friendly by construction,
// mirroring GroceryCategoryManager's existing pattern rather than
// introducing a drag-and-drop gesture (see src/components/app/grocery-category-manager.tsx).
export function ReorderButtons({
  label,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  label: string;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={isFirst}
        onClick={onMoveUp}
        aria-label={`Move ${label} up`}
      >
        ↑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={isLast}
        onClick={onMoveDown}
        aria-label={`Move ${label} down`}
      >
        ↓
      </Button>
    </div>
  );
}
