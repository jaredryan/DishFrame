import * as React from "react";
import { Plus, XIcon } from "lucide-react";
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { IngredientFields } from "@/components/domain/dish/ingredient-fields";
import { InstructionFields } from "@/components/domain/dish/instruction-fields";
import { PartAttachPicker } from "@/components/domain/dish/part-attach-picker";
import { CreatePartLink } from "@/components/domain/dish/create-part-link";
import { isBlankSubstitute } from "@/lib/dishes/schema";
import type { DishKindValue, SectionInput } from "@/lib/dishes/schema";

const BLANK_INGREDIENT = {
  name: "",
  quantity: null,
  quantityEnd: null,
  isApproximate: false,
  unit: null,
  displayText: null,
  preparationNote: null,
  isOptional: false,
  substitute: null,
};

const BLANK_INSTRUCTION = { text: "" };

export type SectionEditorResult =
  { action: "finish"; values: SectionInput } | { action: "cancel" };

/**
 * The Section modal's reversible editing session: this component owns its
 * own `useForm`, seeded once (at mount) from `initialValues` — name,
 * guidance note, Ingredients, Instructions, and any newly-attached linked
 * Parts all live here while the modal is open, entirely separate from the
 * parent recipe/Part form. `onClose` is the only way any of it ever reaches
 * the caller: "Finish section" hands back the current local values for the
 * caller to write into the parent; every other dismissal (Cancel, the X,
 * Escape, an outside click) reports "cancel" and the caller writes nothing.
 * Either way this component unmounts with its local state discarded — there
 * is no separate "restore" step because the parent was never touched to
 * begin with. The caller is responsible for remounting this component fresh
 * (e.g. via a `key` that changes) each time it opens, so `initialValues` is
 * always read anew.
 */
