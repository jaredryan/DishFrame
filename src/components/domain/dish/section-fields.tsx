"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReorderButtons } from "@/components/domain/dish/reorder-buttons";
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
  sectionIndex,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  sectionIndex: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { control, register, watch } = useFormContext();
  const prefix = `sections.${sectionIndex}`;
  const sectionName: string = watch(`${prefix}.name`);

  const ingredients = useFieldArray({ control, name: `${prefix}.ingredients` });
  const instructions = useFieldArray({
    control,
    name: `${prefix}.instructions`,
  });

  return (
    <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Input
            placeholder="Section name (optional, e.g. Sauce)"
            aria-label={`Section ${sectionIndex + 1} name`}
            {...register(`${prefix}.name`)}
          />
          <Textarea
            placeholder="Guidance note (optional, e.g. Best made one day ahead)"
            aria-label={`Section ${sectionIndex + 1} guidance note`}
            className="min-h-8"
            {...register(`${prefix}.guidanceNote`)}
          />
        </div>
        <div className="flex flex-col items-end gap-1">
          <ReorderButtons
            label={sectionName || `section ${sectionIndex + 1}`}
            isFirst={isFirst}
            isLast={isLast}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            aria-label={`Remove ${sectionName || `section ${sectionIndex + 1}`}`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Ingredients
        </h4>
        {ingredients.fields.map((field, ingredientIndex) => (
          <IngredientFields
            key={field.id}
            prefix={`${prefix}.ingredients.${ingredientIndex}`}
            index={ingredientIndex}
            isFirst={ingredientIndex === 0}
            isLast={ingredientIndex === ingredients.fields.length - 1}
            onMoveUp={() =>
              ingredients.move(ingredientIndex, ingredientIndex - 1)
            }
            onMoveDown={() =>
              ingredients.move(ingredientIndex, ingredientIndex + 1)
            }
            onRemove={() => ingredients.remove(ingredientIndex)}
          />
        ))}
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
        {instructions.fields.map((field, instructionIndex) => (
          <InstructionFields
            key={field.id}
            prefix={`${prefix}.instructions.${instructionIndex}`}
            index={instructionIndex}
            isFirst={instructionIndex === 0}
            isLast={instructionIndex === instructions.fields.length - 1}
            onMoveUp={() =>
              instructions.move(instructionIndex, instructionIndex - 1)
            }
            onMoveDown={() =>
              instructions.move(instructionIndex, instructionIndex + 1)
            }
            onRemove={() => instructions.remove(instructionIndex)}
          />
        ))}
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
