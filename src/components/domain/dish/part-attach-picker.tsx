import * as React from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PartLinkPickerDialog } from "@/components/domain/dish/part-link-picker-dialog";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §67-68: "Attach a Part" — search/select a saved Part,
 * defaulting to its current Version (§68.1) with an option to deliberately
 * choose a historical one. Validates (ownership + cycle check) before
 * handing the resolved target back to the caller; never persists anything
 * itself — the actual `PartLink` is only written by the container's next
 * save.
 *
 * A thin trigger wrapper around `PartLinkPickerDialog`, which owns the
 * actual search/candidate-fetch/Version-choice implementation shared with
 * the editor's "Replace with Part" action.
 */
export function PartAttachPicker({
  containerDishId,
  containerKind,
  excludeDishId,
  onAttach,
  triggerLabel = "Attach a part",
}: {
  containerDishId: string | null;
  containerKind: DishKindValue;
  // The Dish id to exclude from the candidate list — the Dish being edited
  // (self-attach is meaningless) or, from the delete-resolution flow, the
  // Part being deleted (can't replace a usage with the very Part it came
  // from).
  excludeDishId?: string;
  onAttach: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Link2 /> {triggerLabel}
      </Button>
      <PartLinkPickerDialog
        open={open}
        onOpenChange={setOpen}
        containerDishId={containerDishId}
        containerKind={containerKind}
        excludeDishId={excludeDishId}
        dialogTitle="Attach a part"
        dialogDescription="Use a saved sauce, side, or other reusable part in this recipe."
        confirmLabel="Attach"
        onConfirm={onAttach}
      />
    </>
  );
}
