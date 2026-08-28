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
  arrayMove,
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
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import { PartAttachPicker } from "@/components/domain/dish/part-attach-picker";
import { CreatePartLink } from "@/components/domain/dish/create-part-link";
import { ConvertSectionToPartDialog } from "@/components/domain/dish/convert-section-to-part-dialog";
import { isBlankSubstitute } from "@/lib/dishes/schema";
import type {
  DishKindValue,
  InstructionInput,
  PartLinkInput,
  SectionInput,
} from "@/lib/dishes/schema";
import type { DetachedContent } from "@/lib/sections/service";

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
  | { action: "finish"; values: SectionInput }
  | { action: "cancel" }
  | {
      action: "convert-to-part";
      link: { targetDishId: string; targetDishVersionId: string };
    };

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
  const contentSensors = useReorderSensors();

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

  // A Section-nested attached Part used to disappear from this modal
  // entirely once attached — `partLinks` was appended to but nothing here
  // ever rendered it, only the outer collapsed card did (`SectionFields`).
  // This merges `instructions`/`partLinks` for rendering and reordering
  // only, the same "two field arrays, one shared `position` sequence"
  // pattern `dish-editor.tsx` already uses for top-level Sections/PartLinks
  // (see `sectionContentSequence`'s doc comment in schema.ts) — so a Part
  // can sit between two instructions, not just before or after all of them.
  const watchedInstructions: InstructionInput[] =
    useWatch({ control, name: "instructions" }) ?? [];
  const watchedPartLinks: PartLinkInput[] =
    useWatch({ control, name: "partLinks" }) ?? [];

  type ContentEntry =
    | {
        kind: "instruction";
        fieldId: string;
        index: number;
        position: number;
      }
    | { kind: "partLink"; fieldId: string; index: number; position: number };

  const contentEntries: ContentEntry[] = [
    ...instructions.fields.map((field, index) => ({
      kind: "instruction" as const,
      fieldId: field.id,
      index,
      position: watchedInstructions[index]?.position ?? index,
    })),
    ...partLinks.fields.map((field, index) => ({
      kind: "partLink" as const,
      fieldId: field.id,
      index,
      position: watchedPartLinks[index]?.position ?? index,
    })),
  ].sort((a, b) => a.position - b.position);

  // Numbering for InstructionFields' "N." label must reflect the current
  // merged display order (skipping Part rows), not the raw `instructions`
  // fieldArray index, which goes stale as soon as content is dragged.
  const instructionDisplayNumberByFieldId = new Map<string, number>();
  {
    let ordinal = 0;
    contentEntries.forEach((entry) => {
      if (entry.kind === "instruction") {
        ordinal += 1;
        instructionDisplayNumberByFieldId.set(entry.fieldId, ordinal);
      }
    });
  }

  function nextContentPosition(): number {
    return contentEntries.length === 0
      ? 0
      : Math.max(...contentEntries.map((entry) => entry.position)) + 1;
  }

  function handleContentDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = contentEntries.findIndex((e) => e.fieldId === active.id);
    const newIndex = contentEntries.findIndex((e) => e.fieldId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(contentEntries, oldIndex, newIndex);
    reordered.forEach((entry, position) => {
      if (entry.position === position) return;
      if (entry.kind === "instruction") {
        form.setValue(`instructions.${entry.index}.position`, position, {
          shouldDirty: true,
        });
      } else {
        form.setValue(`partLinks.${entry.index}.position`, position, {
          shouldDirty: true,
        });
      }
    });
  }

  const contentAnnouncements = createReorderAnnouncements(
    (id) => {
      const entry = contentEntries.find((e) => e.fieldId === id);
      if (!entry) return "item";
      return entry.kind === "instruction"
        ? `instruction ${instructionDisplayNumberByFieldId.get(id) ?? entry.index + 1}`
        : "linked part";
    },
    (id) => ({
      index: contentEntries.findIndex((e) => e.fieldId === id),
      total: contentEntries.length,
    }),
  );

  // Mirrors `SectionFields`' own `handleDetach` (outer collapsed card) —
  // same §70.1 flattening rule — but operates directly on this modal's own
  // isolated `ingredients`/`instructions`/`partLinks` arrays instead of a
  // `prefix`-qualified parent path, since this form's root already *is* the
  // Section.
  function handleDetach(partLinkIndex: number, content: DetachedContent) {
    let nextPosition = nextContentPosition();
    content.sections.forEach((detachedSection) => {
      detachedSection.ingredients.forEach((ingredient) =>
        ingredients.append(ingredient),
      );
      detachedSection.instructions.forEach((instruction) => {
        instructions.append({ ...instruction, position: nextPosition });
        nextPosition += 1;
      });
      detachedSection.partLinks.forEach((link) => {
        partLinks.append({ ...link, position: nextPosition });
        nextPosition += 1;
      });
    });
    content.partLinks.forEach((link) => {
      partLinks.append({ ...link, position: nextPosition });
      nextPosition += 1;
    });
    partLinks.remove(partLinkIndex);
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

    // Renumbers every Instruction/PartLink `position` contiguously (0..N-1)
    // to match the merged list's current display order — resolves any
    // leftover position ambiguity from content that predates this merged
    // ordering (see `sectionContentSequence`'s doc comment in schema.ts),
    // not just content actually dragged this session.
    const combined = [
      ...values.instructions.map((instruction, index) => ({
        kind: "instruction" as const,
        index,
        position: instruction.position ?? index,
      })),
      ...values.partLinks.map((partLink, index) => ({
        kind: "partLink" as const,
        index,
        position: partLink.position,
      })),
    ].sort((a, b) => a.position - b.position);
    combined.forEach((entry, position) => {
      if (entry.kind === "instruction") {
        values.instructions[entry.index] = {
          ...values.instructions[entry.index],
          position,
        };
      } else {
        values.partLinks[entry.index] = {
          ...values.partLinks[entry.index],
          position,
        };
      }
    });

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
                {partLinks.fields.length > 0
                  ? "Instructions & attached Parts"
                  : "Instructions"}
              </h4>
              <DndContext
                id={`content-${idPrefix}`}
                sensors={contentSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleContentDragEnd}
                accessibility={{ announcements: contentAnnouncements }}
              >
                <SortableContext
                  items={contentEntries.map((entry) => entry.fieldId)}
                  strategy={verticalListSortingStrategy}
                >
                  {contentEntries.map((entry) =>
                    entry.kind === "instruction" ? (
                      <InstructionFields
                        key={entry.fieldId}
                        id={entry.fieldId}
                        prefix={`instructions.${entry.index}`}
                        index={
                          (instructionDisplayNumberByFieldId.get(
                            entry.fieldId,
                          ) ?? 1) - 1
                        }
                        onRemove={() => instructions.remove(entry.index)}
                      />
                    ) : (
                      <PartLinkFields
                        key={entry.fieldId}
                        id={entry.fieldId}
                        prefix={`partLinks.${entry.index}`}
                        containerKind={containerKind}
                        onRemove={() => partLinks.remove(entry.index)}
                        onDetach={(content) =>
                          handleDetach(entry.index, content)
                        }
                      />
                    ),
                  )}
                </SortableContext>
              </DndContext>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    instructions.append({
                      ...BLANK_INSTRUCTION,
                      position: nextContentPosition(),
                    })
                  }
                >
                  <Plus /> Add instruction
                </Button>
                <PartAttachPicker
                  containerDishId={containerDishId}
                  containerKind={containerKind}
                  excludeDishId={containerDishId ?? undefined}
                  onAttach={(link) =>
                    partLinks.append({
                      ...link,
                      position: nextContentPosition(),
                      multiplier: 1,
                    })
                  }
                />
                <CreatePartLink />
              </div>
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
        <DialogFooter className="mx-0 shrink-0 sm:justify-between">
          <FormProvider {...form}>
            <ConvertSectionToPartDialog
              prefix=""
              sectionLabel={sectionTitle}
              defaultName={watchedName || ""}
              triggerVariant="button"
              onConverted={(link) =>
                onClose({ action: "convert-to-part", link })
              }
            />
          </FormProvider>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="button" onClick={handleFinish}>
              Finish section
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
