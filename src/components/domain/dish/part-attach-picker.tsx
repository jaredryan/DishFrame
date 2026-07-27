"use client";

import * as React from "react";
import { Link2, Plus, Search } from "lucide-react";
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
  type PartVersionOption,
} from "@/lib/sections/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

export type AttachablePartOption = {
  id: string;
  currentTitle: string | null;
  currentVersionId: string | null;
};

/**
 * PRODUCT_SPEC.md §67-68: "Attach a Part" — search/select a saved Part,
 * defaulting to its current Version (§68.1) with an option to deliberately
 * choose a historical one. Validates (ownership + cycle check) before
 * handing the resolved target back to the caller; never persists anything
 * itself — the actual `PartLink` is only written by the container's next
 * save.
 */
export function PartAttachPicker({
  containerDishId,
  containerKind,
  attachableParts,
  onAttach,
}: {
  containerDishId: string | null;
  containerKind: DishKindValue;
  attachableParts: AttachablePartOption[];
  onAttach: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
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

  function reset() {
    setQuery("");
    setSelected(null);
    setVersions(null);
    setChosenVersionId(null);
    setError(null);
  }

  const filtered = attachableParts.filter((part) =>
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
        <Link2 /> Attach a Part
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach a Part</DialogTitle>
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
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="text-muted-foreground py-6 text-center text-sm">
                    {attachableParts.length === 0
                      ? "You don't have any reusable Parts yet."
                      : "Nothing matches that search."}
                  </p>
                )}
                {filtered.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => selectPart(part)}
                    className="hover:bg-muted focus-visible:bg-muted rounded-md px-3 py-2 text-left text-sm outline-none"
                  >
                    {part.currentTitle ?? "Untitled part"}
                  </button>
                ))}
              </div>
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
              {error && <p className="text-destructive text-sm">{error}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={reset}>
                  Back
                </Button>
                <Button onClick={confirm} disabled={isSubmitting}>
                  <Plus /> {isSubmitting ? "Attaching…" : "Attach"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