export function SectionEditorDialog({
  open,
  initialValues,
  sectionNumber,
  containerDishId,
  containerKind,
  onClose,
}: {
  open: boolean;
  initialValues: SectionInput;
  sectionNumber: number;
  containerDishId: string | null;
  containerKind: DishKindValue;
  onClose: (result: SectionEditorResult) => void;
}) {
  const form = useForm<SectionInput>({ defaultValues: initialValues });
  const { control, register } = form;
  const idPrefix = React.useId();

  const ingredients = useFieldArray({ control, name: "ingredients" });
  const instructions = useFieldArray({ control, name: "instructions" });
  const partLinks = useFieldArray({ control, name: "partLinks" });
  const ingredientSensors = useReorderSensors();
  const instructionSensors = useReorderSensors();

  const watchedName: string | null | undefined = useWatch({
    control,
    name: "name",
  });
  const sectionNumberLabel = `Section ${sectionNumber}`;
  const sectionTitle = `${sectionNumberLabel}${watchedName ? ` — ${watchedName}` : ""}`;

  function handleIngredientDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ingredients.fields.findIndex((f) => f.id === active.id);
    const newIndex = ingredients.fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    ingredients.move(oldIndex, newIndex);
  }

  function handleInstructionDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = instructions.fields.findIndex((f) => f.id === active.id);
    const newIndex = instructions.fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    instructions.move(oldIndex, newIndex);
  }

  function handleCancel() {
    onClose({ action: "cancel" });
  }

  // Section-local validation: anything fully determinable from this
  // Section alone is caught here, before Finish commits it into the parent
  // — cross-Section/whole-Dish validation stays at the parent's own final
  // Save (see `dish-editor.tsx`'s `onSubmit`, which keeps an equivalent
  // check as a defensive backstop for state that reaches it without going
  // through this modal, e.g. imported/malformed data).
  function handleFinish() {
    const values = form.getValues();
    form.clearErrors();

    let firstInvalidIndex: number | null = null;
    values.ingredients.forEach((ingredient, index) => {
      if (
        ingredient.substitute &&
        !isBlankSubstitute(ingredient.substitute) &&
        !ingredient.substitute.name?.trim()
      ) {
        form.setError(`ingredients.${index}.substitute.name` as never, {
          type: "manual",
          message: "Enter a substitute name, or remove the substitute.",
        });
        if (firstInvalidIndex === null) firstInvalidIndex = index;
      }
    });

    if (firstInvalidIndex !== null) {
      form.setFocus(
        `ingredients.${firstInvalidIndex}.substitute.name` as never,
      );
      return;
    }

    onClose({ action: "finish", values });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden px-0 sm:max-w-3xl"
      >
        {/* Mirrors DialogFooter's surface treatment; title and close button are row siblings so they center-align. Parent DialogContent has no horizontal padding (px-0), so only -mt-4 (not -mx-4) is needed to cancel its top padding. */}
        <DialogHeader className="bg-muted/50 -mt-4 flex shrink-0 flex-row items-center justify-between gap-2 rounded-t-xl border-b p-4">
          <DialogTitle>{sectionTitle}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" className="-my-1.5">
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogClose>
        </DialogHeader>

        <FormProvider {...form}>
          {/* Spans the full modal width (parent has no horizontal padding) so its scrollbar sits at the modal's right edge; `px-4` gives the content the same horizontal inset as the header/footer, and also room for focus rings. `pt-4 pb-4` replace the removed inter-region gap so the breathing room scrolls with the content. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-4">
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-name`}>Section name</FieldLabel>
              <Input
                id={`${idPrefix}-name`}
                placeholder="Optional, e.g. Sauce"
                {...register("name")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-guidance-note`}>
                Guidance note
              </FieldLabel>
              <Textarea
                id={`${idPrefix}-guidance-note`}
                placeholder="Optional, e.g. Best made one day ahead"
                className="min-h-8"
                {...register("guidanceNote")}
              />
            </Field>

            <div className="flex flex-col gap-2">
              <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Ingredients
              </h4>
              <DndContext
                id={`ingredients-${idPrefix}`}
                sensors={ingredientSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleIngredientDragEnd}
                accessibility={{
                  announcements: createReorderAnnouncements(
                    (rowId) => {
                      const index = ingredients.fields.findIndex(
                        (f) => f.id === rowId,
                      );
                      return index >= 0
                        ? `ingredient ${index + 1}`
                        : "ingredient";
                    },
                    (rowId) => ({
                      index: ingredients.fields.findIndex(
                        (f) => f.id === rowId,
                      ),
                      total: ingredients.fields.length,
                    }),
                  ),
                }}
              >
                <SortableContext
                  items={ingredients.fields.map((field) => field.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {ingredients.fields.map((field, ingredientIndex) => (
                    <IngredientFields
                      key={field.id}
                      id={field.id}
                      prefix={`ingredients.${ingredientIndex}`}
                      index={ingredientIndex}
                      onRemove={() => ingredients.remove(ingredientIndex)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 self-start"
                onClick={() => ingredients.append(BLANK_INGREDIENT)}
              >
                <Plus /> Add ingredient
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Instructions
              </h4>
              <DndContext
                id={`instructions-${idPrefix}`}
                sensors={instructionSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleInstructionDragEnd}
                accessibility={{
                  announcements: createReorderAnnouncements(
                    (rowId) => {
                      const index = instructions.fields.findIndex(
                        (f) => f.id === rowId,
                      );
                      return index >= 0
                        ? `instruction ${index + 1}`
                        : "instruction";
                    },
                    (rowId) => ({
                      index: instructions.fields.findIndex(
                        (f) => f.id === rowId,
                      ),
                      total: instructions.fields.length,
                    }),
                  ),
                }}
              >
                <SortableContext
                  items={instructions.fields.map((field) => field.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {instructions.fields.map((field, instructionIndex) => (
                    <InstructionFields
                      key={field.id}
                      id={field.id}
                      prefix={`instructions.${instructionIndex}`}
                      index={instructionIndex}
                      onRemove={() => instructions.remove(instructionIndex)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => instructions.append(BLANK_INSTRUCTION)}
              >
                <Plus /> Add instruction
              </Button>
            </div>

            {/* Instructions → Part-controls divider (localized, not the
                full-width modal-footer divider below). */}
            <div className="border-border border-t" />

            <div className="flex flex-wrap gap-2">
              <PartAttachPicker
                containerDishId={containerDishId}
                containerKind={containerKind}
                excludeDishId={containerDishId ?? undefined}
                onAttach={(link) =>
                  partLinks.append({
                    ...link,
                    position: partLinks.fields.length,
                    multiplier: 1,
                  })
                }
              />
              <CreatePartLink />
            </div>
          </div>
        </FormProvider>

        {/* DialogFooter already supplies the full-width divider above the
            footer and the app's standard bottom-right action alignment
            (Cancel, then the primary action last). `shrink-0` keeps it
            pinned at the bottom, matching the header, so only the middle
            content region (`flex-1 min-h-0` above) absorbs overflow via its
            own scrollbar. Parent DialogContent has no horizontal padding
            (px-0), so its default `-mx-4` is overridden to `mx-0` — only
            `-mb-4` (from the default classes) is still needed to cancel the
            parent's bottom padding. */}
        <DialogFooter className="mx-0 shrink-0">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="button" onClick={handleFinish}>
            Finish section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
