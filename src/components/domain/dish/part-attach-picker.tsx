import * as React from "react";
import { Link2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  validatePartAttachment,
  listAttachablePartVersions,
  listAttachableParts,
  type PartVersionOption,
} from "@/lib/sections/actions";
import { PickerResultRow } from "@/components/domain/dish/picker-result-row";
import type { DishKindValue } from "@/lib/dishes/schema";

export type AttachablePartOption = {
  id: string;
  currentTitle: string | null;
  currentVersionId: string | null;
  tags: string[];
};

/**
 * PRODUCT_SPEC.md §67-68: "Attach a Part" — search/select a saved Part,
 * defaulting to its current Version (§68.1) with an option to deliberately
 * choose a historical one. Validates (ownership + cycle check) before
 * handing the resolved target back to the caller; never persists anything
 * itself — the actual `PartLink` is only written by the container's next
 * save.
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
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<AttachablePartOption | null>(
    null,
  );
  const [versions, setVersions] = React.useState<PartVersionOption[] | null>(
    null,
  );
  const [chosenVersionId, setChosenVersionId] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [parts, setParts] = React.useState<AttachablePartOption[] | null>(null);
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
    setQuery("");
    setSelected(null);
    setVersions(null);
    setChosenVersionId(null);
    setError(null);
  }

  const filtered = (parts ?? []).filter((part) =>
    (part.currentTitle ?? "Untitled")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  async function selectPart(part: AttachablePartOption) {
    setSelected(part);
    setChosenVersionId(part.currentVersionId);
    setError(null);
    const result = await listAttachablePartVersions(part.id);
    if (result.status === "success") {
      setVersions(result.versions);
    }
  }

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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach a part</DialogTitle>
            <DialogDescription>
              Use a saved sauce, side, or other reusable part in this recipe.
            </DialogDescription>
          </DialogHeader>

          {!selected ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  autoFocus
                  placeholder="Search your Parts"
                  className="pl-8"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {isLoadingParts ? (
                <p className="text-muted-foreground py-6 text-center text-sm">
                  Loading Parts…
                </p>
              ) : loadError ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <p role="alert" className="text-destructive-text text-sm">
                    {loadError}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLoadAttempt((n) => n + 1)}
                  >
                    <RotateCcw /> Retry
                  </Button>
                </div>
              ) : (
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {filtered.length === 0 && (
                    <p className="text-muted-foreground py-6 text-center text-sm">
                      {(parts ?? []).length === 0
                        ? "You don't have any reusable Parts yet."
                        : "Nothing matches that search."}
                    </p>
                  )}
                  {filtered.map((part) => (
                    <PickerResultRow
                      key={part.id}
                      title={part.currentTitle ?? "Untitled part"}
                      tags={part.tags}
                      onSelect={() => selectPart(part)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                <span className="font-medium">
                  {selected.currentTitle ?? "Untitled part"}
                </span>
              </p>
              {versions && versions.length > 1 && (
                <Select
                  value={chosenVersionId ?? undefined}
                  onValueChange={setChosenVersionId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        V{version.majorVersion}.{version.minorVersion}
                        {version.id === selected.currentVersionId
                          ? " (current)"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {error && (
                <p role="alert" className="text-destructive-text text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>
                  Back
                </Button>
                <Button onClick={confirm} disabled={isSubmitting}>
                  {isSubmitting ? "Attaching…" : "Attach"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
