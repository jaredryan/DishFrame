import * as React from "react";
import { PackagePlus } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { createDish } from "@/lib/dishes/actions";
import { listAttachablePartVersions } from "@/lib/sections/actions";
import type { IngredientInput, InstructionInput } from "@/lib/dishes/schema";

/**
 * Settled Review Gate 3 decision, PRODUCT_SPEC.md §69: "Convert Section to
 * Part" — prefills the new Part's name from the Section's own name,
 * creates the standalone Part from the Section's current local content
 * (whether or not this item has ever been saved — unlike the removed
 * pre-gate "Save as reusable Part" flow, nothing here requires an existing
 * lineageId/baseVersionId), and hands the resolved target back so the
 * caller (`DishEditor`) can replace the Section field-array entry with a
 * PartLink at the exact same authored `position`. The Recipe/Part Version
 * itself is only ever created by this item's own normal Save.
 */
export function ConvertSectionToPartDialog({
  prefix,
  sectionLabel,
  defaultName,
  onConverted,
  // "icon" (default) matches the section card's compact toolbar row. The
  // Section modal (`SectionEditorDialog`) instead renders this as an
  // ordinary labeled button alongside its other footer actions.
  triggerVariant = "icon",
}: {
  // Empty string reads `ingredients`/`instructions` directly off the
  // current form root — used by `SectionEditorDialog`, whose own isolated
  // form root already *is* the Section, unlike the outer collapsed card's
  // `sections.${index}`-prefixed path into the parent Dish form.
  prefix: string;
  sectionLabel: string;
  defaultName: string;
  onConverted: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
  triggerVariant?: "icon" | "button";
}) {
  const { getValues } = useFormContext();
  const path = (field: string) => (prefix ? `${prefix}.${field}` : field);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function openDialog() {
    setTitle(defaultName);
    setDescription("");
    setError(null);
    setOpen(true);
  }

  async function handleConvert() {
    const ingredients: IngredientInput[] = getValues(path("ingredients")) ?? [];
    const instructions: InstructionInput[] =
      getValues(path("instructions")) ?? [];
    const trimmedIngredients = ingredients.filter(
      (ingredient) => ingredient.name.trim().length > 0,
    );
    const trimmedInstructions = instructions.filter(
      (instruction) => instruction.text.trim().length > 0,
    );
    if (trimmedIngredients.length === 0 && trimmedInstructions.length === 0) {
      setError("This section has no ingredients or instructions to convert.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await createDish("PART", {
      title,
      stage: "IDEA",
      cuisine: null,
      description: description.trim() || null,
      yieldQuantity: null,
      yieldUnit: null,
      prepTimeMinutes: null,
      cookTimeMinutes: null,
      difficulty: null,
      imageAssetId: null,
      sections: [
        {
          name: null,
          guidanceNote: null,
          ingredients: trimmedIngredients,
          instructions: trimmedInstructions,
          partLinks: [],
          position: 0,
        },
      ],
      partLinks: [],
    });

    if (result.status !== "success" || !result.dishId) {
      setIsSubmitting(false);
      setError(result.message ?? "Could not create the Part.");
      return;
    }

    const versions = await listAttachablePartVersions(result.dishId);
    setIsSubmitting(false);
    const newVersion =
      versions.status === "success" ? versions.versions[0] : null;
    if (!newVersion) {
      setError("The Part was created, but its version could not be resolved.");
      return;
    }

    onConverted({
      targetDishId: result.dishId,
      targetDishVersionId: newVersion.id,
    });
    setOpen(false);
  }

  return (
    <>
      {triggerVariant === "button" ? (
        <Button type="button" variant="outline" onClick={openDialog}>
          <PackagePlus aria-hidden="true" /> Convert to part
        </Button>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={openDialog}
                aria-label={`Convert ${sectionLabel} to a reusable Part`}
              >
                <PackagePlus aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Convert {sectionLabel} to a reusable Part
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert {sectionLabel} to a Part</DialogTitle>
            <DialogDescription>
              Creates a standalone Part from this section&apos;s content and
              replaces it here with a link, in the same place.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="convert-part-title">Part name</FieldLabel>
            <Input
              id="convert-part-title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="convert-part-description">
              Description
            </FieldLabel>
            <Textarea
              id="convert-part-description"
              placeholder="Optional"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-destructive-text text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConvert}
              disabled={!title.trim()}
              loading={isSubmitting}
            >
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
