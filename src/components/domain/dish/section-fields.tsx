"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DragHandle } from "@/components/ui/drag-handle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { ItemToolbar } from "@/components/domain/dish/reorder-buttons";
import { IngredientFields } from "@/components/domain/dish/ingredient-fields";
import { InstructionFields } from "@/components/domain/dish/instruction-fields";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import { PartAttachPicker } from "@/components/domain/dish/part-attach-picker";
import { CreatePartLink } from "@/components/domain/dish/create-part-link";
import { ConvertSectionToPartDialog } from "@/components/domain/dish/convert-section-to-part-dialog";
import { formatIngredientLine } from "@/lib/dishes/format";
import type { DetachedContent } from "@/lib/sections/service";
import type {
  DishKindValue,
  IngredientInput,
  InstructionInput,
} from "@/lib/dishes/schema";

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

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
export function SectionFields({
  id,
  sectionIndex,
  onRemove,
  onConvertToPart,
  containerDishId,
  containerKind,
  startOpen = false,
}: {
  id: string;
  sectionIndex: number;
  onRemove: () => void;
  onConvertToPart: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
  containerDishId: string | null;
  containerKind: DishKindValue;
  // The Section modal never opens on its own — not for a freshly loaded
  // page, not for a brand-new Section with no saved content, not for an
  // import-review proposal. It opens only for an explicit "Edit" click
  // (handled locally below) or an explicit "Add section" click, which the
  // parent DishEditor signals by passing `startOpen: true` for exactly the
  // row it just appended. Read once at mount, same as `editing` itself.
  startOpen?: boolean;
}) {
  const { control, register, watch } = useFormContext();
  const prefix = `sections.${sectionIndex}`;
  const idPrefix = prefix.replace(/\./g, "-");
  const sectionName: string = watch(`${prefix}.name`);
  const guidanceNote: string = watch(`${prefix}.guidanceNote`);
  // `editing` doubles as the Section modal's own open state — see the
  // Dialog below.
  const [editing, setEditing] = React.useState(startOpen);
  const watchedIngredients: IngredientInput[] =
    useWatch({ control, name: `${prefix}.ingredients` }) ?? [];
  const watchedInstructions: InstructionInput[] =
    useWatch({ control, name: `${prefix}.instructions` }) ?? [];

  const ingredients = useFieldArray({ control, name: `${prefix}.ingredients` });
  const instructions = useFieldArray({
    control,
    name: `${prefix}.instructions`,
  });
  const partLinks = useFieldArray({ control, name: `${prefix}.partLinks` });
  const ingredientSensors = useReorderSensors();
  const instructionSensors = useReorderSensors();

  // Slice 6, PRODUCT_SPEC.md §70.1: detaching content nested inside a
  // Section flattens the target Part Version's own Ingredients/
  // Instructions (across all of its Sections) directly into this
  // container Section, and promotes every linked Part it carried (its own
  // top-level links and any nested inside its Sections) into this
  // Section's own linked Parts — this schema has no way to nest a Section
  // inside a Section, so a whole extracted Part's structure collapses into
  // the one Section it was attached to. A top-level detach (DishEditor)
  // instead keeps each of the target's Sections intact as brand-new
  // top-level Sections, since there's room for that at the container level.
  function handleDetach(partLinkIndex: number, content: DetachedContent) {
    // `useFieldArray`'s `.fields` doesn't update synchronously between
    // multiple `.append()` calls in one handler, so a running counter (not
    // `partLinks.fields.length` re-read each time) is what keeps each
    // newly-appended nested occurrence's position distinct.
    let nextPosition = partLinks.fields.length;
    content.sections.forEach((detachedSection) => {
      detachedSection.ingredients.forEach((ingredient) =>
        ingredients.append(ingredient),
      );
      detachedSection.instructions.forEach((instruction) =>
        instructions.append(instruction),
      );
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

  const label = sectionName || `section ${sectionIndex + 1}`;
  const sectionNumberLabel = `Section ${sectionIndex + 1}`;
  const sectionTitle = `${sectionNumberLabel}${sectionName ? ` — ${sectionName}` : ""}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4"
    >
      {/* Design remediation pass: full-width header row — drag handle far
          left, a live numbered title, actions far right. Clicking the Edit
          action now opens the Section editor in a modal (below) rather than
          expanding this row inline; this collapsed representation is the
          parent page's permanent view of the Section. */}
      <div className="flex items-center gap-2">
        <DragHandle
          label={`Drag to reorder ${label}`}
          attributes={attributes}
          listeners={listeners}
          isDragging={isDragging}
        />
        <h3 className="font-heading text-foreground min-w-0 flex-1 truncate text-base font-medium">
          {sectionTitle}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          <ConvertSectionToPartDialog
            prefix={prefix}
            sectionLabel={label}
            defaultName={sectionName || ""}
            onConverted={onConvertToPart}
          />
          <ItemToolbar
            label={label}
            toggleLabel={sectionName || sectionNumberLabel}
            variant="edit"
            collapsed={!editing}
            onToggleCollapsed={() => setEditing((prev) => !prev)}
            onRemove={onRemove}
          />
        </div>
      </div>

      {guidanceNote && (
        <p className="text-muted-foreground text-xs italic">{guidanceNote}</p>
      )}

      {/* Slice 6 correction pass §4: view-first by default — concise
          formatted content, not empty editable fields. Editing (added
          ingredients/instructions, reordering, substitutes) requires the
          explicit Edit action above, which now opens the Section modal. */}
      <div className="flex flex-col gap-3">
        {watchedIngredients.length > 0 && (
          <ul className="flex flex-col gap-1">
            {watchedIngredients.map((ingredient, index) => (
              <li key={index} className="text-sm">
                {formatIngredientLine(ingredient)}
                {ingredient.isOptional && (
                  <span className="text-muted-foreground"> (optional)</span>
                )}
                {ingredient.substitute && (
                  <span className="text-muted-foreground block pl-4 text-xs">
                    Substitute: {formatIngredientLine(ingredient.substitute)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {watchedInstructions.length > 0 && (
          <ol className="flex flex-col gap-1.5">
            {watchedInstructions.map((instruction, index) => (
              <li key={index} className="flex gap-2 text-sm">
                <span className="text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>
                <span>{instruction.text}</span>
              </li>
            ))}
          </ol>
        )}
        {watchedIngredients.length === 0 &&
          watchedInstructions.length === 0 &&
          partLinks.fields.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No content yet — Edit to add ingredients or instructions.
            </p>
          )}
      </div>

      {partLinks.fields.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Linked Parts
          </h4>
          {partLinks.fields.map((field, partLinkIndex) => (
            <PartLinkFields
              key={field.id}
              id={field.id}
              prefix={`${prefix}.partLinks.${partLinkIndex}`}
              containerKind={containerKind}
              onRemove={() => partLinks.remove(partLinkIndex)}
              onDetach={(content) => handleDetach(partLinkIndex, content)}
            />
          ))}
        </div>
      )}

      {/* Structural presentation change: the Section editor itself is
          unchanged — only its container moved from an inline expansion to a
          modal. `max-w-3xl` reuses DishEditor's own outer content width
          (src/components/domain/dish/dish-editor.tsx) so the editable
          content area matches what it was inline; the default `p-4` inset
          is unchanged from DialogContent's base styling. Closing the modal
          by any means (Finish section, the X button, Escape, or an overlay
          click) collapses the Section the same way — none of it is a save;
          the Section's field values already live in the parent form via
          react-hook-form and are unaffected by this modal mounting or
          unmounting. */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{sectionTitle}</DialogTitle>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor={`${idPrefix}-name`}>Section name</FieldLabel>
            <Input
              id={`${idPrefix}-name`}
              placeholder="Optional, e.g. Sauce"
              {...register(`${prefix}.name`)}
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
              {...register(`${prefix}.guidanceNote`)}
            />
          </Field>

          <div className="flex flex-col gap-2">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Ingredients
            </h4>
            <DndContext
              id={`ingredients-${id}`}
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
                    index: ingredients.fields.findIndex((f) => f.id === rowId),
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
                    prefix={`${prefix}.ingredients.${ingredientIndex}`}
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
              <Plus /> Add another ingredient
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Instructions
            </h4>
            <DndContext
              id={`instructions-${id}`}
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
                    index: instructions.fields.findIndex((f) => f.id === rowId),
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
                    prefix={`${prefix}.instructions.${instructionIndex}`}
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

          {/* Same Finish model as IngredientFields, one level up — now also
              the modal's natural completion action. */}
          <Button
            type="button"
            size="sm"
            className="self-start"
            onClick={() => setEditing(false)}
          >
            Finish section
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
