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
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { ItemToolbar } from "@/components/domain/dish/reorder-buttons";
import { IngredientFields } from "@/components/domain/dish/ingredient-fields";
import { InstructionFields } from "@/components/domain/dish/instruction-fields";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import {
  PartAttachPicker,
  type AttachablePartOption,
} from "@/components/domain/dish/part-attach-picker";
import { CreatePartDialog } from "@/components/domain/dish/create-part-dialog";
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
  attachableParts,
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
  attachableParts: AttachablePartOption[];
}) {
  const { control, register, watch, getValues } = useFormContext();
  const prefix = `sections.${sectionIndex}`;
  const idPrefix = prefix.replace(/\./g, "-");
  const sectionName: string = watch(`${prefix}.name`);
  const guidanceNote: string = watch(`${prefix}.guidanceNote`);
  // Slice 6 correction pass §4: view-first by default — but only once
  // there's saved content to view. A brand-new Section (no `lineageId` yet,
  // added via "Add section" in this same editing session) has nothing to
  // show, so it starts in edit mode instead; a Section loaded from an
  // existing saved Dish starts view-first. Read once at mount (a
  // `lineageId`, once assigned, never changes for the lifetime of this row).
  const [editing, setEditing] = React.useState(
    () => !getValues(`${prefix}.lineageId`),
  );
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
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 items-start gap-2">
          <DragHandle
            label={`Drag to reorder ${label}`}
            attributes={attributes}
            listeners={listeners}
            isDragging={isDragging}
          />
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              {sectionNumberLabel}
            </p>
            {editing ? (
              <>
                <Field>
                  <FieldLabel htmlFor={`${idPrefix}-name`}>
                    Section name
                  </FieldLabel>
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
              </>
            ) : (
              <div>
                <h3 className="font-heading text-base font-medium">
                  {sectionName || sectionNumberLabel}
                </h3>
                {guidanceNote && (
                  <p className="text-muted-foreground text-xs italic">
                    {guidanceNote}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <ItemToolbar
          label={label}
          collapsed={!editing}
          onToggleCollapsed={() => setEditing((prev) => !prev)}
          onRemove={onRemove}
        />
      </div>

      <ConvertSectionToPartDialog
        prefix={prefix}
        sectionLabel={label}
        defaultName={sectionName || ""}
        onConverted={onConvertToPart}
      />

      {/* Slice 6 correction pass §4: view-first by default — concise
          formatted content, not empty editable fields. Editing (added
          ingredients/instructions, reordering, substitutes) requires the
          explicit Edit action above. */}
      {editing ? (
        <>
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
              className="self-start"
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
        </>
      ) : (
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
      )}

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
              onRemove={() => partLinks.remove(partLinkIndex)}
              onDetach={(content) => handleDetach(partLinkIndex, content)}
            />
          ))}
        </div>
      )}
      {editing && (
        <div className="flex flex-wrap gap-2">
          <PartAttachPicker
            containerDishId={containerDishId}
            containerKind={containerKind}
            attachableParts={attachableParts}
            onAttach={(link) =>
              partLinks.append({
                ...link,
                position: partLinks.fields.length,
                multiplier: 1,
              })
            }
          />
          <CreatePartDialog
            onCreated={(link) =>
              partLinks.append({
                ...link,
                position: partLinks.fields.length,
                multiplier: 1,
              })
            }
          />
        </div>
      )}
    </div>
  );
}
