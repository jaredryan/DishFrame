"use client";

import * as React from "react";
import { ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseSectionFromPastedText } from "@/lib/importExport/paste-parser";
import type { SectionInput } from "@/lib/dishes/schema";

/**
 * A lightweight, in-editor counterpart to the full paste-and-review importer
 * (`src/lib/importExport/`) — reuses that same deterministic parsing to turn
 * one pasted block (e.g. a single component pulled out of an otherwise
 * messy import) into an ordinary new Section, without leaving this page or
 * touching persistence. The result is just another `sections.append()` call
 * the caller makes; nothing here is reviewed/confirmed through a separate
 * flow the way a full recipe import is.
 */
export function AddSectionFromTextButton({
  onAdd,
}: {
  onAdd: (section: SectionInput) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");

  function handleAdd() {
    onAdd(parseSectionFromPastedText(text));
    setOpen(false);
    setText("");
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <ClipboardPaste /> Add section from text
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add section from text</DialogTitle>
            <DialogDescription>
              Paste one recipe component — ingredients and instructions for a
              sauce, a filling, a topping — and DishFrame will structure it into
              a new Section you can review and edit.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="section-from-text">Pasted text</FieldLabel>
            <Textarea
              id="section-from-text"
              autoFocus
              rows={10}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                "Sauce\n1/4 cup soy sauce\n1 tbsp rice vinegar\n\n1. Whisk together."
              }
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!text.trim()}>
              Add section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
