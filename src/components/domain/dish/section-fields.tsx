import * as React from "react";
import { Copy } from "lucide-react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DragHandle } from "@/components/ui/drag-handle";
import {
  ItemToolbar,
  TooltipIconButton,
} from "@/components/domain/dish/reorder-buttons";
import { PartLinkFields } from "@/components/domain/dish/part-link-fields";
import { ConvertSectionToPartDialog } from "@/components/domain/dish/convert-section-to-part-dialog";
import {
  SectionEditorDialog,
  type SectionEditorResult,
} from "@/components/domain/dish/section-editor-dialog";
import { formatIngredientLine } from "@/lib/dishes/format";
import type { DetachedContent } from "@/lib/sections/service";
import type {
  DishKindValue,
  IngredientInput,
  InstructionInput,
  PartLinkInput,
  SectionInput,
} from "@/lib/dishes/schema";

// Untyped useFormContext — see ingredient-fields.tsx's doc comment.
export function SectionFields({
  id,
  sectionIndex,
  sectionNumber,
  onRemove,
  onDuplicate,
  onConvertToPart,
  containerDishId,
  containerKind,
}: {
  id: string;
  sectionIndex: number;
  // The Section's ordinal among top-level Sections only (skipping
  // top-level linked Parts), in the current drag-and-drop-derived display
  // order — not `sectionIndex`, which is the underlying `sections`
  // fieldArray index and goes stale on reorder (see `dish-editor.tsx`'s
  // `sectionDisplayNumberByFieldId`).
  sectionNumber: number;
  onRemove: () => void;
  // Inserts an independent copy of this Section right after it — see
  // `dish-editor.tsx`'s `handleDuplicateSection`/`duplicateSectionContent`
  // for what "independent" covers (fresh lineageIds, no nested linked
  // Parts).
  onDuplicate: () => void;
  onConvertToPart: (link: {
    targetDishId: string;
    targetDishVersionId: string;
  }) => void;
  containerDishId: string | null;
  containerKind: DishKindValue;
}) {
  const { control, watch, getValues, setValue } = useFormContext();
  const prefix = `sections.${sectionIndex}`;
  const sectionName: string = watch(`${prefix}.name`);
  const guidanceNote: string = watch(`${prefix}.guidanceNote`);
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

  // The Section modal never opens on its own — not for a freshly loaded
  // page, not for a brand-new Section with no saved content, not for an
  // import-review proposal. It opens only for an explicit "Edit" click,
  // which snapshots the Section's current values into `snapshot` and hands
  // that snapshot to `SectionEditorDialog` as an isolated editing session
  // (see that component's own doc comment). `editorSession` forces a fresh
  // mount of that isolated session on every open, so its local form always
  // starts from the just-captured snapshot rather than stale prior edits.
  const [editing, setEditing] = React.useState(false);
  const [editorSession, setEditorSession] = React.useState(0);
  const [snapshot, setSnapshot] = React.useState<SectionInput>(
    () => structuredClone(getValues(prefix)) as SectionInput,
  );

  function openEditor() {
    setSnapshot(structuredClone(getValues(prefix)) as SectionInput);
    setEditorSession((session) => session + 1);
    setEditing(true);
  }

  // "Finish section" is the only path that writes the modal's local edits
  // into this (parent) form — every other dismissal reports "cancel" and
  // nothing here changes, which is what makes Cancel/X/Escape/outside-click
  // all revert to the pre-open snapshot: the snapshot was never overwritten
  // in the first place.
  function handleEditorClose(result: SectionEditorResult) {
    setEditing(false);
    if (result.action !== "finish") return;
    setValue(`${prefix}.name`, result.values.name, { shouldDirty: true });
    setValue(`${prefix}.guidanceNote`, result.values.guidanceNote, {
      shouldDirty: true,
    });
    ingredients.replace(result.values.ingredients);
    instructions.replace(result.values.instructions);
    partLinks.replace(result.values.partLinks);
  }

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
  // This still operates directly on the parent form (not the modal's
  // isolated session) — an already-attached linked Part is shown and
  // detached from this collapsed card, not from inside the Section modal.
  // Section-editor refinement pass: Instructions and nested PartLinks now
  // share one merged ordering sequence (`sectionContentSequence`) instead of
  // each owning an independent position space — a freshly detached
  // occurrence's content must be seeded into the next free slots in *that*
  // shared sequence, not just `partLinks.fields.length`, or it would land at
  // a position that collides with this Section's own existing instructions.
  function nextMergedPosition(): number {
    const currentInstructions = getValues(
      `${prefix}.instructions`,
    ) as InstructionInput[];
    const currentPartLinks = getValues(
      `${prefix}.partLinks`,
    ) as PartLinkInput[];
    const positions = [
      ...currentInstructions.map((instruction, index) =>
        instruction.position != null ? instruction.position : index,
      ),
      ...currentPartLinks.map((link) => link.position),
    ];
    return positions.length === 0 ? 0 : Math.max(...positions) + 1;
  }

  function handleDetach(partLinkIndex: number, content: DetachedContent) {
    // `useFieldArray`'s `.fields` doesn't update synchronously between
    // multiple `.append()` calls in one handler, so a running counter (not
    // re-read each time) is what keeps each newly-appended occurrence's
    // position distinct.
    let nextPosition = nextMergedPosition();
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

  const label = sectionName || `section ${sectionNumber}`;
  const sectionNumberLabel = `Section ${sectionNumber}`;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4"
    >
      {/* Design remediation pass: full-width header row — drag handle far
          left, a live numbered title, actions far right. Clicking the Edit
          action opens the Section editor in a modal (below) rather than
          expanding this row inline; this collapsed representation is the
          parent page's permanent view of the Section, updated only when
          the modal session is Finished. */}
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
          <TooltipIconButton
            label={`Duplicate ${label}`}
            tooltip={`Duplicate ${label} — inserts an independent copy right after it`}
            icon={Copy}
            onClick={onDuplicate}
          />
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
            onToggleCollapsed={openEditor}
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
          explicit Edit action above, which opens the Section modal. */}
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

      <SectionEditorDialog
        key={editorSession}
        open={editing}
        initialValues={snapshot}
        sectionNumber={sectionNumber}
        containerDishId={containerDishId}
        containerKind={containerKind}
        onClose={handleEditorClose}
      />
    </div>
  );
}
