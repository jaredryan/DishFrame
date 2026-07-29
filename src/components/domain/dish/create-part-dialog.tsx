"use client";

import * as React from "react";
import { PackagePlus, Plus } from "lucide-react";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IngredientFields } from "@/components/domain/dish/ingredient-fields";
import { InstructionFields } from "@/components/domain/dish/instruction-fields";
import { useReorderSensors } from "@/lib/dnd/sensors";
import { createReorderAnnouncements } from "@/lib/dnd/announcements";
import { createDish } from "@/lib/dishes/actions";
import { listAttachablePartVersions } from "@/lib/sections/actions";
import type { IngredientInput, InstructionInput } from "@/lib/dishes/schema";

const BLANK_INGREDIENT: IngredientInput = {
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

const BLANK_INSTRUCTION: InstructionInput = { text: "" };

type CreatePartFormValues = {
  title: string;
  description: string;
  ingredients: IngredientInput[];
  instructions: InstructionInput[];
};

const BLANK_CREATE_PART_FORM: CreatePartFormValues = {
  title: "",
  description: "",
  ingredients: [],
  instructions: [],
};

/**
 * Settled Review Gate 3 decision, PRODUCT_SPEC.md §69: "Create Part" —
 * collects name/optional description/content, creates the standalone Part
 * via the ordinary `createDish` action, then adds one link to it in the
 * current parent draft at the caller-chosen position. The new Part persists
 * immediately; the parent link stays in the parent's local draft until the
 * parent's own normal Save (this dialog never touches the parent's form
 * submission itself — `onCreated` just appends a field-array entry).
 */
export function CreatePartDialog({
  onCreated,
}: {
  onCreated: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<CreatePartFormValues>({
    defaultValues: BLANK_CREATE_PART_FORM,
  });
  const { control, register, handleSubmit, reset } = form;
  const ingredients = useFieldArray({ control, name: "ingredients" });
  const instructions = useFieldArray({ control, name: "instructions" });
  const ingredientSensors = useReorderSensors();
  const instructionSensors = useReorderSensors();

  function close() {
    setOpen(false);
    setError(null);
    reset(BLANK_CREATE_PART_FORM);
  }

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

  async function onSubmit(values: CreatePartFormValues) {
    const trimmedIngredients = values.ingredients.filter(
      (ingredient) => ingredient.name.trim().length > 0,
    );
    const trimmedInstructions = values.instructions.filter(
      (instruction) => instruction.text.trim().length > 0,
    );
    if (trimmedIngredients.length === 0 && trimmedInstructions.length === 0) {
      setError("Add at least one ingredient or instruction.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await createDish("PART", {
      title: values.title,
      stage: "IDEA",
      cuisine: null,
      description: values.description.trim() || null,
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

    // The freshly created Part has exactly one Version (V1.0) — resolving
    // it here rather than widening `createDish`'s return shape for every
    // other caller just to carry a version id this is the only user of.
    const versions = await listAttachablePartVersions(result.dishId);
    setIsSubmitting(false);
    const newVersion =
      versions.status === "success" ? versions.versions[0] : null;
    if (!newVersion) {
      setError("The Part was created, but its version could not be resolved.");
      return;
    }

    onCreated({
      targetDishId: result.dishId,
      targetDishVersionId: newVersion.id,
    });
    close();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <PackagePlus /> Create Part
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a new Part</DialogTitle>
            <DialogDescription>
              Creates a standalone, reusable Part and links it here. The Part
              saves right away; this item&apos;s own link only saves when you
              save it.
            </DialogDescription>
          </DialogHeader>
          <FormProvider {...form}>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex flex-col gap-4"
            >
              <Field>
                <FieldLabel htmlFor="new-part-title">Part name</FieldLabel>
                <Input
                  id="new-part-title"
                  autoFocus
                  placeholder="e.g. Nuoc Cham"
                  {...register("title", { required: true })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-part-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="new-part-description"
                  placeholder="Optional"
                  {...register("description")}
                />
              </Field>

              <div className="flex flex-col gap-2">
                <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Ingredients
                </h4>
                <DndContext
                  id="create-part-ingredients"
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
                    {ingredients.fields.map((field, index) => (
                      <IngredientFields
                        key={field.id}
                        id={field.id}
                        prefix={`ingredients.${index}`}
                        index={index}
                        onRemove={() => ingredients.remove(index)}
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
                  id="create-part-instructions"
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
                    {instructions.fields.map((field, index) => (
                      <InstructionFields
                        key={field.id}
                        id={field.id}
                        prefix={`instructions.${index}`}
                        index={index}
                        onRemove={() => instructions.remove(index)}
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

              {error && <p className="text-destructive text-sm">{error}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating…" : "Create and link"}
                </Button>
              </DialogFooter>
            </form>
          </FormProvider>
        </DialogContent>
      </Dialog>
    </>
  );
}
