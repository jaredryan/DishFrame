import { GripVertical } from "lucide-react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";

/**
 * Shared drag-handle affordance for every reorderable row (Grocery
 * Categories, Section/Ingredient/Instruction rows) — final Gate 2
 * correction pass. Pure presentation: the caller wires `attributes`/
 * `listeners` from its own `useSortable(...)` call, so dragging is scoped
 * to this handle alone and never fires from clicking elsewhere in the row
 * (e.g. Rename/Delete).
 */
export function DragHandle({
  label,
  attributes,
  listeners,
  isDragging,
  className,
}: {
  label: string;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none pointer-coarse:size-11",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden="true" />
    </button>
  );
}
