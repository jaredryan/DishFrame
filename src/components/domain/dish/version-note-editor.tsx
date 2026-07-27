"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateVersionNote } from "@/lib/dishes/actions";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §14.1: a mutable annotation on an otherwise-immutable
 * Version — editing or deleting it never creates a Version and never
 * touches ingredients/instructions/provenance. Works identically for the
 * current Version (rendered on the main detail page) and any historical
 * Version (rendered on the Version-history page) — §14 places no
 * restriction on which Versions may carry a note.
 *
 * Callers must render this with `key={versionId}` — the Version pager/
 * selector can navigate to a different Version's page without a full
 * route remount, and this component's local draft state must reset when
 * that happens. A `key` change is React's own remount mechanism for
 * exactly this; resyncing local state from props via an effect would
 * trigger a same-render cascading `setState` instead (caught by this
 * repo's `react-hooks/set-state-in-effect` lint rule).
 */
export function VersionNoteEditor({
  kind,
  dishId,
  versionId,
  note,
}: {
  kind: DishKindValue;
  dishId: string;
  versionId: string;
  note: string | null;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [value, setValue] = React.useState(note ?? "");
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateVersionNote(kind, {
        dishId,
        versionId,
        note: value,
      });
      if (result.status === "success") {
        setIsEditing(false);
      } else {
        setError(result.message ?? "Could not save the note.");
      }
    });
  }

  function handleCancel() {
    setValue(note ?? "");
    setIsEditing(false);
    setError(null);
  }

  if (!isEditing) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-muted-foreground text-sm italic">
          {note || "No version note yet."}
        </p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => setIsEditing(true)}
        >
          {note ? "Edit note" : "Add a note"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="What changed, or why — optional"
        maxLength={500}
        rows={3}
        aria-label="Version note"
      />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Saving…" : "Save note"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
