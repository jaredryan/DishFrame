import * as React from "react";
import { Link2 } from "lucide-react";
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
import type { DishKindValue } from "@/lib/dishes/schema";

function toSelectionItem(part: AttachablePart): DishSelectionItem {
  return {
    id: part.id,
    kind: "PART",
    title: part.currentTitle ?? "Untitled part",
    versionLabel: part.versionLabel,
    stage: part.stage,
    cuisine: part.cuisine,
    imageAssetId: part.imageAssetId,
    tagNames: part.tags,
    rating: part.rating,
  };
}

/**
 * PRODUCT_SPEC.md §67-68: "Attach a Part" — search/select a saved Part,
 * defaulting to its current Version (§68.1) with an option to deliberately
 * choose a historical one. Validates (ownership + cycle check) before
 * handing the resolved target back to the caller; never persists anything
 * itself — the actual `PartLink` is only written by the container's next
 * save.
 *
 * Single-select, Part-only `RecipePartPicker` (design pass: unified with
 * every other Recipe/Part picker — same search treatment, same rich row).
 * Selecting a Part is this picker's only step 1 -> step 2 transition (there's
 * no separate item list once a single choice narrows to one); step 2 is
 * Version choice, a true separate screen rather than an inline control next
 * to the row.
 *
 * Slice 6A browser-review correction pass §5: the candidate list is never
 * passed in as a prop captured when the parent editor/detail page first
 * rendered — it's fetched fresh every time this dialog opens, so a Part
 * created from `/parts/new` in a separate tab shows up here without
 * reloading or abandoning the parent's draft. The server still re-runs
 * ownership/duplicate/cycle validation on `confirm()` regardless of what
 * this fetch returned.
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
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [chosenVersionId, setChosenVersionId] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [parts, setParts] = React.useState<AttachablePart[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = React.useState(0);
  // The requestKey this fetch's result reflects, or null before it resolves.
  // Cleared to null whenever the dialog opens/retries (see onOpenChange and
  // the Retry button below), so isLoadingParts stays derived rather than set
  // synchronously in the effect.
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);

  const requestKey = open ? `${excludeDishId ?? ""}::${loadAttempt}` : null;
  const isLoadingParts = requestKey !== null && loadedKey !== requestKey;

  // Fetches fresh every time the dialog opens (and on Retry) — never reuses
  // a previous opening's result.
  React.useEffect(() => {
    if (requestKey === null) return;
    let cancelled = false;
    listAttachableParts(excludeDishId).then((result) => {
      if (cancelled) return;
      setLoadedKey(requestKey);
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
  }, [requestKey, excludeDishId]);

  function reset() {
    setSearch("");
    setSelectedId(null);
    setChosenVersionId(null);
    setError(null);
  }

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
    setError(null);
    const result = await validatePartAttachment({
      containerDishId,
      containerKind,
      targetDishId: selected.id,
      targetDishVersionId: chosenVersionId ?? undefined,
    });
    setIsSubmitting(false);
    if (result.status === "success") {
      onAttach({
        targetDishId: result.target.targetDishId,
        targetDishVersionId: result.target.targetVersionId,
      });
      setOpen(false);
      reset();
    } else {
      setError(result.message);
    }
  }

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
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            reset();
            setParts(null);
            setLoadError(null);
            setLoadedKey(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach a part</DialogTitle>
            <DialogDescription>
              Use a saved sauce, side, or other reusable part in this recipe.
            </DialogDescription>
          </DialogHeader>

          {!selected ? (
            <div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
              <RecipePartPicker
                items={isLoadingParts ? null : pickerItems}
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
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <SelectableDishRow
                item={toSelectionItem(selected)}
                selectionControl="remove"
                onRemove={() => setSelectedId(null)}
              />
              <RichDishVersionPicker
                id="attach-part-version"
                kind="PART"
                dishId={selected.id}
                value={chosenVersionId}
                onChangeAction={setChosenVersionId}
              />
              {error && (
                <p role="alert" className="text-destructive-text text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedId(null)}>
                  Back
                </Button>
                <Button onClick={confirm} loading={isSubmitting}>
                  Attach
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
