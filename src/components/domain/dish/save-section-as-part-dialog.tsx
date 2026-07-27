"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  promoteLocalContentToPart,
  saveContentAsNewPart,
} from "@/lib/sections/actions";
import { dishBasePath } from "@/components/domain/dish/dish-card";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * PRODUCT_SPEC.md §69.1-§69.3: "Save as reusable Part" (create and link —
 * replaces this Section with a live link to the new Part, in a new
 * Version) and "Save a copy as Part" (leaves this item untouched). Only
 * available once this item has already been saved at least once — a
 * brand-new, not-yet-saved Section has no stable identity yet to extract
 * from.
 */
export function SaveSectionAsPartDialog({
  containerDishId,
  containerKind,
  baseVersionId,
  sectionLineageId,
  sectionLabel,
}: {
  containerDishId: string | null;
  containerKind: DishKindValue;
  baseVersionId: string | null;
  sectionLineageId: string | undefined;
  sectionLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"link" | "copy" | null>(null);

  const disabled = !containerDishId || !baseVersionId || !sectionLineageId;

  async function handleSaveAndLink() {
    if (!containerDishId || !baseVersionId || !sectionLineageId) return;
    setPending("link");
    setError(null);
    const result = await promoteLocalContentToPart({
      containerDishId,
      containerKind,
      baseVersionId,
      sectionLineageId,
      partTitle: title,
    });
    setPending(null);
    if (result.status === "success") {
      setOpen(false);
      router.push(`${dishBasePath(containerKind)}/${containerDishId}`);
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  async function handleSaveCopyOnly() {
    if (!containerDishId || !baseVersionId || !sectionLineageId) return;
    setPending("copy");
    setError(null);
    const result = await saveContentAsNewPart({
      containerDishId,
      containerKind,
      baseVersionId,
      sectionLineageId,
      partTitle: title,
    });
    setPending(null);
    if (result.status === "success") {
      setOpen(false);
      router.push(`/parts/${result.newPartDishId}`);
    } else {
      setError(result.message);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={
          disabled
            ? "Save this item first to save a Section as a reusable Part"
            : `Save ${sectionLabel} as a reusable Part`
        }
        onClick={() => setOpen(true)}
      >
        <PackagePlus /> Save as reusable Part
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setError(null);
            setTitle("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save {sectionLabel} as a reusable Part</DialogTitle>
            <DialogDescription>
              Name the new Part. &quot;Save and link here&quot; replaces this
              Section with a live link to it, in a new Version — this saves
              immediately and leaves the editor. &quot;Save a copy only&quot;
              creates the Part without changing this item at all.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="new-part-title">Part name</FieldLabel>
            <Input
              id="new-part-title"
              autoFocus
              placeholder="e.g. Nuoc Cham"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleSaveCopyOnly}
              disabled={!title.trim() || pending !== null}
            >
              {pending === "copy" ? "Saving…" : "Save a copy only"}
            </Button>
            <Button
              onClick={handleSaveAndLink}
              disabled={!title.trim() || pending !== null}
            >
              {pending === "link" ? "Saving…" : "Save and link here"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
