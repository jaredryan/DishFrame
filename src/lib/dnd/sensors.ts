import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Shared pointer + keyboard sensor config for every drag-reorder surface
 * (Grocery Categories, Section/Ingredient/Instruction rows) — final Gate 2
 * correction pass. `PointerSensor` covers mouse and touch alike (it's
 * built on the unified Pointer Events spec); the 4px `activationConstraint`
 * means a plain click/tap on the drag handle (e.g. to focus it before
 * using arrow keys) is never misread as a drag, and dragging never
 * accidentally fires a click on an underlying control. `KeyboardSensor`
 * with `sortableKeyboardCoordinates` gives Tab-to-focus-handle,
 * Space/Enter-to-pick-up, Arrow-keys-to-move, Space/Enter-to-drop —
 * `@dnd-kit/sortable`'s standard accessible keyboard pattern.
 */
export function useReorderSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
}
