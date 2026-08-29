import * as React from "react";
import { Replace } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PartLinkPickerDialog } from "@/components/domain/dish/part-link-picker-dialog";
import type { DishKindValue } from "@/lib/dishes/schema";

/**
 * "This inline Section should instead be represented by one of my existing
 * Parts." Reuses `PartLinkPickerDialog` — the same Part-only, single-select
 * candidate fetch, ownership/cycle validation, and current/historical
 * Version choice as "Attach a Part" (`PartAttachPicker`) — so this is a
 * trigger + copy wrapper only, no separate Part-linking implementation.
 * Discards the Section's current content; the caller (`SectionFields`,
 * `SectionEditorDialog`) is responsible for putting the resolved link in the
 * Section's exact position — this component never touches the editor draft
 * itself.
 */
export function ReplaceSectionWithPartDialog({
  containerDishId,
  containerKind,
  excludeDishId,
  sectionLabel,
  sectionName,
  onReplaced,
  // "icon" (default) matches the section card's compact toolbar row. The
  // Section modal instead renders this as an ordinary labeled footer
  // button, alongside "Convert to part".
  triggerVariant = "icon",
}: {
  containerDishId: string | null;
  containerKind: DishKindValue;
  excludeDishId?: string;
  sectionLabel: string;
  sectionName: string;
  onReplaced: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
  triggerVariant?: "icon" | "button";
}) {
  const [open, setOpen] = React.useState(false);
  const displayName = sectionName || sectionLabel;

  return (
    <>
      {triggerVariant === "button" ? (
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          <Replace aria-hidden="true" /> Replace with Part
        </Button>
      ) : (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(true)}
                aria-label={`Replace ${sectionLabel} with an existing Part`}
              >
                <Replace aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Replace {sectionLabel} with an existing Part
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <PartLinkPickerDialog
        open={open}
        onOpenChange={setOpen}
        containerDishId={containerDishId}
        containerKind={containerKind}
        excludeDishId={excludeDishId}
        initialSearch={sectionName}
        dialogTitle="Replace with Part"
        dialogDescription="Replace this section with a saved Part. This discards the section's current content."
        confirmLabel="Replace"
        contextualNote={(part) =>
          `${part.currentTitle ?? "This Part"} will replace the "${displayName}" section.`
        }
        onConfirm={onReplaced}
      />
    </>
  );
}
