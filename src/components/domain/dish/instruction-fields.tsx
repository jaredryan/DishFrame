"use client";

import { Trash2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReorderButtons } from "@/components/domain/dish/reorder-buttons";

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
export function InstructionFields({
  prefix,
  index,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  prefix: string;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const { register } = useFormContext();

  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-2 text-sm tabular-nums">
        {index + 1}.
      </span>
      <Textarea
        placeholder="Instruction step"
        aria-label={`Instruction ${index + 1}`}
        className="min-h-10 flex-1"
        {...register(`${prefix}.text`)}
      />
      <div className="flex flex-col items-end gap-1">
        <ReorderButtons
          label={`instruction ${index + 1}`}
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
          aria-label={`Remove instruction ${index + 1}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
