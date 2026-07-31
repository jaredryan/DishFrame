"use client";

import { Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DragHandle } from "@/components/ui/drag-handle";
import { TooltipIconButton } from "@/components/domain/dish/reorder-buttons";

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
//
// Slice 6A: no Collapse action here (an Instruction row has nothing
// meaningful to hide — unlike a Section/Ingredient, it's already just one
// field) — only Remove. The textarea starts at roughly an ordinary input's
// height (`rows={1}`) and grows with content via the shared Textarea's
// `field-sizing-content`, rather than opening unnecessarily tall.
export function InstructionFields({
  id,
  prefix,
  index,
  onRemove,
}: {
  id: string;
  prefix: string;
  index: number;
  onRemove: () => void;
}) {
  const { register } = useFormContext();
  const idPrefix = prefix.replace(/\./g, "-");
  const label = `instruction ${index + 1}`;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <DragHandle
        label={`Drag to reorder ${label}`}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
      />
      <span className="text-muted-foreground text-sm tabular-nums">
        {index + 1}.
      </span>
      <Field className="flex-1">
        <FieldLabel htmlFor={`${idPrefix}-text`} className="sr-only">
          Instruction {index + 1}
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-text`}
          placeholder="What do you do in this step?"
          className="min-h-8"
          rows={1}
          {...register(`${prefix}.text`)}
        />
      </Field>
      <TooltipIconButton
        label={`Remove ${label}`}
        icon={Trash2}
        onClick={onRemove}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      />
    </div>
  );
}
