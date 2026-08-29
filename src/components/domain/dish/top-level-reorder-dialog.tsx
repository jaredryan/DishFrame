import * as React from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { DragHandle } from "@/components/ui/drag-handle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { getPartLinkDisplay } from "@/lib/sections/actions";

export type TopLevelReorderEntry =
  | { kind: "section"; fieldId: string; label: string }
  | {
      kind: "partLink";
      fieldId: string;
      targetDishId: string | null;
      targetDishVersionId: string | null;
    };

/**
 * Compact long-distance reorder for the editor's unified top-level
 * Section/linked-Part sequence — a convenience alongside the inline
 * drag-and-drop in `DishEditor`, not a replacement for it. Operates
 * entirely on the caller's unsaved draft: Cancel discards this dialog's
 * local order, Apply hands the final fieldId order back to `onApply`,
 * which repositions the exact same draft state the inline drag-and-drop
 * already writes to (`sections.*.position` / `partLinks.*.position`) —
 * this dialog never itself saves a Version.
 */
export function TopLevelReorderDialog({
  open,
  onOpenChange,
  kindLabel,
  entries,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kindLabel: string;
  entries: TopLevelReorderEntry[];
  onApply: (orderedFieldIds: string[]) => void;
}) {
  const [order, setOrder] = React.useState(entries);
  const sensors = useReorderSensors();

  const announcements = createReorderAnnouncements(
    (id) => {
      const entry = order.find((e) => e.fieldId === id);
      return entry?.kind === "section" ? entry.label : "linked Part";
    },
    (id) => ({
      index: order.findIndex((e) => e.fieldId === id),
      total: order.length,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.findIndex((e) => e.fieldId === active.id);
    const newIndex = order.findIndex((e) => e.fieldId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setOrder((current) => arrayMove(current, oldIndex, newIndex));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reorder {kindLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>
            Drag to move a Section or linked Part anywhere in the order below —
            the same order used in the editor.
          </DialogDescription>
        </DialogHeader>

        <DndContext
          id="top-level-reorder"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext
            items={order.map((entry) => entry.fieldId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto">
              {order.map((entry, index) => (
                <ReorderRow
                  key={entry.fieldId}
                  entry={entry}
                  index={index}
                  total={order.length}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(order.map((entry) => entry.fieldId));
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReorderRow({
  entry,
  index,
  total,
}: {
  entry: TopLevelReorderEntry;
  index: number;
  total: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.fieldId });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const label = entry.kind === "section" ? entry.label : "linked Part";

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex items-center gap-2 rounded-lg border px-3 py-2"
      aria-label={`${label}, position ${index + 1} of ${total}`}
    >
      <DragHandle
        label={`Drag to reorder ${label}`}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
      />
      {entry.kind === "section" ? (
        <span className="min-w-0 flex-1 truncate text-sm">{entry.label}</span>
      ) : (
        <PartLinkReorderLabel
          targetDishId={entry.targetDishId}
          targetDishVersionId={entry.targetDishVersionId}
        />
      )}
      {entry.kind === "partLink" && (
        <SemanticChip semantic="neutral" className="shrink-0">
          Part
        </SemanticChip>
      )}
    </li>
  );
}

// Resolves a linked Part's display title independently of the main list's
// own `PartLinkFields` rows — the form draft only carries target ids, not
// the title, so this mirrors that same `getPartLinkDisplay` lookup rather
// than threading a shared cache through for this compact view alone.
function PartLinkReorderLabel({
  targetDishId,
  targetDishVersionId,
}: {
  targetDishId: string | null;
  targetDishVersionId: string | null;
}) {
  const [title, setTitle] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!targetDishId || !targetDishVersionId) return;
    let cancelled = false;
    getPartLinkDisplay({ targetDishId, targetDishVersionId }).then((result) => {
      if (cancelled) return;
      setTitle(result.status === "success" ? result.title : null);
    });
    return () => {
      cancelled = true;
    };
  }, [targetDishId, targetDishVersionId]);

  return (
    <span className="min-w-0 flex-1 truncate text-sm">
      {title ?? "Loading…"}
    </span>
  );
}
