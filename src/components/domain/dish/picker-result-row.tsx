import { DishKindBadge } from "@/components/domain/dish/dish-kind-badge";
import { SemanticChip } from "@/components/domain/dish/semantic-chip";
import { cn } from "@/lib/utils";
import type { DishKindValue } from "@/lib/dishes/schema";

const MAX_VISIBLE_TAGS = 3;

/**
 * Restrained tag display for the Attach-a-part picker — a handful of
 * neutral chips plus a compact "+N" overflow indicator, so a heavily-tagged
 * item never blows out the row height.
 */
function PickerTagList({
  tags,
  selected,
}: {
  tags: string[];
  selected?: boolean;
}) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflow = tags.length - shown.length;
  const selectedBorder = selected ? "border-primary/40" : undefined;
  return (
    <>
      {shown.map((tag) => (
        <SemanticChip key={tag} semantic="neutral" className={selectedBorder}>
          {tag}
        </SemanticChip>
      ))}
      {overflow > 0 && (
        <SemanticChip semantic="neutral" className={selectedBorder}>
          +{overflow}
        </SemanticChip>
      )}
    </>
  );
}

/**
 * One clickable result row for the Attach-a-part picker. `kind` renders the
 * Recipe/Part distinction badge when given (the Attach-a-part picker omits
 * it — only Parts are ever candidates there); `selected` renders a selected
 * state for pickers where clicking selects rather than immediately
 * confirming.
 */
export function PickerResultRow({
  title,
  kind,
  tags,
  selected,
  onSelect,
}: {
  title: string;
  kind?: DishKindValue;
  tags: string[];
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "focus-visible:ring-ring flex cursor-pointer flex-col gap-1 rounded-md px-3 py-2 text-left text-sm outline-none focus-visible:ring-2",
        selected
          ? "bg-primary/10 ring-primary ring-1"
          : "hover:bg-muted focus-visible:bg-muted",
      )}
    >
      <span className="font-medium">{title}</span>
      {(kind || tags.length > 0) && (
        <span className="flex flex-wrap items-center gap-1">
          {kind && <DishKindBadge kind={kind} selected={selected} />}
          <PickerTagList tags={tags} selected={selected} />
        </span>
      )}
    </button>
  );
}
