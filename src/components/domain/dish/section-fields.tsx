"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
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
}: {
  id: string;
  sectionIndex: number;
  onRemove: () => void;
}) {
  const { control, register, watch } = useFormContext();
  const prefix = `sections.${sectionIndex}`;
  const idPrefix = prefix.replace(/\./g, "-");
  const sectionName: string = watch(`${prefix}.name`);
  const [collapsed, setCollapsed] = React.useState(false);

  const ingredients = useFieldArray({ control, name: `${prefix}.ingredients` });
  const instructions = useFieldArray({
    control,
    name: `${prefix}.instructions`,
  });
  const ingredientSensors = useReorderSensors();
  const instructionSensors = useReorderSensors();

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

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-border bg-card flex items-center justify-between gap-2 rounded-xl border p-4"
      >
        <div className="flex items-center gap-2">
          <DragHandle
            label={`Drag to reorder ${label}`}
            attributes={attributes}
            listeners={listeners}
            isDragging={isDragging}
          />
          <div>
            <p className="text-muted-foreground text-xs">
              {sectionNumberLabel}
            </p>
            <h3 className="font-heading text-base font-medium">
              {sectionName || sectionNumberLabel}
            </h3>
            <p className="text-muted-foreground text-sm">
              {ingredients.fields.length} ingredient
              {ingredients.fields.length === 1 ? "" : "s"},{" "}
              {instructions.fields.length} instruction
              {instructions.fields.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <ItemToolbar
          label={label}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(false)}
          onRemove={onRemove}
        />
      </div>
    );
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
          </div>
        </div>
        <ItemToolbar
          label={label}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(true)}
          onRemove={onRemove}
        />
      </div>

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
                return index >= 0 ? `ingredient ${index + 1}` : "ingredient";
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
                return index >= 0 ? `instruction ${index + 1}` : "instruction";
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
    </div>
  );
}
