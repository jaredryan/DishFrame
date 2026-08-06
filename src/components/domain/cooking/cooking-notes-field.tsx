"use client";

import * as React from "react";
import { NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateCookingNotes } from "@/lib/reviews/actions";

/**
 * PRODUCT_SPEC.md §31.3: one freeform field per Cooking Session, editable
 * during cooking, immediately after, or later from session history —
 * independent of the structured Session Review (§39's learning loop never
 * touches this field, and deleting a Review never removes it, §33.6).
 */
export function CookingNotesField({
  sessionId,
  initialNotes,
}: {
  sessionId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = React.useState(initialNotes ?? "");
  const [isPending, startTransition] = React.useTransition();
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = value !== (initialNotes ?? "");

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateCookingNotes({
        sessionId,
        cookingNotes: value.trim() || null,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setSaved(true);
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <NotebookPen className="size-3.5" aria-hidden="true" />
        Cooking notes
      </h2>
      <Textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="Used larger chicken breasts. Rice finished before the vegetables…"
        rows={3}
        className="text-sm"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={isPending || !dirty}
        >
          {isPending ? "Saving…" : "Save notes"}
        </Button>
        {saved && !dirty && (
          <span className="text-muted-foreground text-xs">Saved.</span>
        )}
        {error && (
          <span className="text-destructive-text text-xs">{error}</span>
        )}
      </div>
    </section>
  );
}
