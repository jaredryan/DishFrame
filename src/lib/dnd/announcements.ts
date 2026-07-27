import type { Announcements } from "@dnd-kit/core";

/**
 * Builds screen-reader announcements for a drag-reorder list, naming the
 * dragged item instead of dnd-kit's generic default ("Draggable item x was
 * moved") — final Gate 2 correction pass. `getLabel` maps a sortable id to
 * its human-readable name (an Ingredient's name, a Grocery Category's
 * display name, ...); `getPosition` maps an id to its 1-based position and
 * the list length, both read fresh at announcement time so a keyboard
 * reorder in progress announces its *current* position, not a stale one.
 */
export function createReorderAnnouncements(
  getLabel: (id: string) => string,
  getPosition: (id: string) => { index: number; total: number },
): Announcements {
  function describe(id: string): string {
    const { index, total } = getPosition(id);
    return `${getLabel(id)}, position ${index + 1} of ${total}`;
  }

  return {
    onDragStart({ active }) {
      return `Picked up ${describe(String(active.id))}.`;
    },
    onDragOver({ active, over }) {
      if (!over)
        return `${getLabel(String(active.id))} is no longer over a droppable area.`;
      return `${getLabel(String(active.id))} moved to ${describe(String(over.id))}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) {
        return `${getLabel(String(active.id))} was dropped without a new position.`;
      }
      return `${getLabel(String(active.id))} dropped, now at ${describe(String(active.id))}.`;
    },
    onDragCancel({ active }) {
      return `Reordering ${getLabel(String(active.id))} was cancelled.`;
    },
  };
}
