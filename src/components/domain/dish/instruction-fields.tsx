"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldLabel } from "@/components/ui/field";
import { DragHandle } from "@/components/ui/drag-handle";
import { ItemToolbar } from "@/components/domain/dish/reorder-buttons";

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
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
  const { register, watch } = useFormContext();
  const idPrefix = prefix.replace(/\./g, "-");
  const label = `instruction ${index + 1}`;
  const [collapsed, setCollapsed] = React.useState(false);
  const text: string = watch(`${prefix}.text`);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="border-border bg-card flex items-start justify-between gap-2 rounded-lg border p-3"
      >
        <div className="flex items-start gap-2">
          <DragHandle
            label={`Drag to reorder ${label}`}
            attributes={attributes}
            listeners={listeners}
            isDragging={isDragging}
          />
          <p className="flex gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">
              {index + 1}.
            </span>
            <span className="line-clamp-2">{text || "(empty)"}</span>
          </p>
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
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      <DragHandle
        label={`Drag to reorder ${label}`}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
        className="mt-6"
      />
      <span className="text-muted-foreground mt-7 text-sm tabular-nums">
        {index + 1}.
      </span>
      <Field className="flex-1">
        <FieldLabel htmlFor={`${idPrefix}-text`}>
          Instruction {index + 1}
        </FieldLabel>
        <Textarea
          id={`${idPrefix}-text`}
          placeholder="What do you do in this step?"
          className="min-h-10"
          aria-label={`Instruction ${index + 1}`}
          {...register(`${prefix}.text`)}
        />
      </Field>
      <div className="mt-6">
        <ItemToolbar
          label={label}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed(true)}
          onRemove={onRemove}
        />
      </div>
    </div>
  );
}
