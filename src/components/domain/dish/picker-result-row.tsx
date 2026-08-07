import { Badge } from "@/components/ui/badge";
import { DishKindBadge } from "@/components/domain/dish/dish-kind-badge";
import { cn } from "@/lib/utils";
import type { DishKindValue } from "@/lib/dishes/schema";

const MAX_VISIBLE_TAGS = 3;

/**
 * Restrained tag display shared by the Attach-a-part and Start-cooking
 * pickers — a handful of Badges plus a compact "+N" overflow indicator, so a
 * heavily-tagged item never blows out the row height.
 */
function PickerTagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, MAX_VISIBLE_TAGS);
  const overflow = tags.length - shown.length;
  return (
    <>
      {shown.map((tag) => (
        <Badge key={tag} variant="outline">
          {tag}
        </Badge>
      ))}
      {overflow > 0 && (
        <Badge variant="outline" className="text-muted-foreground">
          +{overflow}
        </Badge>
      )}
    </>
  );
}

/**
 * One clickable result row, shared by the Attach-a-part and Start-cooking
 * pickers. `kind` renders the Recipe/Part distinction badge when given (the
 * Attach-a-part picker omits it — only Parts are ever candidates there);
 * `selected` renders a selected state for pickers where clicking selects
 * rather than immediately confirming.
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
          {kind && <DishKindBadge kind={kind} />}
          <PickerTagList tags={tags} />
        </span>
      )}
    </button>
  );
}
