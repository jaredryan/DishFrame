import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  validatePartAttachment,
  listAttachableParts,
} from "@/lib/sections/actions";
import type { AttachablePart } from "@/lib/dishes/queries";
import { RecipePartPicker } from "@/components/domain/dish/recipe-part-picker";
import {
  SelectableDishRow,
  type DishSelectionItem,
} from "@/components/domain/dish/selectable-dish-row";
import { RichDishVersionPicker } from "@/components/domain/dish/version-picker-field";
import { useToast } from "@/components/ui/toast";
import type { DishKindValue } from "@/lib/dishes/schema";

function toSelectionItem(part: AttachablePart): DishSelectionItem {
  return {
    id: part.id,
    kind: "PART",
    title: part.currentTitle ?? "Untitled part",
    versionLabel: part.versionLabel,
    stage: part.stage,
    cuisineNames: part.cuisineNames,
    imageAssetId: part.imageAssetId,
    tagNames: part.tags,
    rating: part.rating,
  };
}

type PartLinkPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerDishId: string | null;
  containerKind: DishKindValue;
  excludeDishId?: string;
  /** Prefills the search box on open — e.g. a Section's current title. */
  initialSearch?: string;
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel?: string;
  /** Shown once a Part is selected, above the Version picker. */
  contextualNote?: (part: AttachablePart) => string;
  onConfirm: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
};

/**
 * The Part-only, single-select picker body shared by every "link to an
 * existing Part" flow — PRODUCT_SPEC.md §67-68's "Attach a Part"
 * (`PartAttachPicker`) and the editor's "Replace with Part" action
 * (`ReplaceSectionWithPartDialog`) both render this, so the candidate
 * fetch, ownership/cycle validation (`validatePartAttachment`), and
 * current-Version-preselected/historical-eligible Version choice
 * (`RichDishVersionPicker`) exist in exactly one place. Never persists
 * anything itself — resolves a `{targetDishId, targetDishVersionId}` and
 * hands it to `onConfirm`; the caller decides what that means (attach vs.
 * replace).
 *
 * A trigger (`PartAttachPicker`, `ReplaceSectionWithPartDialog`) sits on the
 * page whether or not its dialog is ever opened, so the actual body below
 * (`PartLinkPickerDialogBody` — the fetch, the toast, all local state) only
 * mounts while `open` is true, remounting fresh on every open. That's both
 * "fetch fresh every time it opens" (Slice 6A browser-review correction pass
 * §5) for free via mount, not a request-key dance, and — since `useToast()`
 * throws outside a `ToastProvider` — why a page with this trigger present
 * but unopened doesn't need one.
 */
export function PartLinkPickerDialog({
  open,
  onOpenChange,
  ...rest
}: PartLinkPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <PartLinkPickerDialogBody onOpenChange={onOpenChange} {...rest} />
      )}
    </Dialog>
  );
}

function PartLinkPickerDialogBody({
  onOpenChange,
  containerDishId,
  containerKind,
  excludeDishId,
  initialSearch = "",
  dialogTitle,
  dialogDescription,
  confirmLabel = "Attach",
  contextualNote,
  onConfirm,
}: Omit<PartLinkPickerDialogProps, "open">) {
  const [search, setSearch] = React.useState(initialSearch);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [chosenVersionId, setChosenVersionId] = React.useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { showToast } = useToast();

  const [parts, setParts] = React.useState<AttachablePart[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    listAttachableParts(excludeDishId).then((result) => {
      if (cancelled) return;
      if (result.status === "success") {
        setParts(result.parts);
        setLoadError(null);
      } else {
        setParts(null);
        setLoadError(result.message);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt, excludeDishId]);

  const selected = parts?.find((part) => part.id === selectedId) ?? null;
  const selectedSet = React.useMemo(
    () => new Set(selectedId ? [selectedId] : []),
    [selectedId],
  );
  const pickerItems = React.useMemo(
    () => parts?.map(toSelectionItem) ?? null,
    [parts],
  );

  async function confirm() {
    if (!selected) return;
    setIsSubmitting(true);
    const result = await validatePartAttachment({
      containerDishId,
      containerKind,
      targetDishId: selected.id,
      targetDishVersionId: chosenVersionId ?? undefined,
    });
    setIsSubmitting(false);
    if (result.status === "success") {
      onConfirm({
        targetDishId: result.target.targetDishId,
        targetDishVersionId: result.target.targetVersionId,
      });
      onOpenChange(false);
    } else {
      showToast({ variant: "error", title: result.message });
    }
  }

  return (
    <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogDescription>{dialogDescription}</DialogDescription>
      </DialogHeader>

      {!selected ? (
        <RecipePartPicker
          items={parts ? pickerItems : null}
          itemsError={loadError}
          onRetry={() => setLoadAttempt((n) => n + 1)}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search your Parts"
          autoFocusSearch
          selectionMode="single"
          selected={selectedSet}
          onToggle={(id) => setSelectedId(id)}
          emptyMessage="You don't have any reusable Parts yet."
          loadingLabel="Loading Parts…"
          className="flex-1"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <SelectableDishRow
            item={toSelectionItem(selected)}
            selectionControl="remove"
            onRemove={() => setSelectedId(null)}
          />
          {contextualNote && (
            <p className="text-muted-foreground text-sm">
              {contextualNote(selected)}
            </p>
          )}
          <RichDishVersionPicker
            id="part-link-picker-version"
            kind="PART"
            dishId={selected.id}
            value={chosenVersionId}
            onChangeAction={setChosenVersionId}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedId(null)}>
              Back
            </Button>
            <Button onClick={confirm} loading={isSubmitting}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}
